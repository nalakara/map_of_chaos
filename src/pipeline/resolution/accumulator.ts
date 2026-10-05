/**
 * Context Accumulator
 * Coordinates Entity Resolution decisions and context accumulation into ContextStore.
 * Ensures:
 * - Mentions are resolved to persistent Entities or ambiguous states
 * - Claims are bound to resolved entity IDs
 * - Existing entities are enriched rather than duplicated
 * - Strict provenance and audit logging are maintained
 */

import {
  Claim,
  ClaimObjectValue,
  Entity,
  Mention,
} from '../../domain/types';
import { createEntityResolution } from '../../domain/stateMachines';
import { isUserSelfReference } from '../extraction/normalizer';
import { GroundedExtraction } from '../types';
import { ContextStore } from '../../storage/contextStore';
import { DeterministicEntityResolver } from './resolver';
import {
  AccumulationResult,
  IEntityResolver,
  ResolutionContext,
  ResolutionDecision,
  USER_SELF_ENTITY_ID,
} from './types';

export class ContextAccumulator {
  constructor(
    private contextStore: ContextStore,
    private resolver: IEntityResolver = new DeterministicEntityResolver()
  ) {}

  /**
   * Accumulates a GroundedExtraction into the persistent ContextStore:
   * 1. Resolves all mentions
   * 2. Mints new entities or updates existing entities
   * 3. Binds claims to resolved entities
   * 4. Enforces additive accumulation and conflict evaluation
   */
  async accumulate(grounded: GroundedExtraction): Promise<AccumulationResult> {
    const now = new Date().toISOString();

    // 1. Ensure user context entity exists
    await this.ensureUserEntity(now);

    // 2. Load existing context
    const existingEntities = await this.contextStore.getAllEntities();
    const allResolutions = await this.contextStore.getAllResolutions();

    // Load recent claims for context
    const existingClaims: Claim[] = [];
    for (const ent of existingEntities) {
      const entClaims = await this.contextStore.getClaimsForEntity(ent.id);
      existingClaims.push(...entClaims);
    }

    const resolutionContext: ResolutionContext = {
      existingEntities,
      existingClaims,
      existingResolutions: allResolutions,
      dump: grounded.dump,
      currentExtraction: grounded,
    };

    // 3. Resolve all mentions
    const decisionMap = await this.resolver.resolveAll(
      grounded.mentions,
      resolutionContext
    );

    const decisions: ResolutionDecision[] = [];
    const createdEntities: Entity[] = [];
    const updatedEntities: Entity[] = [];

    // 4. Process resolution decisions & persist entity records
    for (const mention of grounded.mentions) {
      const decision = decisionMap.get(mention.id);
      if (!decision) continue;
      decisions.push(decision);

      if (decision.outcome === 'new_entity' && decision.proposedEntity) {
        // Mint persistent entity ID with collision disambiguation
        const rawSlug = decision.proposedEntity.canonicalName
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '_')
          .replace(/^_+|_+$/g, '');
        let entityId = `ent-${rawSlug}`;

        let counter = 1;
        while (await this.contextStore.getEntity(entityId)) {
          if (decision.proposedEntity.typeHint) {
            const typedId = `ent-${rawSlug}-${decision.proposedEntity.typeHint}`;
            if (!(await this.contextStore.getEntity(typedId))) {
              entityId = typedId;
              break;
            }
          }
          counter++;
          entityId = `ent-${rawSlug}-${counter}`;
        }

        const newEntity: Entity = {
          id: entityId,
          canonicalName: decision.proposedEntity.canonicalName,
          aliases: decision.proposedEntity.aliases || [],
          associatedHandles: decision.proposedEntity.associatedHandles || [],
          epistemicStatus: 'unverified',
          resolutionStatus: 'resolved',
          createdAt: now,
          updatedAt: now,
        };
        await this.contextStore.saveEntity(newEntity);
        createdEntities.push(newEntity);
        decision.targetEntityId = newEntity.id;
      } else if (decision.outcome === 'associated_handle' && decision.associatedHandle) {
        // 1. If proposedEntity exists (minting new handle representation) and targetEntityId not yet assigned:
        if (!decision.targetEntityId && decision.proposedEntity) {
          const rawSlug = decision.proposedEntity.canonicalName
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '_')
            .replace(/^_+|_+$/g, '');
          let entityId = `ent-${rawSlug}`;
          let counter = 1;
          while (await this.contextStore.getEntity(entityId)) {
            counter++;
            entityId = `ent-${rawSlug}-${counter}`;
          }

          const newEntity: Entity = {
            id: entityId,
            canonicalName: decision.proposedEntity.canonicalName,
            aliases: decision.proposedEntity.aliases || [],
            associatedHandles: decision.proposedEntity.associatedHandles || [],
            epistemicStatus: 'unverified',
            resolutionStatus: 'resolved',
            createdAt: now,
            updatedAt: now,
          };
          await this.contextStore.saveEntity(newEntity);
          createdEntities.push(newEntity);
          decision.targetEntityId = newEntity.id;
        }

        // 2. Parent entity receives this handle in associatedHandles
        const parentEntityId = decision.associatedHandle.parentEntityId;
        if (parentEntityId) {
          const parentEntity = await this.contextStore.getEntity(parentEntityId);
          if (parentEntity) {
            const handle = decision.associatedHandle.handle;
            if (!parentEntity.associatedHandles.includes(handle)) {
              parentEntity.associatedHandles.push(handle);
              parentEntity.updatedAt = now;
              await this.contextStore.saveEntity(parentEntity);
              updatedEntities.push(parentEntity);
            }
          }
        }
      }

      // Persist EntityResolution record with reprocessing idempotency
      const existingRes = await this.contextStore.entities.getActiveResolutionForMention(
        decision.mentionId
      );

      if (existingRes) {
        // Human overrides are authoritative and cannot be superseded by machine reprocessing
        if (existingRes.createdBy === 'human_override') {
          continue;
        }

        // If an identical active machine resolution exists, keep it idempotently without creating duplicate records
        if (
          existingRes.outcome === decision.outcome &&
          existingRes.targetEntityId === decision.targetEntityId
        ) {
          continue;
        }

        // Supersede prior machine resolution
        existingRes.status = 'superseded';
        await this.contextStore.entities.saveResolution(existingRes);
      }

      const resRecord = createEntityResolution({
        mentionId: decision.mentionId,
        outcome: decision.outcome,
        targetEntityId: decision.targetEntityId,
        confidence: decision.confidence,
        rationale: decision.rationale,
        createdBy: 'machine',
        candidateEntityIds: decision.candidateEntityIds,
      });
      await this.contextStore.entities.saveResolution(resRecord);
    }

    // 5. Bind claims to resolved entities and accumulate
    const accumulatedClaims: Claim[] = [];

    for (const cCandidate of grounded.claims) {
      // Find subject entity
      let subjectEntityId: string | undefined;
      const subjMention = grounded.mentions.find(
        (m) =>
          m.surfaceForm.toLowerCase() ===
          cCandidate.subjectMentionSurface?.toLowerCase()
      );

      if (subjMention) {
        const decision = decisionMap.get(subjMention.id);
        subjectEntityId = decision?.targetEntityId;
      }

      if (!subjectEntityId && isUserSelfReference(cCandidate.subjectMentionSurface || 'saya')) {
        subjectEntityId = USER_SELF_ENTITY_ID;
      }

      // If subject entity cannot be determined, skip claim accumulation to prevent orphaned assertions
      if (!subjectEntityId) continue;

      // Determine object value & objectMentionId
      let objectValue: ClaimObjectValue = {
        type: cCandidate.objectValue.type === 'concept' ? 'concept' : 'literal',
        value: cCandidate.objectValue.value,
      };
      let objectMentionId: string | undefined;

      if (cCandidate.objectMentionSurface) {
        const objMention = grounded.mentions.find(
          (m) =>
            m.surfaceForm.toLowerCase() ===
            cCandidate.objectMentionSurface?.toLowerCase()
        );

        if (objMention) {
          objectMentionId = objMention.id;
          const objDecision = decisionMap.get(objMention.id);
          if (objDecision && objDecision.targetEntityId) {
            objectValue = {
              type: 'entity_id',
              value: objDecision.targetEntityId,
            };
          }
        }
      }

      // Build domain Claim
      const claimId = `clm-${grounded.dump.id}-${cCandidate.startOffset}-${cCandidate.endOffset}`;
      const evidenceId =
        cCandidate.evidenceId ||
        `ev-${grounded.dump.id}-${cCandidate.startOffset}-${cCandidate.endOffset}`;

      const claim: Claim = {
        id: claimId,
        subjectEntityId,
        predicate: cCandidate.predicate,
        objectValue,
        qualifiers: cCandidate.qualifiers,
        observationTime: grounded.dump.createdAt,
        temporalScope: cCandidate.temporalScope,
        sourceOrigin: 'human_stated',
        reviewState: 'extracted',
        dumpId: grounded.dump.id,
        subjectMentionId: subjMention?.id,
        objectMentionId,
        evidenceId,
        supportingEvidenceIds: [evidenceId],
        status: 'active',
        createdAt: now,
        updatedAt: now,
      };

      await this.contextStore.addClaim(claim);
      accumulatedClaims.push(claim);
    }

    return {
      dumpId: grounded.dump.id,
      decisions,
      createdEntities,
      updatedEntities,
      accumulatedClaims,
    };
  }

  /**
   * Ensures the singleton user context entity exists.
   */
  private async ensureUserEntity(timestamp: string): Promise<Entity> {
    const existing = await this.contextStore.getEntity(USER_SELF_ENTITY_ID);
    if (existing) return existing;

    const userEntity: Entity = {
      id: USER_SELF_ENTITY_ID,
      canonicalName: 'User',
      aliases: ['saya', 'aku', 'gue', 'gw', 'me', 'i'],
      associatedHandles: [],
      epistemicStatus: 'verified',
      resolutionStatus: 'resolved',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await this.contextStore.saveEntity(userEntity);
    return userEntity;
  }
}
