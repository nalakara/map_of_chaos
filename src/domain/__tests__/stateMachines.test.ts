import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createEntityResolution,
  applyResolutionOverride,
  rebindClaimEntity,
  canTransitionClaimReview,
  transitionClaimReviewState,
  reconcileClaimWithReprocessing,
} from '../stateMachines';
import { Claim, EntityResolution, HumanOverride } from '../types';

describe('State Machines Suite', () => {
  it('creates active resolution records', () => {
    const res = createEntityResolution({
      mentionId: 'men-1',
      outcome: 'matched_existing',
      targetEntityId: 'ent-1',
      confidence: 0.95,
      rationale: 'Exact handle match',
      createdBy: 'machine',
    });

    assert.equal(res.status, 'active');
    assert.equal(res.targetEntityId, 'ent-1');
    assert.equal(res.createdBy, 'machine');
  });

  it('applies human override and supersedes previous resolution without deleting history', () => {
    const prevResolution: EntityResolution = {
      id: 'res-old',
      mentionId: 'men-1',
      targetEntityId: 'ent-wrong',
      outcome: 'matched_existing',
      confidence: 0.7,
      rationale: 'Algorithm guess',
      createdBy: 'machine',
      status: 'active',
      createdAt: '2026-10-05T10:00:00Z',
    };

    const override: HumanOverride = {
      id: 'ov-1',
      targetType: 'entity_resolution',
      targetId: 'men-1',
      action: 'bind_to_entity',
      payload: { targetEntityId: 'ent-correct', outcome: 'matched_existing' },
      userNotes: 'User explicitly designated correct entity',
      createdAt: '2026-10-05T10:05:00Z',
    };

    const { supersededResolution, newResolution } = applyResolutionOverride(
      prevResolution,
      override
    );

    assert.equal(supersededResolution?.status, 'superseded');
    assert.equal(supersededResolution?.id, 'res-old');

    assert.equal(newResolution.status, 'active');
    assert.equal(newResolution.targetEntityId, 'ent-correct');
    assert.equal(newResolution.createdBy, 'human_override');
    assert.equal(newResolution.confidence, 1.0);
  });

  it('re-binds claim entity with audit trail while preserving evidence', () => {
    const originalClaim: Claim = {
      id: 'cl-1',
      subjectEntityId: 'ent-old',
      predicate: 'is_a',
      objectValue: { type: 'literal', value: 'business_line' },
      temporalScope: 'present',
      observationTime: '2026-10-05T10:00:00Z',
      sourceOrigin: 'human_stated',
      reviewState: 'extracted',
      dumpId: 'dump-1',
      evidenceId: 'ev-1',
      supportingEvidenceIds: ['ev-1'],
      status: 'active',
      createdAt: '2026-10-05T10:00:00Z',
      updatedAt: '2026-10-05T10:00:00Z',
    };

    const { updatedClaim, auditRecord } = rebindClaimEntity(
      originalClaim,
      'ent-new',
      'res-new-01'
    );

    // Subject entity updated
    assert.equal(updatedClaim.subjectEntityId, 'ent-new');
    // Evidence intact
    assert.equal(updatedClaim.evidenceId, 'ev-1');
    assert.equal(updatedClaim.dumpId, 'dump-1');

    // Audit record correctly logged
    assert.equal(auditRecord.claimId, 'cl-1');
    assert.equal(auditRecord.previousEntityId, 'ent-old');
    assert.equal(auditRecord.newEntityId, 'ent-new');
    assert.equal(auditRecord.resolutionId, 'res-new-01');
  });

  it('enforces claim review state transitions and forbids demoting human decisions', () => {
    assert.equal(canTransitionClaimReview('extracted', 'human_confirmed'), true);
    assert.equal(canTransitionClaimReview('extracted', 'needs_review'), true);
    assert.equal(canTransitionClaimReview('extracted', 'rejected'), true);

    assert.equal(canTransitionClaimReview('needs_review', 'human_confirmed'), true);
    assert.equal(canTransitionClaimReview('needs_review', 'rejected'), true);

    // Human confirmed CANNOT be demoted back to extracted or needs_review
    assert.equal(canTransitionClaimReview('human_confirmed', 'extracted'), false);
    assert.equal(canTransitionClaimReview('human_confirmed', 'needs_review'), false);

    // Rejected is terminal for that machine claim
    assert.equal(canTransitionClaimReview('rejected', 'extracted'), false);

    const claim: Claim = {
      id: 'cl-1',
      subjectEntityId: 'ent-1',
      predicate: 'is_a',
      objectValue: { type: 'literal', value: 'business_line' },
      temporalScope: 'present',
      observationTime: '2026-10-05T10:00:00Z',
      sourceOrigin: 'human_stated',
      reviewState: 'extracted',
      dumpId: 'dump-1',
      evidenceId: 'ev-1',
      supportingEvidenceIds: ['ev-1'],
      status: 'active',
      createdAt: '2026-10-05T10:00:00Z',
      updatedAt: '2026-10-05T10:00:00Z',
    };

    const confirmed = transitionClaimReviewState(claim, 'human_confirmed');
    assert.equal(confirmed.reviewState, 'human_confirmed');

    // Attempting to overwrite human_confirmed throws
    assert.throws(() => {
      transitionClaimReviewState(confirmed, 'extracted');
    });
  });

  it('guarantees reprocessing locks human decisions and reinforces evidence', () => {
    const humanClaim: Claim = {
      id: 'cl-1',
      subjectEntityId: 'ent-1',
      predicate: 'is_a',
      objectValue: { type: 'literal', value: 'business_line' },
      temporalScope: 'present',
      observationTime: '2026-10-05T10:00:00Z',
      sourceOrigin: 'human_stated',
      reviewState: 'human_confirmed', // User verified this
      dumpId: 'dump-1',
      evidenceId: 'ev-1',
      supportingEvidenceIds: ['ev-1'],
      status: 'active',
      createdAt: '2026-10-05T10:00:00Z',
      updatedAt: '2026-10-05T10:00:00Z',
    };

    // Reprocessing finds new supporting evidence ev-2
    const result = reconcileClaimWithReprocessing(humanClaim, 'ev-2');

    assert.equal(result.wasMutated, true);
    assert.equal(result.claim.reviewState, 'human_confirmed'); // State remains locked!
    assert.deepEqual(result.claim.supportingEvidenceIds, ['ev-1', 'ev-2']); // Evidence reinforced
  });
});
