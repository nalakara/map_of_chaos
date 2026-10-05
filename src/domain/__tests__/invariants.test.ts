import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isEvidenceGroundedInDump,
  isMentionGrounded,
  canAutoMergeEntities,
  evaluateClaimConflict,
  isClaimActiveInCurrentContext,
} from '../invariants';
import { Claim, Dump, Entity, Evidence, Mention } from '../types';

describe('Domain Invariants Suite', () => {
  it('validates evidence grounding in raw dump', () => {
    const dump: Dump = {
      id: 'dump-1',
      rawText: 'Saya punya akun Instagram nalakara.id.',
      createdAt: '2026-10-05T10:00:00Z',
      source: 'web_dock',
      processingStatus: 'captured',
    };

    const validEvidence: Evidence = {
      id: 'ev-1',
      dumpId: 'dump-1',
      textSpan: 'nalakara.id',
      startOffset: 26,
      endOffset: 37,
      createdAt: '2026-10-05T10:00:00Z',
    };

    assert.equal(isEvidenceGroundedInDump(validEvidence, dump), true);

    const invalidEvidence: Evidence = {
      ...validEvidence,
      textSpan: 'different_text',
    };
    assert.equal(isEvidenceGroundedInDump(invalidEvidence, dump), false);
  });

  it('validates mention grounding in evidence text', () => {
    const evidence: Evidence = {
      id: 'ev-1',
      dumpId: 'dump-1',
      textSpan: 'Nalakara adalah lini usaha teknologi',
      startOffset: 0,
      endOffset: 36,
      createdAt: '2026-10-05T10:00:00Z',
    };

    const mention: Mention = {
      id: 'men-1',
      evidenceId: 'ev-1',
      dumpId: 'dump-1',
      surfaceForm: 'Nalakara',
      normalizedForm: 'nalakara',
      createdAt: '2026-10-05T10:00:00Z',
    };

    assert.equal(isMentionGrounded(mention, evidence), true);
  });

  it('prohibits automatic merge on lexical similarity alone', () => {
    const mention: Mention = {
      id: 'men-freshbeda',
      evidenceId: 'ev-1',
      dumpId: 'dump-1',
      surfaceForm: 'freshbeda',
      normalizedForm: 'freshbeda',
      createdAt: '2026-10-05T10:00:00Z',
    };

    const entity: Entity = {
      id: 'ent-freshbeda-biz',
      canonicalName: 'Freshbeda',
      aliases: [],
      associatedHandles: [],
      epistemicStatus: 'verified',
      resolutionStatus: 'resolved',
      createdAt: '2026-10-05T10:00:00Z',
      updatedAt: '2026-10-05T10:00:00Z',
    };

    // Lexical similarity alone CANNOT merge
    const canMerge = canAutoMergeEntities(mention, entity, 'lexical_similarity', false);
    assert.equal(canMerge, false);

    // Explicit human claim CAN merge
    const canMergeWithClaim = canAutoMergeEntities(mention, entity, 'lexical_similarity', true);
    assert.equal(canMergeWithClaim, true);

    // Exact handle match when registered CAN merge
    const entityWithHandle = { ...entity, associatedHandles: ['freshbeda'] };
    assert.equal(canAutoMergeEntities(mention, entityWithHandle, 'exact_handle', false), true);
  });

  it('evaluates temporal shifts vs direct contradictions', () => {
    const pastClaim: Claim = {
      id: 'cl-1',
      subjectEntityId: 'ent-nalakara',
      predicate: 'focuses_on',
      objectValue: { type: 'literal', value: 'visual design' },
      temporalScope: 'past',
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

    const presentClaim: Claim = {
      ...pastClaim,
      id: 'cl-2',
      objectValue: { type: 'literal', value: 'AI' },
      temporalScope: 'present',
    };

    // Past vs Present = temporal shift, NOT a data error
    assert.equal(evaluateClaimConflict(pastClaim, presentClaim), 'temporal_shift');

    const conflictingPresentClaim: Claim = {
      ...presentClaim,
      id: 'cl-3',
      objectValue: { type: 'literal', value: 'baking' },
      temporalScope: 'present', // Same temporal scope with different value = direct contradiction
    };
    assert.equal(evaluateClaimConflict(presentClaim, conflictingPresentClaim), 'direct_contradiction');

    // Reinforcing evidence = none
    const sameClaim: Claim = { ...presentClaim, id: 'cl-4' };
    assert.equal(evaluateClaimConflict(presentClaim, sameClaim), 'none');
  });

  it('determines active claims in current context', () => {
    const pastClaim: Claim = {
      id: 'cl-1',
      subjectEntityId: 'ent-1',
      predicate: 'focuses_on',
      objectValue: { type: 'literal', value: 'old topic' },
      temporalScope: 'past',
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

    // Past claim is historical, so not active in current context
    assert.equal(isClaimActiveInCurrentContext(pastClaim), false);

    // Present claim is active
    const presentClaim = { ...pastClaim, temporalScope: 'present' as const };
    assert.equal(isClaimActiveInCurrentContext(presentClaim), true);

    // Rejected claim is inactive
    const rejectedClaim = { ...presentClaim, reviewState: 'rejected' as const };
    assert.equal(isClaimActiveInCurrentContext(rejectedClaim), false);
  });
});
