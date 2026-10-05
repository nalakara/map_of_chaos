/**
 * Candidate Generation for Entity Resolution
 * Generates candidate matches across exact canonical names, aliases, registered handles,
 * relational assertions, and lexical overlaps.
 *
 * CRITICAL RULE: Candidate generation only surfaces candidates; it has ZERO authority to merge.
 */

import { Entity, Mention } from '../../domain/types';
import { isUserSelfReference } from '../extraction/normalizer';
import {
  CandidateMatch,
  ResolutionContext,
  USER_SELF_ENTITY_ID,
} from './types';

export class CandidateGenerator {
  /**
   * Generates candidate matches for a mention from existing entities and context.
   */
  static generateCandidates(
    mention: Mention,
    context: ResolutionContext
  ): CandidateMatch[] {
    const candidates: CandidateMatch[] = [];
    const normalizedSurface = mention.normalizedForm;

    // 1. User Self Anchoring ("saya", "aku", "me")
    if (isUserSelfReference(mention.surfaceForm)) {
      const userEntity = context.existingEntities.find(
        (e) => e.id === USER_SELF_ENTITY_ID
      ) || {
        id: USER_SELF_ENTITY_ID,
        canonicalName: 'User',
        aliases: ['saya', 'aku', 'gue', 'gw', 'me', 'i'],
        associatedHandles: [],
        epistemicStatus: 'verified' as const,
        resolutionStatus: 'resolved' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      return [
        {
          entity: userEntity,
          matchType: 'user_self',
          score: 1.0,
          signals: ['pronoun_user_self'],
          typeCompatibility: 'compatible',
        },
      ];
    }

    // 2. Scan existing entities
    for (const entity of context.existingEntities) {
      if (entity.id === USER_SELF_ENTITY_ID) continue;

      const entityCanonicalLower = entity.canonicalName.toLowerCase();
      const entityHandles = entity.associatedHandles.map((h) =>
        h.toLowerCase().replace(/^@/, '')
      );
      const entityAliases = entity.aliases.map((a) => a.toLowerCase());

      // Helper: check type compatibility
      const typeCompat = CandidateGenerator.checkTypeCompatibility(
        mention,
        entity,
        context
      );

      // Check Exact Registered Handle match
      if (
        entityHandles.includes(normalizedSurface.replace(/^@/, '')) ||
        entityHandles.includes(mention.surfaceForm.toLowerCase().replace(/^@/, ''))
      ) {
        candidates.push({
          entity,
          matchType: 'exact_handle',
          score: 0.95,
          signals: ['exact_registered_handle'],
          typeCompatibility: typeCompat,
        });
        continue;
      }

      // Check Exact Canonical Name match
      if (entityCanonicalLower === normalizedSurface) {
        candidates.push({
          entity,
          matchType: 'exact_canonical',
          score: 0.95,
          signals: ['exact_canonical_name'],
          typeCompatibility: typeCompat,
        });
        continue;
      }

      // Check Exact Alias match
      if (entityAliases.includes(normalizedSurface)) {
        candidates.push({
          entity,
          matchType: 'exact_alias',
          score: 0.9,
          signals: ['exact_registered_alias'],
          typeCompatibility: typeCompat,
        });
        continue;
      }

      // Check Explicit Relational Claims in current extraction or context
      const hasExplicitLink = CandidateGenerator.hasExplicitRelationalLink(
        mention,
        entity,
        context
      );
      if (hasExplicitLink) {
        candidates.push({
          entity,
          matchType: 'exact_handle',
          score: 0.95,
          signals: ['explicit_relational_link'],
          typeCompatibility: typeCompat,
        });
        continue;
      }

      // Check Lexical Overlap / Substring (e.g. "Apple" vs "Apple Indonesia")
      // Weak signal only
      if (
        entityCanonicalLower.includes(normalizedSurface) ||
        normalizedSurface.includes(entityCanonicalLower)
      ) {
        candidates.push({
          entity,
          matchType: 'lexical_similarity',
          score: 0.6,
          signals: ['lexical_similarity_only'],
          typeCompatibility: typeCompat,
        });
      }
    }

    return candidates;
  }

  /**
   * Evaluates type compatibility between mention hint and entity profile.
   * Utilizes in-flight candidate type hints, extraction claims, and persisted context claims.
   */
  static checkTypeCompatibility(
    mention: Mention,
    entity: Entity,
    context: ResolutionContext
  ): 'compatible' | 'mismatch' | 'unknown' {
    if (!mention.candidateTypeHint) return 'compatible';

    // 1. Direct typeHint from simulated/in-flight entities
    const entityTypeHint = (entity as any).typeHint;
    if (entityTypeHint) {
      if (mention.candidateTypeHint === 'company' && entityTypeHint === 'social_handle') {
        return 'mismatch';
      }
      if (mention.candidateTypeHint === 'social_handle' && entityTypeHint === 'company') {
        return 'mismatch';
      }
    }

    // 2. Evaluate existing claims explicitly grounded to this entity ID
    const entityClaims = context.existingClaims.filter(
      (c) =>
        c.subjectEntityId === entity.id ||
        (c.objectValue.type === 'entity_id' && c.objectValue.value === entity.id)
    );

    const isCompanyByClaim = entityClaims.some(
      (c) =>
        c.predicate === 'operates_business' ||
        c.predicate === 'operates_in_sector' ||
        c.predicate === 'focuses_on_domain'
    );

    const isSocialHandleByClaim =
      entityClaims.some(
        (c) =>
          c.predicate === 'owns_social_account' ||
          c.predicate === 'has_social_account'
      ) && !isCompanyByClaim;

    const isSocialHandleByEntity =
      entity.associatedHandles
        .map((h) => h.toLowerCase())
        .includes(entity.canonicalName.toLowerCase()) && !isCompanyByClaim;

    if (mention.candidateTypeHint === 'social_handle' && isCompanyByClaim) {
      return 'mismatch';
    }
    if (
      mention.candidateTypeHint === 'company' &&
      (isSocialHandleByClaim || isSocialHandleByEntity)
    ) {
      return 'mismatch';
    }

    // 3. For in-flight simulated entities in the same dump without existing claims
    if (context.currentExtraction?.claims) {
      const inFlightCompany = context.currentExtraction.claims.some(
        (c) =>
          c.subjectMentionSurface?.toLowerCase() === entity.canonicalName.toLowerCase() &&
          (c.predicate === 'operates_business' ||
            c.predicate === 'operates_in_sector' ||
            c.predicate === 'focuses_on_domain')
      );
      if (mention.candidateTypeHint === 'social_handle' && inFlightCompany) {
        return 'mismatch';
      }

      const inFlightHandle = context.currentExtraction.claims.some(
        (c) =>
          c.objectMentionSurface?.toLowerCase() === entity.canonicalName.toLowerCase() &&
          (c.predicate === 'owns_social_account' || c.predicate === 'has_social_account')
      );
      if (mention.candidateTypeHint === 'company' && inFlightHandle && !inFlightCompany) {
        return 'mismatch';
      }
    }

    return 'compatible';
  }

  /**
   * Checks if an explicit relational claim links this mention to the candidate entity.
   */
  private static hasExplicitRelationalLink(
    mention: Mention,
    entity: Entity,
    context: ResolutionContext
  ): boolean {
    const claims = [
      ...(context.currentExtraction?.claims || []),
      ...context.existingClaims,
    ];

    for (const c of claims) {
      // Check subject/object mention surfaces or entity IDs
      const subjectMatches =
        ('subjectMentionSurface' in c &&
          c.subjectMentionSurface?.toLowerCase() === entity.canonicalName.toLowerCase()) ||
        ('subjectEntityId' in c && c.subjectEntityId === entity.id);

      const objectMatches =
        ('objectMentionSurface' in c &&
          c.objectMentionSurface?.toLowerCase() === mention.surfaceForm.toLowerCase()) ||
        ('objectValue' in c &&
          c.objectValue.value?.toLowerCase() === mention.surfaceForm.toLowerCase());

      if (subjectMatches && objectMatches && c.predicate === 'has_social_account') {
        return true;
      }
    }

    return false;
  }
}
