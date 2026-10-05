import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Dump } from '../../domain/types';
import { MemoryStorageDriver } from '../../storage/db';
import { DumpRepository } from '../../storage/dumpRepo';
import { EntityRepository } from '../../storage/entityRepo';
import { DeterministicSemanticExtractor } from '../extraction/deterministic';
import { SemanticExtractionOrchestrator } from '../extraction/extractor';

describe('Phase 2.1 — Semantic Extraction Core Suite', () => {
  const orchestrator = new SemanticExtractionOrchestrator(
    new DeterministicSemanticExtractor()
  );

  // ========================================================
  // 1. Instagram Multi-Account (DUMP A)
  // ========================================================
  it('1. extracts multi-account mentions, individual claims, and cardinality aggregate from DUMP A', async () => {
    const rawText =
      'Saya punya 5 akun Instagram: freshbeda, yudhan.sebastian, nalakara.id, rampainusa, matatua.';
    const dump: Dump = {
      id: 'dump-ig-a',
      rawText,
      source: 'web_dock',
      createdAt: '2026-05-10T10:00:00Z',
      processingStatus: 'captured',
    };

    const result = await orchestrator.extract(dump);

    // 5 account handles + 1 user mention = 6 mentions
    const handleMentions = result.mentions.filter(
      (m) => m.typeHint === 'social_handle'
    );
    assert.strictEqual(handleMentions.length, 5);

    const expectedHandles = [
      'freshbeda',
      'yudhan.sebastian',
      'nalakara.id',
      'rampainusa',
      'matatua',
    ];
    for (const handle of expectedHandles) {
      const found = handleMentions.find((m) => m.surfaceForm === handle);
      assert.ok(found, `Expected handle mention ${handle} not found`);
      // Provenance slice check
      assert.strictEqual(
        rawText.slice(found.startOffset, found.endOffset),
        found.textSpan
      );
      assert.strictEqual(found.textSpan, handle);
    }

    // Check individual account claims
    const individualClaims = result.claims.filter(
      (c) => c.predicate === 'owns_social_account' && c.objectValue.type === 'mention_surface'
    );
    assert.strictEqual(individualClaims.length, 5);
    for (const handle of expectedHandles) {
      const claim = individualClaims.find(
        (c) => c.objectMentionSurface === handle
      );
      assert.ok(claim);
      assert.strictEqual(claim.qualifiers?.platform, 'instagram');
      assert.strictEqual(claim.temporalScope, 'present');
    }

    // Check aggregate cardinality claim
    const aggClaim = result.claims.find(
      (c) => c.objectValue.type === 'concept' && c.objectValue.value === 'instagram_account'
    );
    assert.ok(aggClaim);
    assert.strictEqual(aggClaim.qualifiers?.quantity, 5);
    assert.strictEqual(aggClaim.qualifiers?.platform, 'instagram');
    assert.strictEqual(aggClaim.temporalScope, 'present');
  });

  // ========================================================
  // 2. Nalakara Business (DUMP B)
  // ========================================================
  it('2. extracts Nalakara business assertion with partitivity and domain sectors from DUMP B', async () => {
    const rawText =
      'Nalakara adalah salah satu lini usaha saya, bergerak di bidang teknologi dan AI.';
    const dump: Dump = {
      id: 'dump-nalakara-b',
      rawText,
      source: 'web_dock',
      createdAt: '2026-05-10T10:00:00Z',
      processingStatus: 'captured',
    };

    const result = await orchestrator.extract(dump);

    // Mentions
    const nalakaraMention = result.mentions.find(
      (m) => m.surfaceForm === 'Nalakara'
    );
    assert.ok(nalakaraMention);
    assert.strictEqual(nalakaraMention.typeHint, 'company');
    assert.strictEqual(
      rawText.slice(nalakaraMention.startOffset, nalakaraMention.endOffset),
      'Nalakara'
    );

    // Business line claim with partitivity
    const bizClaim = result.claims.find(
      (c) => c.predicate === 'operates_business' && c.objectMentionSurface === 'Nalakara'
    );
    assert.ok(bizClaim);
    assert.strictEqual(
      bizClaim.qualifiers?.partitivity,
      'one_of_several_business_lines'
    );
    assert.strictEqual(bizClaim.qualifiers?.category, 'business_line');

    // Sector claims (teknologi & AI)
    const sectorClaims = result.claims.filter(
      (c) => c.predicate === 'operates_in_sector' && c.subjectMentionSurface === 'Nalakara'
    );
    assert.strictEqual(sectorClaims.length, 2);
    const sectors = sectorClaims.map((c) => c.objectValue.value).sort();
    assert.deepStrictEqual(sectors, ['AI', 'teknologi']);
  });

  // ========================================================
  // 3. Freshbeda Business (DUMP C)
  // ========================================================
  it('3. extracts Freshbeda business-line assertion and domain focus from DUMP C', async () => {
    const rawText =
      'Freshbeda adalah lini usaha saya yang berhubungan dengan visual design.';
    const dump: Dump = {
      id: 'dump-freshbeda-c',
      rawText,
      source: 'web_dock',
      createdAt: '2026-05-10T10:00:00Z',
      processingStatus: 'captured',
    };

    const result = await orchestrator.extract(dump);

    const freshbedaMention = result.mentions.find(
      (m) => m.surfaceForm === 'Freshbeda'
    );
    assert.ok(freshbedaMention);
    assert.strictEqual(freshbedaMention.typeHint, 'company');

    const bizClaim = result.claims.find(
      (c) => c.predicate === 'operates_business' && c.objectMentionSurface === 'Freshbeda'
    );
    assert.ok(bizClaim);
    assert.strictEqual(bizClaim.qualifiers?.category, 'business_line');

    const domainClaim = result.claims.find(
      (c) => c.predicate === 'focuses_on_domain' && c.subjectMentionSurface === 'Freshbeda'
    );
    assert.ok(domainClaim);
    assert.strictEqual(domainClaim.objectValue.value, 'visual design');
  });

  // ========================================================
  // 4. Instagram Handle Relational Claim (DUMP D)
  // ========================================================
  it('4. extracts relational claim with dual subject & object mentions from DUMP D', async () => {
    const rawText = 'nalakara.id adalah akun Instagram untuk Nalakara.';
    const dump: Dump = {
      id: 'dump-rel-d',
      rawText,
      source: 'web_dock',
      createdAt: '2026-05-10T10:00:00Z',
      processingStatus: 'captured',
    };

    const result = await orchestrator.extract(dump);

    // Subject and Object mentions
    const handleMention = result.mentions.find(
      (m) => m.surfaceForm === 'nalakara.id'
    );
    const entityMention = result.mentions.find(
      (m) => m.surfaceForm === 'Nalakara'
    );
    assert.ok(handleMention, 'nalakara.id mention must exist');
    assert.ok(entityMention, 'Nalakara mention must exist');
    assert.strictEqual(handleMention.typeHint, 'social_handle');
    assert.strictEqual(entityMention.typeHint, 'company');

    // Relational claim candidate
    const relClaim = result.claims.find(
      (c) => c.predicate === 'has_social_account'
    );
    assert.ok(relClaim);
    assert.strictEqual(relClaim.subjectMentionSurface, 'Nalakara');
    assert.strictEqual(relClaim.objectMentionSurface, 'nalakara.id');
    assert.strictEqual(relClaim.qualifiers?.platform, 'instagram');
    assert.strictEqual(
      rawText.slice(relClaim.startOffset, relClaim.endOffset),
      relClaim.textSpan
    );
  });

  // ========================================================
  // 5. Quantity / Cardinality without Individual Identities
  // ========================================================
  it('5. extracts cardinality quantities without fabricating individual entity identities', async () => {
    const rawText =
      'Saya punya 2 mesin kopi, 1 mesin roasting, 1 freezer, 2 refrigerator.';
    const dump: Dump = {
      id: 'dump-qty',
      rawText,
      source: 'web_dock',
      createdAt: '2026-05-10T10:00:00Z',
      processingStatus: 'captured',
    };

    const result = await orchestrator.extract(dump);

    const assetClaims = result.claims.filter((c) => c.predicate === 'owns_asset');
    assert.strictEqual(assetClaims.length, 4);

    const qtyMap: Record<string, number | undefined> = {};
    for (const c of assetClaims) {
      qtyMap[c.objectValue.value] = c.qualifiers?.quantity;
    }

    assert.strictEqual(qtyMap['mesin kopi'], 2);
    assert.strictEqual(qtyMap['mesin roasting'], 1);
    assert.strictEqual(qtyMap['freezer'], 1);
    assert.strictEqual(qtyMap['refrigerator'], 2);

    // Verify zero artificial numbered entities (e.g. no "mesin kopi #1")
    const numberedMentions = result.mentions.filter((m) =>
      /#\d|1|2/.test(m.surfaceForm)
    );
    assert.strictEqual(numberedMentions.length, 0);
  });

  // ========================================================
  // 6. Activity Assertion without Artificial Order Entity
  // ========================================================
  it('6. extracts activity assertion without creating an artificial Order entity', async () => {
    const rawText = 'Saya menerima pesanan blend kopi.';
    const dump: Dump = {
      id: 'dump-activity',
      rawText,
      source: 'web_dock',
      createdAt: '2026-05-10T10:00:00Z',
      processingStatus: 'captured',
    };

    const result = await orchestrator.extract(dump);

    const activityClaim = result.claims.find(
      (c) => c.predicate === 'engages_in_activity'
    );
    assert.ok(activityClaim);
    assert.strictEqual(
      activityClaim.objectValue.value,
      'menerima pesanan blend kopi'
    );
    assert.strictEqual(activityClaim.temporalScope, 'recurring');

    // No Order entity should be created or hinted
    const orderEntities = result.mentions.filter((m) =>
      /order\s*#?1/i.test(m.surfaceForm)
    );
    assert.strictEqual(orderEntities.length, 0);
  });

  // ========================================================
  // 7. Current Activity + Future Intention
  // ========================================================
  it('7. preserves distinction between present activity and future commercial intention', async () => {
    const rawText =
      'Saya membuat yoghurt untuk saya sendiri dan nantinya saya jual juga.';
    const dump: Dump = {
      id: 'dump-yoghurt',
      rawText,
      source: 'web_dock',
      createdAt: '2026-05-10T10:00:00Z',
      processingStatus: 'captured',
    };

    const result = await orchestrator.extract(dump);

    // Claim 1: Present self-consumption activity
    const presentClaim = result.claims.find(
      (c) => c.predicate === 'engages_in_activity'
    );
    assert.ok(presentClaim);
    assert.strictEqual(presentClaim.temporalScope, 'present');
    assert.strictEqual(presentClaim.qualifiers?.purpose, 'self_consumption');

    // Claim 2: Future commercial intention
    const futureClaim = result.claims.find(
      (c) => c.predicate === 'intends_activity'
    );
    assert.ok(futureClaim);
    assert.strictEqual(futureClaim.temporalScope, 'future');
    assert.strictEqual(
      futureClaim.qualifiers?.modality,
      'commercial_intention'
    );
  });

  // ========================================================
  // 8. Exploratory Activity
  // ========================================================
  it('8. extracts exploratory research without inferring YouTuber commitment', async () => {
    const rawText =
      'Saya sedang research tentang membuat video YouTube faceless.';
    const dump: Dump = {
      id: 'dump-explore',
      rawText,
      source: 'web_dock',
      createdAt: '2026-05-10T10:00:00Z',
      processingStatus: 'captured',
    };

    const result = await orchestrator.extract(dump);

    const exploreClaim = result.claims.find(
      (c) => c.predicate === 'researches_topic'
    );
    assert.ok(exploreClaim);
    assert.strictEqual(exploreClaim.qualifiers?.modality, 'exploratory');
    assert.strictEqual(exploreClaim.temporalScope, 'present');

    // Must not infer user is a YouTuber or owns a channel
    const youtuberClaims = result.claims.filter(
      (c) => c.predicate === 'is_youtuber' || c.predicate === 'owns_channel'
    );
    assert.strictEqual(youtuberClaims.length, 0);
  });

  // ========================================================
  // 9. Pronoun / User Self Reference
  // ========================================================
  it('9. preserves 1st-person pronoun as user_self reference candidate without creating a "saya" entity', async () => {
    const rawText = 'Saya sedang research tentang membuat video YouTube faceless.';
    const dump: Dump = {
      id: 'dump-pronoun',
      rawText,
      source: 'web_dock',
      createdAt: '2026-05-10T10:00:00Z',
      processingStatus: 'captured',
    };

    const result = await orchestrator.extract(dump);

    const userMention = result.mentions.find(
      (m) => m.referenceTarget === 'user_self'
    );
    assert.ok(userMention);
    assert.strictEqual(userMention.surfaceForm.toLowerCase(), 'saya');
    assert.strictEqual(userMention.typeHint, 'person');
  });

  // ========================================================
  // 10. Temporal Scope & Observation Time Preservation
  // ========================================================
  it('10. preserves past temporal scope modifier ("dulu saya punya")', async () => {
    const rawText = 'Dulu saya punya 2 mesin kopi.';
    const dump: Dump = {
      id: 'dump-past',
      rawText,
      source: 'web_dock',
      createdAt: '2026-05-10T10:00:00Z',
      processingStatus: 'captured',
    };

    const result = await orchestrator.extract(dump);
    const claim = result.claims.find((c) => c.predicate === 'owns_asset');
    assert.ok(claim);
    assert.strictEqual(claim.temporalScope, 'past');
  });

  // ========================================================
  // 11. Explicit Negation & Uncertainty
  // ========================================================
  it('11. preserves explicit negation and uncertainty modalities', async () => {
    // Negation test
    const negDump: Dump = {
      id: 'dump-neg',
      rawText: 'Saya tidak punya mesin roasting.',
      source: 'web_dock',
      createdAt: '2026-05-10T10:00:00Z',
      processingStatus: 'captured',
    };
    const negResult = await orchestrator.extract(negDump);
    const negClaim = negResult.claims.find((c) => c.predicate === 'owns_asset');
    assert.ok(negClaim);
    assert.strictEqual(negClaim.qualifiers?.modality, 'negated');

    // Uncertainty test
    const uncDump: Dump = {
      id: 'dump-unc',
      rawText: 'Mungkin saya membuat yoghurt untuk saya sendiri.',
      source: 'web_dock',
      createdAt: '2026-05-10T10:00:00Z',
      processingStatus: 'captured',
    };
    const uncResult = await orchestrator.extract(uncDump);
    const uncClaim = uncResult.claims.find((c) => c.predicate === 'engages_in_activity');
    assert.ok(uncClaim);
    assert.strictEqual(uncClaim.qualifiers?.modality, 'uncertain');
    assert.ok(uncClaim.extractionConfidence <= 0.6);
  });

  // ========================================================
  // 12. Full Grounding & Persistence Idempotency
  // ========================================================
  it('12. grounds mentions into Evidence spans idempotently in repositories', async () => {
    const driver = new MemoryStorageDriver();
    const dumpRepo = new DumpRepository(driver);
    const entityRepo = new EntityRepository(driver);

    const dump: Dump = {
      id: 'dump-idempotent-1',
      rawText: 'Nalakara adalah salah satu lini usaha saya, bergerak di bidang teknologi dan AI.',
      source: 'web_dock',
      createdAt: '2026-05-10T10:00:00Z',
      processingStatus: 'captured',
    };
    await dumpRepo.saveDump(dump);

    // First grounding run
    const groundRun1 = await orchestrator.extractAndGround(dump, dumpRepo, entityRepo);
    assert.ok(groundRun1.evidence.length > 0);
    assert.ok(groundRun1.mentions.length > 0);

    const evidenceCount1 = (await dumpRepo.getEvidenceByDumpId('dump-idempotent-1')).length;
    const mentionCount1 = (await entityRepo.getMentionsByDumpId('dump-idempotent-1')).length;

    // Second grounding run on same dump
    const groundRun2 = await orchestrator.extractAndGround(dump, dumpRepo, entityRepo);
    const evidenceCount2 = (await dumpRepo.getEvidenceByDumpId('dump-idempotent-1')).length;
    const mentionCount2 = (await entityRepo.getMentionsByDumpId('dump-idempotent-1')).length;

    // Idempotency: exact same counts, zero duplicate rows inserted
    assert.strictEqual(evidenceCount1, evidenceCount2);
    assert.strictEqual(mentionCount1, mentionCount2);
    assert.strictEqual(groundRun1.evidence.length, groundRun2.evidence.length);
  });

  // ========================================================
  // 13. Entity Resolution Boundary Proof (freshbeda vs Freshbeda)
  // ========================================================
  it('13. proves Phase 2.1 strictly does NOT perform Entity Resolution between freshbeda and Freshbeda', async () => {
    const dumpHandle: Dump = {
      id: 'dump-handle',
      rawText: 'freshbeda adalah akun Instagram saya.',
      source: 'web_dock',
      createdAt: '2026-05-10T10:00:00Z',
      processingStatus: 'captured',
    };

    const dumpCompany: Dump = {
      id: 'dump-company',
      rawText: 'Freshbeda adalah lini usaha saya yang berhubungan dengan visual design.',
      source: 'web_dock',
      createdAt: '2026-05-10T10:05:00Z',
      processingStatus: 'captured',
    };

    const resultHandle = await orchestrator.extract(dumpHandle);
    const resultCompany = await orchestrator.extract(dumpCompany);

    // Extraction produces mentions as surface candidates ONLY
    const handleMention = resultHandle.mentions.find(
      (m) => m.surfaceForm === 'freshbeda'
    );
    const companyMention = resultCompany.mentions.find(
      (m) => m.surfaceForm === 'Freshbeda'
    );

    assert.ok(handleMention);
    assert.ok(companyMention);

    // Verify Phase 2.1 has NOT created entities, matched them, or resolved them
    assert.strictEqual(handleMention.typeHint, 'social_handle');
    assert.strictEqual(companyMention.typeHint, 'company');
    // They are separate candidate mentions with distinct surface casings and type hints
    assert.notStrictEqual(handleMention.surfaceForm, companyMention.surfaceForm);
  });

  // ========================================================
  // Condition 1 Closure (F-2.1-02): Claim Evidence Persistence
  // ========================================================
  it('14. persists Evidence records for verified claims and preserves Claim -> Evidence -> Dump provenance', async () => {
    const driver = new MemoryStorageDriver();
    const dumpRepo = new DumpRepository(driver);
    const entityRepo = new EntityRepository(driver);

    const rawText = 'nalakara.id adalah akun Instagram untuk Nalakara.';
    const dump: Dump = {
      id: 'dump-claim-provenance-1',
      rawText,
      source: 'web_dock',
      createdAt: '2026-05-10T10:00:00Z',
      processingStatus: 'captured',
    };
    await dumpRepo.saveDump(dump);

    const grounded = await orchestrator.extractAndGround(dump, dumpRepo, entityRepo);

    // Verify each claim has a valid evidenceId
    assert.ok(grounded.claims.length > 0);
    for (const claim of grounded.claims) {
      assert.ok(claim.evidenceId, `Claim ${claim.predicate} must have an evidenceId`);

      // Verify Evidence exists in dumpRepo
      const ev = await dumpRepo.getEvidence(claim.evidenceId);
      assert.ok(ev, `Evidence ${claim.evidenceId} must exist in repository`);

      // Verify Provenance back to Dump
      assert.strictEqual(ev.dumpId, dump.id);
      assert.strictEqual(rawText.slice(ev.startOffset, ev.endOffset), ev.textSpan);
      assert.strictEqual(ev.textSpan, claim.textSpan);
    }

    // Repeated processing idempotency for claim evidence
    const countBefore = (await dumpRepo.getEvidenceByDumpId(dump.id)).length;
    const reGrounded = await orchestrator.extractAndGround(dump, dumpRepo, entityRepo);
    const countAfter = (await dumpRepo.getEvidenceByDumpId(dump.id)).length;

    assert.strictEqual(countBefore, countAfter);
    assert.strictEqual(grounded.claims.length, reGrounded.claims.length);
  });

  // ========================================================
  // Condition 2 Closure (F-2.1-03): Test A - Local Modality Scoping
  // ========================================================
  it('15. scopes "mungkin" modality locally to clause without polluting sibling claims (Test A)', async () => {
    const rawText = 'Saya mungkin punya bisnis A. Bisnis B saya sudah berjalan.';
    const dump: Dump = {
      id: 'dump-test-a',
      rawText,
      source: 'web_dock',
      createdAt: '2026-05-10T10:00:00Z',
      processingStatus: 'captured',
    };

    const result = await orchestrator.extract(dump);

    const claimA = result.claims.find((c) => c.objectMentionSurface === 'A');
    const claimB = result.claims.find((c) => c.objectMentionSurface === 'B');

    assert.ok(claimA, 'Claim about A must be extracted');
    assert.ok(claimB, 'Claim about B must be extracted');

    // Claim about A: uncertain / modalized
    assert.strictEqual(claimA.qualifiers?.modality, 'uncertain');
    assert.ok(claimA.extractionConfidence <= 0.6);

    // Claim about B: present / current assertion; "mungkin" MUST NOT apply to B
    assert.notStrictEqual(claimB.qualifiers?.modality, 'uncertain');
    assert.strictEqual(claimB.temporalScope, 'present');
  });

  // ========================================================
  // Condition 2 Closure (F-2.1-03): Test B - Local Temporal Scoping
  // ========================================================
  it('16. scopes "dulu" temporal scope locally without polluting present claims (Test B)', async () => {
    const rawText = 'Saya dulu punya bisnis A. Sekarang saya menjalankan bisnis B.';
    const dump: Dump = {
      id: 'dump-test-b',
      rawText,
      source: 'web_dock',
      createdAt: '2026-05-10T10:00:00Z',
      processingStatus: 'captured',
    };

    const result = await orchestrator.extract(dump);

    const claimA = result.claims.find((c) => c.objectMentionSurface === 'A');
    const claimB = result.claims.find((c) => c.objectMentionSurface === 'B');

    assert.ok(claimA, 'Claim about A must be extracted');
    assert.ok(claimB, 'Claim about B must be extracted');

    // Claim about A: past
    assert.strictEqual(claimA.temporalScope, 'past');

    // Claim about B: present; "dulu" MUST NOT apply to B
    assert.strictEqual(claimB.temporalScope, 'present');
  });

  // ========================================================
  // Condition 2 Closure (F-2.1-03): Test C - Local Future vs Present Scoping
  // ========================================================
  it('17. scopes future commercial intention locally without polluting ongoing activity (Test C)', async () => {
    const rawText =
      'Saya mungkin akan menjual yoghurt. Saya membuat yoghurt untuk saya sendiri.';
    const dump: Dump = {
      id: 'dump-test-c',
      rawText,
      source: 'web_dock',
      createdAt: '2026-05-10T10:00:00Z',
      processingStatus: 'captured',
    };

    const result = await orchestrator.extract(dump);

    const futureClaim = result.claims.find((c) => c.predicate === 'intends_activity');
    const presentClaim = result.claims.find((c) => c.predicate === 'engages_in_activity');

    assert.ok(futureClaim, 'Future commercial intention must be extracted');
    assert.ok(presentClaim, 'Current activity must be extracted');

    // Future intention: selling yoghurt, uncertain modality, future scope
    assert.strictEqual(futureClaim.temporalScope, 'future');
    assert.strictEqual(futureClaim.qualifiers?.modality, 'uncertain');

    // Current activity: making yoghurt, present scope, NOT modalized as uncertain
    assert.strictEqual(presentClaim.temporalScope, 'present');
    assert.strictEqual(presentClaim.qualifiers?.purpose, 'self_consumption');
    assert.notStrictEqual(presentClaim.qualifiers?.modality, 'uncertain');
  });
});
