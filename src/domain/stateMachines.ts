/**
 * State Transition Machines for Entity Resolution and Claim Review
 * Enforces Contract Invariants:
 * - Human decisions strictly outrank machine reprocessing
 * - Revisable resolution re-binds claims with audit logs without destroying evidence
 * - Valid state transitions
 */

import {
  Claim,
  ClaimBindingAudit,
  EntityResolution,
  HumanOverride,
  ResolutionOutcome,
} from './types';

// ==========================================
// 1. Entity Resolution State Machine
// ==========================================

export interface CreateResolutionParams {
  mentionId: string;
  outcome: ResolutionOutcome;
  targetEntityId?: string;
  confidence: number;
  rationale: string;
  createdBy: 'machine' | 'human_override';
  candidateEntityIds?: string[];
  overrideReason?: string;
}

/**
 * Creates a new active EntityResolution record
 */
export function createEntityResolution(
  params: CreateResolutionParams,
  idGenerator: () => string = () => `res-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  timestamp: string = new Date().toISOString()
): EntityResolution {
  return {
    id: idGenerator(),
    mentionId: params.mentionId,
    targetEntityId: params.targetEntityId,
    outcome: params.outcome,
    confidence: params.confidence,
    rationale: params.rationale,
    createdBy: params.createdBy,
    status: 'active',
    candidateEntityIds: params.candidateEntityIds,
    overrideReason: params.overrideReason,
    createdAt: timestamp,
  };
}

/**
 * Applies a human override to a mention's resolution.
 * Supersedes previous active resolution, creates new resolution, and returns audit events.
 */
export function applyResolutionOverride(
  previousResolution: EntityResolution | null,
  override: HumanOverride,
  idGenerator: () => string = () => `res-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  timestamp: string = new Date().toISOString()
): {
  supersededResolution: EntityResolution | null;
  newResolution: EntityResolution;
} {
  const targetEntityId = override.payload.targetEntityId as string | undefined;
  const outcome = (override.payload.outcome as ResolutionOutcome) || 'matched_existing';

  const newResolution: EntityResolution = {
    id: idGenerator(),
    mentionId: override.targetId,
    targetEntityId,
    outcome,
    confidence: 1.0, // Human override has maximum epistemic confidence
    rationale: override.userNotes || 'Authoritative human override applied.',
    createdBy: 'human_override',
    status: 'active',
    overrideReason: override.userNotes,
    createdAt: timestamp,
  };

  const supersededResolution = previousResolution
    ? { ...previousResolution, status: 'superseded' as const }
    : null;

  return {
    supersededResolution,
    newResolution,
  };
}

/**
 * Re-binds a claim from previousEntityId to newEntityId following a revised resolution.
 * Supports both subject and object entity roles in relational claims.
 * Preserves the original evidence and logs a ClaimBindingAudit record.
 */
export function rebindClaimEntity(
  claim: Claim,
  newEntityId: string,
  resolutionId: string,
  role: 'subject' | 'object' = 'subject',
  idGenerator: () => string = () => `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  timestamp: string = new Date().toISOString()
): {
  updatedClaim: Claim;
  auditRecord: ClaimBindingAudit;
} {
  const previousEntityId =
    role === 'subject'
      ? claim.subjectEntityId
      : claim.objectValue.type === 'entity_id'
        ? claim.objectValue.value
        : '';

  const updatedClaim: Claim =
    role === 'subject'
      ? {
          ...claim,
          subjectEntityId: newEntityId,
          updatedAt: timestamp,
        }
      : {
          ...claim,
          objectValue: {
            ...claim.objectValue,
            type: 'entity_id',
            value: newEntityId,
          },
          updatedAt: timestamp,
        };

  const auditRecord: ClaimBindingAudit = {
    id: idGenerator(),
    claimId: claim.id,
    role,
    previousEntityId,
    newEntityId,
    resolutionId,
    timestamp,
  };

  return {
    updatedClaim,
    auditRecord,
  };
}

// ==========================================
// 2. Claim Review State Machine
// ==========================================

export type AllowedReviewTransition =
  | { from: 'extracted'; to: 'needs_review' | 'human_confirmed' | 'rejected' }
  | { from: 'needs_review'; to: 'human_confirmed' | 'rejected' }
  | { from: 'human_confirmed'; to: 'superseded' | 'retracted' };

/**
 * Evaluates whether a review state transition is permissible
 */
export function canTransitionClaimReview(
  currentState: Claim['reviewState'],
  targetState: Claim['reviewState']
): boolean {
  if (currentState === targetState) return true;

  switch (currentState) {
    case 'extracted':
      return ['needs_review', 'human_confirmed', 'rejected'].includes(targetState);
    case 'needs_review':
      return ['human_confirmed', 'rejected'].includes(targetState);
    case 'human_confirmed':
      // Confirmed claims cannot transition back to unconfirmed machine states
      return false;
    case 'rejected':
      // Terminal state for that machine extraction
      return false;
    default:
      return false;
  }
}

/**
 * Transitions a claim's review state if valid
 */
export function transitionClaimReviewState(
  claim: Claim,
  targetState: Claim['reviewState'],
  timestamp: string = new Date().toISOString()
): Claim {
  if (!canTransitionClaimReview(claim.reviewState, targetState)) {
    throw new Error(
      `Invalid review state transition from '${claim.reviewState}' to '${targetState}'. Human confirmed or rejected states cannot be overwritten.`
    );
  }

  return {
    ...claim,
    reviewState: targetState,
    updatedAt: timestamp,
  };
}

/**
 * Reconciles an existing claim with a new reprocessed claim candidate.
 * Guarantees that human decisions (confirmed or rejected) are NEVER overwritten by machine reprocessing.
 */
export function reconcileClaimWithReprocessing(
  existingClaim: Claim,
  reprocessedCandidateEvidenceId: string,
  timestamp: string = new Date().toISOString()
): {
  claim: Claim;
  wasMutated: boolean;
} {
  // If human has confirmed or rejected, the review state is locked
  if (existingClaim.reviewState === 'human_confirmed' || existingClaim.reviewState === 'rejected') {
    // If the reprocessed extraction found supporting evidence, add it without changing human decision
    if (!existingClaim.supportingEvidenceIds.includes(reprocessedCandidateEvidenceId)) {
      return {
        claim: {
          ...existingClaim,
          supportingEvidenceIds: [...existingClaim.supportingEvidenceIds, reprocessedCandidateEvidenceId],
          updatedAt: timestamp,
        },
        wasMutated: true,
      };
    }
    return { claim: existingClaim, wasMutated: false };
  }

  // If still unreviewed ('extracted' or 'needs_review'), reinforce evidence
  if (!existingClaim.supportingEvidenceIds.includes(reprocessedCandidateEvidenceId)) {
    return {
      claim: {
        ...existingClaim,
        supportingEvidenceIds: [...existingClaim.supportingEvidenceIds, reprocessedCandidateEvidenceId],
        updatedAt: timestamp,
      },
      wasMutated: true,
    };
  }

  return { claim: existingClaim, wasMutated: false };
}
