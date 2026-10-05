import { describe, it } from 'node:test';
import assert from 'node:assert';
import { MemoryStorageDriver, STORES } from '../db';
import { ContextStore } from '../contextStore';
import {
  Claim,
  Dump,
  Entity,
  Evidence,
  Mention,
} from '../../domain/types';
import { evaluateClaimConflict } from '../../domain/invariants';
import { createEntityResolution } from '../../domain/stateMachines';

describe('Phase 1 Condition Closure Suite', () => {
  // ========================================================
  // CONDITION 1: Qualifier-Safe Claim Deduplication
  // ========================================================
  describe('Condition 1: Qualifier-Safe Claim Deduplication', () => {
    it('Case A: does NOT collapse claims with differing quantities ("2 coffee machines" vs "3 coffee machines")', async () => {
      const driver = new MemoryStorageDriver();
      const store = new ContextStore(driver);

      const claim2: Claim = {
        id: 'claim-qty-2',
        subjectEntityId: 'ent-user',
        predicate: 'owns_asset',
        objectValue: { type: 'literal', value: 'coffee machine' },
        qualifiers: { quantity: 2 },
        sourceOrigin: 'human_stated',
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

      const claim3: Claim = {
        id: 'claim-qty-3',
        subjectEntityId: 'ent-user',
        predicate: 'owns_asset',
        objectValue: { type: 'literal', value: 'coffee machine' },
        qualifiers: { quantity: 3 },
        sourceOrigin: 'human_stated',
        reviewState: 'extracted',
        observationTime: '2026-05-10T10:00:00Z',
        temporalScope: 'present',
        dumpId: 'dump-2',
        evidenceId: 'ev-2',
        supportingEvidenceIds: ['ev-2'],
        status: 'active',
        createdAt: '2026-05-10T10:00:00Z',
        updatedAt: '2026-05-10T10:00:00Z',
      };

      await store.addClaim(claim2);
      await store.addClaim(claim3);

      const claims = await store.getClaimsForEntity('ent-user');
      // Must remain 2 distinct claims because qualifiers (quantity 2 vs 3) differ
      assert.strictEqual(claims.length, 2);
      const quantities = claims.map((c) => c.qualifiers?.quantity).sort();
      assert.deepStrictEqual(quantities, [2, 3]);
    });

    it('Case B: does NOT collapse claims with differing conditions/modalities ("more than 2" vs "exactly 2")', async () => {
      const driver = new MemoryStorageDriver();
      const store = new ContextStore(driver);

      const claimAtLeast2: Claim = {
        id: 'claim-at-least-2',
        subjectEntityId: 'ent-user',
        predicate: 'owns_asset',
        objectValue: { type: 'literal', value: 'coffee machine' },
        qualifiers: { quantity: 2, condition: 'more_than' },
        sourceOrigin: 'human_stated',
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

      const claimExact2: Claim = {
        id: 'claim-exact-2',
        subjectEntityId: 'ent-user',
        predicate: 'owns_asset',
        objectValue: { type: 'literal', value: 'coffee machine' },
        qualifiers: { quantity: 2, condition: 'exact' },
        sourceOrigin: 'human_stated',
        reviewState: 'extracted',
        observationTime: '2026-05-10T10:00:00Z',
        temporalScope: 'present',
        dumpId: 'dump-2',
        evidenceId: 'ev-2',
        supportingEvidenceIds: ['ev-2'],
        status: 'active',
        createdAt: '2026-05-10T10:00:00Z',
        updatedAt: '2026-05-10T10:00:00Z',
      };

      await store.addClaim(claimAtLeast2);
      await store.addClaim(claimExact2);

      const claims = await store.getClaimsForEntity('ent-user');
      assert.strictEqual(claims.length, 2);
      assert.strictEqual(claims.find((c) => c.id === 'claim-at-least-2')?.qualifiers?.condition, 'more_than');
      assert.strictEqual(claims.find((c) => c.id === 'claim-exact-2')?.qualifiers?.condition, 'exact');
    });

    it('Case C: reinforces existing claim when same claim arrives with identical qualifiers and different evidence', async () => {
      const driver = new MemoryStorageDriver();
      const store = new ContextStore(driver);

      const claimA: Claim = {
        id: 'claim-initial',
        subjectEntityId: 'ent-user',
        predicate: 'owns_asset',
        objectValue: { type: 'literal', value: 'coffee machine' },
        qualifiers: { quantity: 2, condition: 'exact' },
        sourceOrigin: 'human_stated',
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
        id: 'claim-duplicate',
        subjectEntityId: 'ent-user',
        predicate: 'owns_asset',
        objectValue: { type: 'literal', value: 'coffee machine' },
        qualifiers: { quantity: 2, condition: 'exact' },
        sourceOrigin: 'human_stated',
        reviewState: 'extracted',
        observationTime: '2026-05-10T10:00:00Z',
        temporalScope: 'present',
        dumpId: 'dump-2',
        evidenceId: 'ev-2',
        supportingEvidenceIds: ['ev-2'],
        status: 'active',
        createdAt: '2026-05-11T10:00:00Z',
        updatedAt: '2026-05-11T10:00:00Z',
      };

      await store.addClaim(claimA);
      await store.addClaim(claimB);

      const claims = await store.getClaimsForEntity('ent-user');
      assert.strictEqual(claims.length, 1);
      assert.strictEqual(claims[0].id, 'claim-initial');
      assert.ok(claims[0].supportingEvidenceIds.includes('ev-1'));
      assert.ok(claims[0].supportingEvidenceIds.includes('ev-2'));
    });
  });

  // ========================================================
  // CONDITION 2: Object Mention Grounding & Rebinding
  // ========================================================
  describe('Condition 2: Object Mention Grounding & Rebinding', () => {
    it('Case A & B: supports subject and object entity re-binding while preserving evidence spans', async () => {
      const driver = new MemoryStorageDriver();
      const store = new ContextStore(driver);

      // Setup Dumps and Evidence
      const dump: Dump = {
        id: 'dump-rel-1',
        rawText: 'Borga partners with Tungku on coastal distribution.',
        source: 'web_dock',
        createdAt: '2026-05-10T10:00:00Z',
        processingStatus: 'processed',
      };
      await store.dumps.saveDump(dump);

      const evSubject: Evidence = {
        id: 'ev-sub',
        dumpId: 'dump-rel-1',
        textSpan: 'Borga',
        startOffset: 0,
        endOffset: 5,
        createdAt: '2026-05-10T10:00:00Z',
      };
      const evObject: Evidence = {
        id: 'ev-obj',
        dumpId: 'dump-rel-1',
        textSpan: 'Tungku',
        startOffset: 20,
        endOffset: 26,
        createdAt: '2026-05-10T10:00:00Z',
      };
      await store.dumps.saveEvidence(evSubject);
      await store.dumps.saveEvidence(evObject);

      // Setup Mentions
      const mentionSubject: Mention = {
        id: 'men-sub-1',
        dumpId: 'dump-rel-1',
        evidenceId: 'ev-sub',
        surfaceForm: 'Borga',
        normalizedForm: 'borga',
        createdAt: '2026-05-10T10:00:00Z',
      };
      const mentionObject: Mention = {
        id: 'men-obj-1',
        dumpId: 'dump-rel-1',
        evidenceId: 'ev-obj',
        surfaceForm: 'Tungku',
        normalizedForm: 'tungku',
        createdAt: '2026-05-10T10:00:00Z',
      };
      await store.entities.saveMention(mentionSubject);
      await store.entities.saveMention(mentionObject);

      // Initial resolutions
      const resSubject = createEntityResolution({
        mentionId: 'men-sub-1',
        outcome: 'matched_existing',
        targetEntityId: 'ent-borga-brand',
        confidence: 0.8,
        rationale: 'Initial match to brand',
        createdBy: 'machine',
      });
      const resObject = createEntityResolution({
        mentionId: 'men-obj-1',
        outcome: 'matched_existing',
        targetEntityId: 'ent-tungku-region',
        confidence: 0.7,
        rationale: 'Initial match to geographic region',
        createdBy: 'machine',
      });
      await store.entities.saveResolution(resSubject);
      await store.entities.saveResolution(resObject);

      // Relational Claim with explicit subjectMentionId and objectMentionId
      const relationalClaim: Claim = {
        id: 'claim-rel-1',
        subjectEntityId: 'ent-borga-brand',
        predicate: 'partners_with',
        objectValue: { type: 'entity_id', value: 'ent-tungku-region' },
        sourceOrigin: 'human_stated',
        reviewState: 'extracted',
        observationTime: '2026-05-10T10:00:00Z',
        temporalScope: 'present',
        dumpId: 'dump-rel-1',
        subjectMentionId: 'men-sub-1',
        objectMentionId: 'men-obj-1',
        mentionId: 'men-sub-1',
        evidenceId: 'ev-sub',
        supportingEvidenceIds: ['ev-sub', 'ev-obj'],
        status: 'active',
        createdAt: '2026-05-10T10:00:00Z',
        updatedAt: '2026-05-10T10:00:00Z',
      };
      await store.claims.saveClaim(relationalClaim);

      // Test Case B: Re-bind OBJECT mention from ent-tungku-region to ent-tungku-beach-club
      await store.rebindMention(
        'men-obj-1',
        'ent-tungku-beach-club',
        'Tungku in this context refers to Tungku Beach Club enterprise.'
      );

      const reboundClaimObj = await store.claims.getClaim('claim-rel-1');
      assert.ok(reboundClaimObj);
      assert.strictEqual(reboundClaimObj?.objectValue.type, 'entity_id');
      assert.strictEqual(reboundClaimObj?.objectValue.value, 'ent-tungku-beach-club');
      // Subject remains ent-borga-brand
      assert.strictEqual(reboundClaimObj?.subjectEntityId, 'ent-borga-brand');

      // Test Case E: Verify audit history for object re-bind
      const auditsObj = await store.claims.getAuditsForClaim('claim-rel-1');
      assert.strictEqual(auditsObj.length, 1);
      assert.strictEqual(auditsObj[0].role, 'object');
      assert.strictEqual(auditsObj[0].previousEntityId, 'ent-tungku-region');
      assert.strictEqual(auditsObj[0].newEntityId, 'ent-tungku-beach-club');

      // Test Case A: Re-bind SUBJECT mention from ent-borga-brand to ent-borga-cafe
      await store.rebindMention(
        'men-sub-1',
        'ent-borga-cafe',
        'Borga here refers to the cafe.'
      );

      const reboundClaimBoth = await store.claims.getClaim('claim-rel-1');
      assert.strictEqual(reboundClaimBoth?.subjectEntityId, 'ent-borga-cafe');
      assert.strictEqual(reboundClaimBoth?.objectValue.value, 'ent-tungku-beach-club');

      // Audits must now have both subject and object re-binding records
      const allAudits = await store.claims.getAuditsForClaim('claim-rel-1');
      assert.strictEqual(allAudits.length, 2);
      const subjectAudit = allAudits.find((a) => a.role === 'subject');
      assert.ok(subjectAudit);
      assert.strictEqual(subjectAudit?.previousEntityId, 'ent-borga-brand');
      assert.strictEqual(subjectAudit?.newEntityId, 'ent-borga-cafe');

      // Test Case D: Verify original evidence grounding is preserved
      assert.strictEqual(reboundClaimBoth?.dumpId, 'dump-rel-1');
      assert.strictEqual(reboundClaimBoth?.evidenceId, 'ev-sub');
      assert.deepStrictEqual(reboundClaimBoth?.supportingEvidenceIds, ['ev-sub', 'ev-obj']);
    });
  });

  // ========================================================
  // CONDITION 3: Multi-Store Transaction Support
  // ========================================================
  describe('Condition 3: Multi-Store Transaction Support', () => {
    it('rolls back all store mutations atomically when an operation fails mid-transaction', async () => {
      const driver = new MemoryStorageDriver();
      const store = new ContextStore(driver);

      const mention: Mention = {
        id: 'men-tx-1',
        dumpId: 'dump-1',
        evidenceId: 'ev-1',
        surfaceForm: 'Nalakara',
        normalizedForm: 'nalakara',
        createdAt: '2026-05-10T10:00:00Z',
      };
      await store.entities.saveMention(mention);

      const resolution = createEntityResolution({
        mentionId: 'men-tx-1',
        outcome: 'matched_existing',
        targetEntityId: 'ent-nalakara-v1',
        confidence: 0.9,
        rationale: 'Active resolution',
        createdBy: 'machine',
      });
      await store.entities.saveResolution(resolution);

      const claim: Claim = {
        id: 'claim-tx-1',
        subjectEntityId: 'ent-nalakara-v1',
        predicate: 'status',
        objectValue: { type: 'literal', value: 'operating' },
        sourceOrigin: 'human_stated',
        reviewState: 'human_confirmed',
        observationTime: '2026-05-10T10:00:00Z',
        temporalScope: 'present',
        dumpId: 'dump-1',
        mentionId: 'men-tx-1',
        evidenceId: 'ev-1',
        supportingEvidenceIds: ['ev-1'],
        status: 'active',
        createdAt: '2026-05-10T10:00:00Z',
        updatedAt: '2026-05-10T10:00:00Z',
      };
      await store.claims.saveClaim(claim);

      // Execute a multi-store transaction that throws an intentional error midway
      await assert.rejects(
        async () => {
          await driver.runTransaction(
            [STORES.ENTITY_RESOLUTIONS, STORES.CLAIMS, STORES.CLAIM_AUDITS],
            'readwrite',
            async (txDriver) => {
              // 1. Mutate claim in txDriver
              const modifiedClaim: Claim = {
                ...claim,
                subjectEntityId: 'ent-nalakara-CORRUPTED',
              };
              await txDriver.put(STORES.CLAIMS, modifiedClaim);

              // 2. Simulate catastrophic error before transaction completes
              throw new Error('Disk IO failure midway through transaction.');
            }
          );
        },
        /Disk IO failure midway through transaction/
      );

      // Verify atomic rollback: the claim in store must NOT be corrupted!
      const uncorruptedClaim = await store.claims.getClaim('claim-tx-1');
      assert.strictEqual(uncorruptedClaim?.subjectEntityId, 'ent-nalakara-v1');
    });
  });

  // ========================================================
  // CONDITION 4: Observation Time vs Temporal Validity Scope
  // ========================================================
  describe('Condition 4: Observation Time vs Temporal Validity Scope', () => {
    it('Case A: classifies state changes over different observation times as temporal_shift, NOT contradiction', () => {
      const claimT1: Claim = {
        id: 'c1',
        subjectEntityId: 'ent-user',
        predicate: 'owns_asset',
        objectValue: { type: 'literal', value: 'coffee machine' },
        qualifiers: { quantity: 2 },
        sourceOrigin: 'human_stated',
        reviewState: 'extracted',
        observationTime: '2026-01-10T10:00:00Z', // T1 (January)
        temporalScope: 'present',
        dumpId: 'dump-1',
        evidenceId: 'ev-1',
        supportingEvidenceIds: ['ev-1'],
        status: 'active',
        createdAt: '2026-01-10T10:00:00Z',
        updatedAt: '2026-01-10T10:00:00Z',
      };

      const claimT2: Claim = {
        id: 'c2',
        subjectEntityId: 'ent-user',
        predicate: 'owns_asset',
        objectValue: { type: 'literal', value: 'coffee machine' },
        qualifiers: { quantity: 3 }, // Changed from 2 to 3
        sourceOrigin: 'human_stated',
        reviewState: 'extracted',
        observationTime: '2026-05-10T10:00:00Z', // T2 (May)
        temporalScope: 'present',
        dumpId: 'dump-2',
        evidenceId: 'ev-2',
        supportingEvidenceIds: ['ev-2'],
        status: 'active',
        createdAt: '2026-05-10T10:00:00Z',
        updatedAt: '2026-05-10T10:00:00Z',
      };

      const conflict = evaluateClaimConflict(claimT1, claimT2);
      // Because observationTime differs (January vs May), it is state evolution (temporal_shift)
      assert.strictEqual(conflict, 'temporal_shift');
    });

    it('Case B: preserves temporal distinction between "used to" (past) and "now" (present)', () => {
      const pastClaim: Claim = {
        id: 'c-past',
        subjectEntityId: 'ent-user',
        predicate: 'owns_asset',
        objectValue: { type: 'literal', value: 'coffee machine' },
        qualifiers: { quantity: 2 },
        sourceOrigin: 'human_stated',
        reviewState: 'extracted',
        observationTime: '2026-05-10T10:00:00Z',
        temporalScope: 'past', // "I used to have 2"
        dumpId: 'dump-1',
        evidenceId: 'ev-1',
        supportingEvidenceIds: ['ev-1'],
        status: 'active',
        createdAt: '2026-05-10T10:00:00Z',
        updatedAt: '2026-05-10T10:00:00Z',
      };

      const presentClaim: Claim = {
        id: 'c-present',
        subjectEntityId: 'ent-user',
        predicate: 'owns_asset',
        objectValue: { type: 'literal', value: 'coffee machine' },
        qualifiers: { quantity: 3 }, // "I have 3"
        sourceOrigin: 'human_stated',
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

      const conflict = evaluateClaimConflict(pastClaim, presentClaim);
      assert.strictEqual(conflict, 'temporal_shift');
    });

    it('Case C: recognizes direct contradiction when conflicting claims share the same observation window and temporal scope', () => {
      const claimOslo: Claim = {
        id: 'c-oslo',
        subjectEntityId: 'ent-borga',
        predicate: 'headquarters',
        objectValue: { type: 'literal', value: 'Oslo' },
        sourceOrigin: 'human_stated',
        reviewState: 'extracted',
        observationTime: '2026-05-10T10:00:00Z', // Same time
        temporalScope: 'present', // Same scope
        dumpId: 'dump-1',
        evidenceId: 'ev-1',
        supportingEvidenceIds: ['ev-1'],
        status: 'active',
        createdAt: '2026-05-10T10:00:00Z',
        updatedAt: '2026-05-10T10:00:00Z',
      };

      const claimBergen: Claim = {
        id: 'c-bergen',
        subjectEntityId: 'ent-borga',
        predicate: 'headquarters',
        objectValue: { type: 'literal', value: 'Bergen' },
        sourceOrigin: 'human_stated',
        reviewState: 'extracted',
        observationTime: '2026-05-10T10:00:00Z', // Same time
        temporalScope: 'present', // Same scope
        dumpId: 'dump-1',
        evidenceId: 'ev-2',
        supportingEvidenceIds: ['ev-2'],
        status: 'active',
        createdAt: '2026-05-10T10:00:00Z',
        updatedAt: '2026-05-10T10:00:00Z',
      };

      const conflict = evaluateClaimConflict(claimOslo, claimBergen);
      // In the same observation window stating conflicting current locations = direct contradiction
      assert.strictEqual(conflict, 'direct_contradiction');
    });
  });
});
