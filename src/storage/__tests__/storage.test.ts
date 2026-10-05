import { describe, it } from 'node:test';
import assert from 'node:assert';
import { MemoryStorageDriver } from '../db';
import { ContextStore } from '../contextStore';
import {
  Claim,
  Dump,
  Entity,
  Evidence,
  HumanOverride,
  Mention,
} from '../../domain/types';
import { createEntityResolution } from '../../domain/stateMachines';

describe('Storage Layer & ContextStore Integration', () => {
  it('persists dumps and ground evidence spans', async () => {
    const driver = new MemoryStorageDriver();
    const store = new ContextStore(driver);

    const rawText = 'Meeting with Borga tomorrow about the coffee machine at Tungku.';
    const dump: Dump = {
      id: 'dump-1',
      rawText,
      source: 'web_dock',
      createdAt: '2026-05-10T10:00:00Z',
      processingStatus: 'processed',
    };

    const ev1: Evidence = {
      id: 'ev-1',
      dumpId: 'dump-1',
      textSpan: 'coffee machine',
      startOffset: rawText.indexOf('coffee machine'),
      endOffset: rawText.indexOf('coffee machine') + 'coffee machine'.length,
      createdAt: '2026-05-10T10:00:00Z',
    };

    await store.dumps.saveDump(dump);
    await store.dumps.saveEvidence(ev1);

    const retrievedDump = await store.dumps.getDump('dump-1');
    assert.ok(retrievedDump);
    assert.strictEqual(retrievedDump?.rawText, rawText);

    const evidenceList = await store.dumps.getEvidenceForDump('dump-1');
    assert.strictEqual(evidenceList.length, 1);
    assert.strictEqual(evidenceList[0].textSpan, 'coffee machine');
  });

  it('enforces additive claim invariant and reinforces evidence on identical claims', async () => {
    const driver = new MemoryStorageDriver();
    const store = new ContextStore(driver);

    const entity: Entity = {
      id: 'ent-borga',
      canonicalName: 'Borga',
      aliases: ['Borga Coffee'],
      associatedHandles: ['@borga'],
      epistemicStatus: 'verified',
      resolutionStatus: 'resolved',
      createdAt: '2026-05-10T10:00:00Z',
      updatedAt: '2026-05-10T10:00:00Z',
    };
    await store.saveEntity(entity);

    const claim1: Claim = {
      id: 'claim-1',
      subjectEntityId: 'ent-borga',
      predicate: 'uses_machine',
      objectValue: { type: 'literal', value: 'La Marzocco Linea Mini' },
      sourceOrigin: 'ai_inferred',
      reviewState: 'extracted',
      observationTime: '2026-05-10T10:00:00Z',
      temporalScope: 'present',
      dumpId: 'dump-1',
      evidenceId: 'ev-1',
      supportingEvidenceIds: ['ev-1'],
      status: 'active',
      createdAt: '2026-05-10T10:00:00Z',
      updatedAt: '2026-05-10T10:00:00Z',
    };

    await store.addClaim(claim1);
    let claims = await store.getClaimsForEntity('ent-borga');
    assert.strictEqual(claims.length, 1);
    assert.deepStrictEqual(claims[0].supportingEvidenceIds, ['ev-1']);

    // Add identical claim from a second evidence source
    const claim2: Claim = {
      id: 'claim-2',
      subjectEntityId: 'ent-borga',
      predicate: 'uses_machine',
      objectValue: { type: 'literal', value: 'La Marzocco Linea Mini' },
      sourceOrigin: 'ai_inferred',
      reviewState: 'extracted',
      observationTime: '2026-05-11T12:00:00Z',
      temporalScope: 'present',
      dumpId: 'dump-2',
      evidenceId: 'ev-2',
      supportingEvidenceIds: ['ev-2'],
      status: 'active',
      createdAt: '2026-05-11T12:00:00Z',
      updatedAt: '2026-05-11T12:00:00Z',
    };

    await store.addClaim(claim2);

    claims = await store.getClaimsForEntity('ent-borga');
    // Still 1 claim record, but reinforced with both evidences
    assert.strictEqual(claims.length, 1);
    assert.strictEqual(claims[0].id, 'claim-1');
    assert.ok(claims[0].supportingEvidenceIds.includes('ev-1'));
    assert.ok(claims[0].supportingEvidenceIds.includes('ev-2'));
  });

  it('detects direct contradictions within the same temporal scope', async () => {
    const driver = new MemoryStorageDriver();
    const store = new ContextStore(driver);

    const claimA: Claim = {
      id: 'claim-loc-a',
      subjectEntityId: 'ent-borga',
      predicate: 'headquarters_location',
      objectValue: { type: 'literal', value: 'Oslo' },
      sourceOrigin: 'ai_inferred',
      reviewState: 'extracted',
      observationTime: '2026-05-10T10:00:00Z',
      temporalScope: 'present',
      dumpId: 'dump-1',
      evidenceId: 'ev-1',
      supportingEvidenceIds: ['ev-1'],
      status: 'active',
      createdAt: '2026-05-10T10:00:00Z',
      updatedAt: '2026-05-10T10:00:00Z',
    };

    const claimB: Claim = {
      id: 'claim-loc-b',
      subjectEntityId: 'ent-borga',
      predicate: 'headquarters_location',
      objectValue: { type: 'literal', value: 'Bergen' },
      sourceOrigin: 'ai_inferred',
      reviewState: 'extracted',
      observationTime: '2026-05-10T10:00:00Z',
      temporalScope: 'present',
      dumpId: 'dump-1',
      evidenceId: 'ev-2',
      supportingEvidenceIds: ['ev-2'],
      status: 'active',
      createdAt: '2026-05-10T10:00:00Z',
      updatedAt: '2026-05-10T10:00:00Z',
    };

    await store.addClaim(claimA);
    await store.addClaim(claimB);

    const contradictions = await store.detectContradictions('ent-borga');
    assert.strictEqual(contradictions.length, 1);
    assert.strictEqual(contradictions[0].claimA.id, 'claim-loc-a');
    assert.strictEqual(contradictions[0].claimB.id, 'claim-loc-b');

    // Both claims should be annotated with direct_contradiction
    const savedA = await store.claims.getClaim('claim-loc-a');
    const savedB = await store.claims.getClaim('claim-loc-b');
    assert.strictEqual(savedA?.conflictState, 'direct_contradiction');
    assert.strictEqual(savedB?.conflictState, 'direct_contradiction');
  });

  it('re-binds mention and derived claims to new entity with audit log when human overrides', async () => {
    const driver = new MemoryStorageDriver();
    const store = new ContextStore(driver);

    // Initial state: Mention "Borga" was machine-resolved to wrong entity "ent-borga-brand"
    const mention: Mention = {
      id: 'men-1',
      dumpId: 'dump-1',
      evidenceId: 'ev-1',
      surfaceForm: 'Borga',
      normalizedForm: 'borga',
      createdAt: '2026-05-10T10:00:00Z',
    };
    await store.entities.saveMention(mention);

    const initialResolution = createEntityResolution({
      mentionId: 'men-1',
      outcome: 'matched_existing',
      targetEntityId: 'ent-borga-brand',
      confidence: 0.65,
      rationale: 'Probabilistic string match to brand',
      createdBy: 'machine',
    });
    await store.entities.saveResolution(initialResolution);

    // A claim was derived for ent-borga-brand from this mention
    const claim: Claim = {
      id: 'claim-event',
      subjectEntityId: 'ent-borga-brand',
      predicate: 'hosting_event',
      objectValue: { type: 'literal', value: 'Cupping Session' },
      sourceOrigin: 'ai_inferred',
      reviewState: 'extracted',
      observationTime: '2026-05-10T10:00:00Z',
      temporalScope: 'present',
      dumpId: 'dump-1',
      mentionId: 'men-1',
      evidenceId: 'ev-1',
      supportingEvidenceIds: ['ev-1'],
      status: 'active',
      createdAt: '2026-05-10T10:00:00Z',
      updatedAt: '2026-05-10T10:00:00Z',
    };
    await store.claims.saveClaim(claim);

    // Human performs re-binding override: Borga in this context refers to "ent-borga-cafe"
    await store.rebindMention(
      'men-1',
      'ent-borga-cafe',
      'User clarified this is the local cafe branch, not the roaster brand.'
    );

    // 1. Verify previous resolution superseded, new resolution active pointing to ent-borga-cafe
    const resolutions = await store.entities.getResolutionsForMention('men-1');
    assert.strictEqual(resolutions.length, 2);
    const activeRes = await store.entities.getActiveResolutionForMention('men-1');
    assert.strictEqual(activeRes?.targetEntityId, 'ent-borga-cafe');
    assert.strictEqual(activeRes?.createdBy, 'human_override');
    assert.strictEqual(activeRes?.confidence, 1.0);

    // 2. Verify claim was re-bound from ent-borga-brand to ent-borga-cafe
    const oldEntityClaims = await store.getClaimsForEntity('ent-borga-brand');
    assert.strictEqual(oldEntityClaims.length, 0);

    const newEntityClaims = await store.getClaimsForEntity('ent-borga-cafe');
    assert.strictEqual(newEntityClaims.length, 1);
    assert.strictEqual(newEntityClaims[0].id, 'claim-event');
    assert.strictEqual(newEntityClaims[0].subjectEntityId, 'ent-borga-cafe');

    // 3. Verify immutable ClaimBindingAudit record was saved
    const audits = await store.claims.getAuditsForClaim('claim-event');
    assert.strictEqual(audits.length, 1);
    assert.strictEqual(audits[0].previousEntityId, 'ent-borga-brand');
    assert.strictEqual(audits[0].newEntityId, 'ent-borga-cafe');
    assert.strictEqual(audits[0].resolutionId, activeRes?.id);

    // 4. Verify original evidence span and grounding remains completely intact
    assert.strictEqual(newEntityClaims[0].evidenceId, 'ev-1');
    assert.deepStrictEqual(newEntityClaims[0].supportingEvidenceIds, ['ev-1']);
  });

  it('persists and retrieves human review overrides on claims', async () => {
    const driver = new MemoryStorageDriver();
    const store = new ContextStore(driver);

    const claim: Claim = {
      id: 'claim-candidate',
      subjectEntityId: 'ent-tungku',
      predicate: 'located_in',
      objectValue: { type: 'literal', value: 'Tungku Beach' },
      sourceOrigin: 'ai_inferred',
      reviewState: 'needs_review',
      observationTime: '2026-05-10T10:00:00Z',
      temporalScope: 'present',
      dumpId: 'dump-1',
      evidenceId: 'ev-1',
      supportingEvidenceIds: ['ev-1'],
      status: 'active',
      createdAt: '2026-05-10T10:00:00Z',
      updatedAt: '2026-05-10T10:00:00Z',
    };
    await store.claims.saveClaim(claim);

    const override: HumanOverride = {
      id: 'ovr-claim-1',
      targetType: 'claim_review',
      targetId: 'claim-candidate',
      action: 'confirm_claim',
      payload: {},
      userNotes: 'Confirmed from local geography',
      createdAt: '2026-05-10T10:05:00Z',
    };

    await store.applyHumanOverride(override);

    const updatedClaim = await store.claims.getClaim('claim-candidate');
    assert.strictEqual(updatedClaim?.reviewState, 'human_confirmed');

    const overrides = await store.overrides.getOverridesForTarget('claim_review', 'claim-candidate');
    assert.strictEqual(overrides.length, 1);
    assert.strictEqual(overrides[0].action, 'confirm_claim');
  });
});
