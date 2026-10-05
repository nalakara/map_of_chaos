/**
 * Domain Invariants & Validation Helpers for Map of Chaos
 * Enforces contracts:
 * - Human evidence is immutable
 * - Lexical similarity has zero authority to auto-merge
 * - Temporal scope is distinct from observation time
 * - Qualifiers preserve human nuance
 */

import {
  Claim,
  ClaimQualifiers,
  Dump,
  Entity,
  Evidence,
  Mention,
  TemporalScope,
} from './types';

// ==========================================
// 1. Core Invariants
// ==========================================

/**
 * Checks whether text span exists in dump raw text
 */
export function isEvidenceGroundedInDump(evidence: Evidence, dump: Dump): boolean {
  if (evidence.dumpId !== dump.id) return false;
  const slice = dump.rawText.slice(evidence.startOffset, evidence.endOffset);
  return slice === evidence.textSpan;
}

/**
 * Validates that an entity mention is bound to valid evidence
 */
export function isMentionGrounded(mention: Mention, evidence: Evidence): boolean {
  if (mention.evidenceId !== evidence.id) return false;
  return evidence.textSpan.toLowerCase().includes(mention.normalizedForm);
}

/**
 * Checks whether a candidate merge has sufficient evidence beyond lexical overlap.
 * Lexical similarity alone CANNOT authorize an automated merge.
 */
export function canAutoMergeEntities(
  sourceMention: Mention,
  targetEntity: Entity,
  matchType: 'exact_handle' | 'canonical_name' | 'alias' | 'lexical_similarity',
  hasExplicitLinkClaim: boolean
): boolean {
  // Explicit human link claim always authorizes resolution
  if (hasExplicitLinkClaim) return true;

  // Exact registered handles or exact alias matches can bind if contextualized
  if (matchType === 'exact_handle') {
    return targetEntity.associatedHandles.includes(sourceMention.surfaceForm);
  }

  // Lexical similarity alone is strictly prohibited from authorizing an automatic merge
  if (matchType === 'lexical_similarity') {
    return false;
  }

  // Exact canonical name match can merge only if not flagged as ambiguous
  if (matchType === 'canonical_name') {
    return (
      targetEntity.canonicalName.toLowerCase() === sourceMention.normalizedForm &&
      targetEntity.resolutionStatus !== 'ambiguous'
    );
  }

  return false;
}

// ==========================================
// 2. Temporal & Contradiction Invariants
// ==========================================

/**
 * Checks whether two sets of ClaimQualifiers are semantically equivalent.
 * Ensures qualifiers like quantity, degree, purpose, modality, etc. are not ignored during deduplication.
 */
export function areQualifiersEquivalent(
  q1?: ClaimQualifiers,
  q2?: ClaimQualifiers
): boolean {
  if (!q1 && !q2) return true;
  if (!q1 || !q2) {
    const defined = q1 || q2;
    // If one is empty object and the other undefined, they are equivalent
    return Object.values(defined!).every((v) => v === undefined);
  }

  const keys: Array<keyof ClaimQualifiers> = [
    'quantity',
    'partitivity',
    'purpose',
    'modality',
    'degree',
    'condition',
    'category',
    'platform',
  ];

  for (const key of keys) {
    if (q1[key] !== q2[key]) {
      return false;
    }
  }

  return true;
}

/**
 * Determines if two claims on the same entity and predicate conflict,
 * and whether the conflict represents a temporal shift/evolution or a direct contradiction.
 * Distinguishes observationTime (when asserted) from temporalScope (period referred to).
 */
export function evaluateClaimConflict(
  existingClaim: Claim,
  newClaim: Claim
): 'none' | 'temporal_shift' | 'direct_contradiction' {
  if (existingClaim.subjectEntityId !== newClaim.subjectEntityId) return 'none';
  if (existingClaim.predicate !== newClaim.predicate) return 'none';

  // If object values and qualifiers are identical, it is reinforcing evidence, not a conflict
  const isObjectEqual =
    existingClaim.objectValue.type === newClaim.objectValue.type &&
    existingClaim.objectValue.value === newClaim.objectValue.value;
  const isQualifiersEqual = areQualifiersEquivalent(
    existingClaim.qualifiers,
    newClaim.qualifiers
  );

  if (isObjectEqual && isQualifiersEqual) {
    return 'none';
  }

  // Different object values or qualifiers with different temporal scopes = temporal shift
  // e.g. 'used to' (past) vs 'now' (present)
  if (existingClaim.temporalScope !== newClaim.temporalScope) {
    return 'temporal_shift';
  }

  // If temporal scopes are the same (e.g. both 'present'), but observation times differ:
  // e.g. T1: "I have 2 coffee machines" vs T2: "I have 3 coffee machines"
  // Assertions made across different observation times represent state evolution, not direct contradiction.
  if (
    existingClaim.observationTime &&
    newClaim.observationTime &&
    existingClaim.observationTime !== newClaim.observationTime
  ) {
    return 'temporal_shift';
  }

  // Incompatible values or qualifiers within the SAME observation context and SAME temporal scope = direct contradiction
  return 'direct_contradiction';
}

/**
 * Determines whether a claim should be considered active in current context
 */
export function isClaimActiveInCurrentContext(claim: Claim): boolean {
  if (claim.status !== 'active') return false;
  if (claim.reviewState === 'rejected') return false;
  // Past claims are historical context, not current active facts
  if (claim.temporalScope === 'past') return false;
  return true;
}

/**
 * Validates temporal scope string
 */
export function isValidTemporalScope(scope: string): scope is TemporalScope {
  return ['past', 'present', 'future', 'recurring', 'timeless'].includes(scope);
}
