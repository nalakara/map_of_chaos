/**
 * ContextStore - Central semantic memory facade for Map of Chaos
 * Implements IContextStore coordinating Repositories, Domain Invariants, and State Machines.
 */

import {
  Claim,
  Entity,
  EntityResolution,
  HumanOverride,
  Mention,
} from '../domain/types';
import {
  areQualifiersEquivalent,
  evaluateClaimConflict,
  isClaimActiveInCurrentContext,
} from '../domain/invariants';
import {
  applyResolutionOverride,
  rebindClaimEntity,
  transitionClaimReviewState,
} from '../domain/stateMachines';
import { IStorageDriver, IndexedDBDriver, MemoryStorageDriver, openDatabase, STORES } from './db';
import { DumpRepository } from './dumpRepo';
import { EntityRepository } from './entityRepo';
import { ClaimRepository } from './claimRepo';
import { HumanOverrideRepository } from './overrideRepo';

export interface IContextStore {
  // Entity Operations
  getEntity(id: string): Promise<Entity | null>;
  getAllEntities(filter?: {
    epistemicStatus?: Entity['epistemicStatus'];
    resolutionStatus?: Entity['resolutionStatus'];
  }): Promise<Entity[]>;
  saveEntity(entity: Entity): Promise<void>;

  // Claim Operations (Additive)
  addClaim(claim: Claim): Promise<void>;
  enrichClaimEvidence(claimId: string, evidenceId: string): Promise<void>;
  getClaimsForEntity(entityId: string): Promise<Claim[]>;
  getAllClaims(): Promise<Claim[]>;
  getRelationalClaims(entityId: string): Promise<Claim[]>;

  // Temporal & Contradiction Queries
  getActiveClaims(entityId: string): Promise<Claim[]>;
  getHistoricalClaims(entityId: string): Promise<Claim[]>;
  detectContradictions(entityId: string): Promise<Array<{ claimA: Claim; claimB: Claim }>>;

  // Revision & Override Operations
  applyHumanOverride(override: HumanOverride): Promise<void>;
  rebindMention(mentionId: string, newEntityId: string, reason: string): Promise<void>;

  // Reset / Clear
  clear(): Promise<void>;
}

export class ContextStore implements IContextStore {
  readonly dumps: DumpRepository;
  readonly entities: EntityRepository;
  readonly claims: ClaimRepository;
  readonly overrides: HumanOverrideRepository;

  constructor(private driver: IStorageDriver) {
    this.dumps = new DumpRepository(driver);
    this.entities = new EntityRepository(driver);
    this.claims = new ClaimRepository(driver);
    this.overrides = new HumanOverrideRepository(driver);
  }

  // ==========================================
  // Entity Operations
  // ==========================================

  async getEntity(id: string): Promise<Entity | null> {
    return this.entities.getEntity(id);
  }

  async getAllEntities(filter?: {
    epistemicStatus?: Entity['epistemicStatus'];
    resolutionStatus?: Entity['resolutionStatus'];
  }): Promise<Entity[]> {
    const all = await this.entities.getAllEntities();
    return all.filter((e) => {
      if (filter?.epistemicStatus && e.epistemicStatus !== filter.epistemicStatus) {
        return false;
      }
      if (filter?.resolutionStatus && e.resolutionStatus !== filter.resolutionStatus) {
        return false;
      }
      return true;
    });
  }

  async saveEntity(entity: Entity): Promise<void> {
    await this.entities.saveEntity(entity);
  }

  async getAllResolutions(): Promise<EntityResolution[]> {
    return this.entities.getAllResolutions();
  }

  // ==========================================
  // Claim Operations (Additive Invariant)
  // ==========================================

  /**
   * Adds a claim to the context store.
   * If an identical claim exists (same subject, predicate, objectValue),
   * reinforces it by appending the supporting evidence without replacing the original.
   */
  async addClaim(claim: Claim): Promise<void> {
    const existingClaims = await this.claims.getClaimsBySubject(claim.subjectEntityId);
    const identical = existingClaims.find(
      (c) =>
        c.predicate === claim.predicate &&
        c.objectValue.type === claim.objectValue.type &&
        c.objectValue.value === claim.objectValue.value &&
        c.status === 'active' &&
        areQualifiersEquivalent(c.qualifiers, claim.qualifiers)
    );

    if (identical) {
      const allEv = new Set([
        ...identical.supportingEvidenceIds,
        claim.evidenceId,
        ...claim.supportingEvidenceIds,
      ]);
      identical.supportingEvidenceIds = Array.from(allEv);
      identical.updatedAt = new Date().toISOString();
      await this.claims.saveClaim(identical);
      return;
    }

    // Check for conflicts with existing active claims on this subject
    for (const ec of existingClaims.filter((c) => c.status === 'active')) {
      const conflictType = evaluateClaimConflict(ec, claim);
      if (conflictType === 'direct_contradiction') {
        claim.conflictState = 'direct_contradiction';
        claim.conflictingClaimIds = [...(claim.conflictingClaimIds || []), ec.id];

        ec.conflictState = 'direct_contradiction';
        ec.conflictingClaimIds = [...(ec.conflictingClaimIds || []), claim.id];
        await this.claims.saveClaim(ec);
      } else if (conflictType === 'temporal_shift') {
        claim.conflictState = 'temporal_shift';
      }
    }

    await this.claims.saveClaim(claim);
  }

  async enrichClaimEvidence(claimId: string, evidenceId: string): Promise<void> {
    const claim = await this.claims.getClaim(claimId);
    if (!claim) {
      throw new Error(`Claim with id ${claimId} not found.`);
    }

    if (!claim.supportingEvidenceIds.includes(evidenceId)) {
      claim.supportingEvidenceIds.push(evidenceId);
      claim.updatedAt = new Date().toISOString();
      await this.claims.saveClaim(claim);
    }
  }

  async getClaimsForEntity(entityId: string): Promise<Claim[]> {
    return this.claims.getClaimsBySubject(entityId);
  }

  async getAllClaims(): Promise<Claim[]> {
    return this.claims.getAllClaims();
  }

  async getRelationalClaims(entityId: string): Promise<Claim[]> {
    return this.claims.getRelationalClaims(entityId);
  }

  // ==========================================
  // Temporal & Contradiction Queries
  // ==========================================

  async getActiveClaims(entityId: string): Promise<Claim[]> {
    const all = await this.claims.getClaimsBySubject(entityId);
    return all.filter(isClaimActiveInCurrentContext);
  }

  async getHistoricalClaims(entityId: string): Promise<Claim[]> {
    const all = await this.claims.getClaimsBySubject(entityId);
    return all.filter((c) => c.temporalScope === 'past' && c.status === 'active');
  }

  async detectContradictions(entityId: string): Promise<Array<{ claimA: Claim; claimB: Claim }>> {
    const active = await this.getActiveClaims(entityId);
    const contradictions: Array<{ claimA: Claim; claimB: Claim }> = [];

    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const a = active[i];
        const b = active[j];
        if (evaluateClaimConflict(a, b) === 'direct_contradiction') {
          contradictions.push({ claimA: a, claimB: b });
        }
      }
    }

    return contradictions;
  }

  // ==========================================
  // Revision & Override Operations
  // ==========================================

  async applyHumanOverride(override: HumanOverride): Promise<void> {
    await this.overrides.saveOverride(override);

    if (override.targetType === 'entity_resolution' && override.action === 'bind_to_entity') {
      const mentionId = override.targetId;
      const targetEntityId = override.payload.targetEntityId as string;
      await this.rebindMention(mentionId, targetEntityId, override.userNotes || 'Human override');
    } else if (override.targetType === 'claim_review') {
      const claimId = override.targetId;
      const claim = await this.claims.getClaim(claimId);
      if (claim) {
        const nextState =
          override.action === 'confirm_claim' ? 'human_confirmed' : 'rejected';
        const updatedClaim = transitionClaimReviewState(claim, nextState);
        await this.claims.saveClaim(updatedClaim);
      }
    }
  }

  /**
   * Rebinds a mention to a new entity atomically within a multi-store transaction.
   * Updates mention, supersedes old resolution, creates human resolution,
   * rebinds all derived claims (both subject-side and object-side), and writes immutable ClaimBindingAudit records.
   */
  async rebindMention(
    mentionId: string,
    newEntityId: string,
    reason: string
  ): Promise<void> {
    const mention = await this.entities.getMention(mentionId);
    if (!mention) {
      throw new Error(`Mention with id ${mentionId} not found.`);
    }

    const currentResolution = await this.entities.getActiveResolutionForMention(mentionId);
    const override: HumanOverride = {
      id: `ovr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      targetType: 'entity_resolution',
      targetId: mentionId,
      action: 'bind_to_entity',
      payload: { targetEntityId: newEntityId, outcome: 'matched_existing' },
      userNotes: reason,
      createdAt: new Date().toISOString(),
    };

    const { supersededResolution, newResolution } = applyResolutionOverride(
      currentResolution,
      override
    );

    await this.driver.runTransaction(
      [
        STORES.ENTITY_RESOLUTIONS,
        STORES.CLAIMS,
        STORES.CLAIM_AUDITS,
        STORES.HUMAN_OVERRIDES,
      ],
      'readwrite',
      async (txDriver) => {
        const txEntities = new EntityRepository(txDriver);
        const txClaims = new ClaimRepository(txDriver);
        const txOverrides = new HumanOverrideRepository(txDriver);

        if (supersededResolution) {
          await txEntities.saveResolution(supersededResolution);
        }
        await txEntities.saveResolution(newResolution);
        await txOverrides.saveOverride(override);

        const oldEntityId = currentResolution?.targetEntityId;
        if (oldEntityId && oldEntityId !== newEntityId) {
          // 1. Rebind Subject-side Claims
          const subjectClaims = await txClaims.getClaimsBySubject(oldEntityId);
          const affectedSubjectClaims = subjectClaims.filter(
            (c) => c.subjectMentionId === mentionId || c.mentionId === mentionId
          );

          for (const claim of affectedSubjectClaims) {
            const { updatedClaim, auditRecord } = rebindClaimEntity(
              claim,
              newEntityId,
              newResolution.id,
              'subject'
            );
            await txClaims.saveClaim(updatedClaim);
            await txClaims.saveClaimAudit(auditRecord);
          }

          // 2. Rebind Object-side Claims
          const relationalClaims = await txClaims.getRelationalClaims(oldEntityId);
          const affectedObjectClaims = relationalClaims.filter(
            (c) =>
              c.objectMentionId === mentionId &&
              c.objectValue.type === 'entity_id' &&
              c.objectValue.value === oldEntityId
          );

          for (const claim of affectedObjectClaims) {
            const currentClaim = (await txClaims.getClaim(claim.id)) || claim;
            const { updatedClaim, auditRecord } = rebindClaimEntity(
              currentClaim,
              newEntityId,
              newResolution.id,
              'object'
            );
            await txClaims.saveClaim(updatedClaim);
            await txClaims.saveClaimAudit(auditRecord);
          }
        }
      }
    );
  }

  async clear(): Promise<void> {
    await this.driver.clear(STORES.ENTITIES);
    await this.driver.clear(STORES.CLAIMS);
    await this.driver.clear(STORES.DUMPS);
    await this.driver.clear(STORES.EVIDENCE);
    await this.driver.clear(STORES.MENTIONS);
    await this.driver.clear(STORES.ENTITY_RESOLUTIONS);
    await this.driver.clear(STORES.HUMAN_OVERRIDES);
    await this.driver.clear(STORES.CLAIM_AUDITS);
    await this.driver.clear(STORES.PROJECTION_CACHE);
  }
}

let defaultStoreInstance: ContextStore | null = null;

export async function getDefaultContextStore(): Promise<ContextStore> {
  if (defaultStoreInstance) return defaultStoreInstance;
  if (typeof window !== 'undefined' && window.indexedDB) {
    const db = await openDatabase();
    defaultStoreInstance = new ContextStore(new IndexedDBDriver(db));
  } else {
    defaultStoreInstance = new ContextStore(new MemoryStorageDriver());
  }
  return defaultStoreInstance;
}

export function resetDefaultContextStore(): void {
  defaultStoreInstance = null;
}
