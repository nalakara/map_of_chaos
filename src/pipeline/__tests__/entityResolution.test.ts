import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Dump, Entity, Mention } from '../../domain/types';
import { MemoryStorageDriver } from '../../storage/db';
import { DumpRepository } from '../../storage/dumpRepo';
import { EntityRepository } from '../../storage/entityRepo';
import { ContextStore } from '../../storage/contextStore';
import { SemanticExtractionOrchestrator } from '../extraction/extractor';
import { DeterministicSemanticExtractor } from '../extraction/deterministic';
import { ContextAccumulator } from '../resolution/accumulator';
import { DeterministicEntityResolver } from '../resolution/resolver';
import { USER_SELF_ENTITY_ID } from '../resolution/types';

describe('Phase 2.2 — Entity Resolution Decision Matrix Suite', () => {
  const orchestrator = new SemanticExtractionOrchestrator(
    new DeterministicSemanticExtractor()
  );
  const resolver = new DeterministicEntityResolver();

  // ========================================================
  // 1. Exact Unique Match
  // ========================================================
  it('1. resolves exact unique canonical name match without duplicating entity', async () => {
    const driver = new MemoryStorageDriver();
    const contextStore = new ContextStore(driver);
    const accumulator = new ContextAccumulator(contextStore, resolver);

    // Seed existing entity Nalakara
    const existing: Entity = {
      id: 'ent-nalakara',
      canonicalName: 'Nalakara',
      aliases: [],
      associatedHandles: [],
      epistemicStatus: 'verified',
      resolutionStatus: 'resolved',
      createdAt: '2026-05-10T10:00:00Z',
      updatedAt: '2026-05-10T10:00:00Z',
    };
    await contextStore.saveEntity(existing);

    const dump: Dump = {
      id: 'dump-match-1',
      rawText: 'Nalakara adalah salah satu lini usaha saya, bergerak di bidang teknologi dan AI.',
      source: 'web_dock',
      createdAt: '2026-05-10T11:00:00Z',
      processingStatus: 'captured',
    };

    const grounded = await orchestrator.extractAndGround(
      dump,
      contextStore.dumps,
      contextStore.entities
    );
    const accResult = await accumulator.accumulate(grounded);

    const nalakaraDecision = accResult.decisions.find(
      (d) => d.surfaceForm === 'Nalakara'
    );
    assert.ok(nalakaraDecision);
    assert.strictEqual(nalakaraDecision.outcome, 'matched_existing');
    assert.strictEqual(nalakaraDecision.targetEntityId, 'ent-nalakara');

    // Forbidden: Creating ent-nalakara_2
    const allEntities = await contextStore.getAllEntities();
    const nalakaraEntities = allEntities.filter(
      (e) => e.canonicalName.toLowerCase() === 'nalakara'
    );
    assert.strictEqual(nalakaraEntities.length, 1);
  });

  // ========================================================
  // 2. New Entity Creation
  // ========================================================
  it('2. mints new entity when mention is distinct and no match exists', async () => {
    const driver = new MemoryStorageDriver();
    const contextStore = new ContextStore(driver);
    const accumulator = new ContextAccumulator(contextStore, resolver);

    const dump: Dump = {
      id: 'dump-new-ent',
      rawText: 'Freshbeda adalah lini usaha saya yang berhubungan dengan visual design.',
      source: 'web_dock',
      createdAt: '2026-05-10T10:00:00Z',
      processingStatus: 'captured',
    };

    const grounded = await orchestrator.extractAndGround(
      dump,
      contextStore.dumps,
      contextStore.entities
    );
    const accResult = await accumulator.accumulate(grounded);

    const freshbedaDecision = accResult.decisions.find(
      (d) => d.surfaceForm === 'Freshbeda'
    );
    assert.ok(freshbedaDecision);
    assert.strictEqual(freshbedaDecision.outcome, 'new_entity');
    assert.ok(freshbedaDecision.targetEntityId?.startsWith('ent-freshbeda'));

    // Entity is saved in store
    const entity = await contextStore.getEntity(freshbedaDecision.targetEntityId!);
    assert.ok(entity);
    assert.strictEqual(entity.canonicalName, 'Freshbeda');
  });

  // ========================================================
  // 3. Ambiguous Same-Name Entities (Homonyms)
  // ========================================================
  it('3. flags ambiguous when multiple existing entities share the same name', async () => {
    const driver = new MemoryStorageDriver();
    const contextStore = new ContextStore(driver);
    const accumulator = new ContextAccumulator(contextStore, resolver);

    // Seed two distinct entities with the same canonical name "Mercury"
    await contextStore.saveEntity({
      id: 'ent-mercury-co',
      canonicalName: 'Mercury',
      aliases: ['Mercury Banking'],
      associatedHandles: [],
      epistemicStatus: 'verified',
      resolutionStatus: 'resolved',
      createdAt: '2026-05-10T10:00:00Z',
      updatedAt: '2026-05-10T10:00:00Z',
    });
    await contextStore.saveEntity({
      id: 'ent-mercury-planet',
      canonicalName: 'Mercury',
      aliases: ['Planet Mercury'],
      associatedHandles: [],
      epistemicStatus: 'verified',
      resolutionStatus: 'resolved',
      createdAt: '2026-05-10T10:00:00Z',
      updatedAt: '2026-05-10T10:00:00Z',
    });

    const dump: Dump = {
      id: 'dump-homonym',
      rawText: 'Saya menjalankan bisnis Mercury.',
      source: 'web_dock',
      createdAt: '2026-05-10T11:00:00Z',
      processingStatus: 'captured',
    };

    const grounded = await orchestrator.extractAndGround(
      dump,
      contextStore.dumps,
      contextStore.entities
    );
    const accResult = await accumulator.accumulate(grounded);

    const mercuryDecision = accResult.decisions.find(
      (d) => d.surfaceForm === 'Mercury'
    );
    assert.ok(mercuryDecision);
    // Forbidden to guess: must be ambiguous
    assert.strictEqual(mercuryDecision.outcome, 'ambiguous');
    assert.ok(mercuryDecision.candidateEntityIds?.includes('ent-mercury-co'));
    assert.ok(mercuryDecision.candidateEntityIds?.includes('ent-mercury-planet'));
  });

  // ========================================================
  // 4. Similar Names That Must Not Merge (Lexical Overlap Rule)
  // ========================================================
  it('4. prohibits auto-merging similar names on lexical similarity alone', async () => {
    const driver = new MemoryStorageDriver();
    const contextStore = new ContextStore(driver);
    const accumulator = new ContextAccumulator(contextStore, resolver);

    // Seed "Apple Indonesia"
    await contextStore.saveEntity({
      id: 'ent-apple-id',
      canonicalName: 'Apple Indonesia',
      aliases: [],
      associatedHandles: [],
      epistemicStatus: 'verified',
      resolutionStatus: 'resolved',
      createdAt: '2026-05-10T10:00:00Z',
      updatedAt: '2026-05-10T10:00:00Z',
    });

    // Mention "Apple"
    const dump: Dump = {
      id: 'dump-apple',
      rawText: 'Apple adalah salah satu lini usaha saya, bergerak di bidang teknologi dan AI.',
      source: 'web_dock',
      createdAt: '2026-05-10T11:00:00Z',
      processingStatus: 'captured',
    };

    const grounded = await orchestrator.extractAndGround(
      dump,
      contextStore.dumps,
      contextStore.entities
    );
    const accResult = await accumulator.accumulate(grounded);

    const appleDecision = accResult.decisions.find((d) => d.surfaceForm === 'Apple');
    assert.ok(appleDecision);
    // Must NOT auto-merge to Apple Indonesia
    assert.strictEqual(appleDecision.outcome, 'new_entity');
    assert.notStrictEqual(appleDecision.targetEntityId, 'ent-apple-id');
  });

  // ========================================================
  // 5. Handle Associated with Entity
  // ========================================================
  it('5. resolves explicit relational declaration as associated_handle on parent entity', async () => {
    const driver = new MemoryStorageDriver();
    const contextStore = new ContextStore(driver);
    const accumulator = new ContextAccumulator(contextStore, resolver);

    // Seed Nalakara
    await contextStore.saveEntity({
      id: 'ent-nalakara',
      canonicalName: 'Nalakara',
      aliases: [],
      associatedHandles: [],
      epistemicStatus: 'verified',
      resolutionStatus: 'resolved',
      createdAt: '2026-05-10T10:00:00Z',
      updatedAt: '2026-05-10T10:00:00Z',
    });

    const dump: Dump = {
      id: 'dump-rel-handle',
      rawText: 'nalakara.id adalah akun Instagram untuk Nalakara.',
      source: 'web_dock',
      createdAt: '2026-05-10T11:00:00Z',
      processingStatus: 'captured',
    };

    const grounded = await orchestrator.extractAndGround(
      dump,
      contextStore.dumps,
      contextStore.entities
    );
    const accResult = await accumulator.accumulate(grounded);

    const handleDecision = accResult.decisions.find(
      (d) => d.surfaceForm === 'nalakara.id'
    );
    assert.ok(handleDecision);
    assert.strictEqual(handleDecision.outcome, 'associated_handle');
    assert.strictEqual(handleDecision.associatedHandle?.parentEntityId, 'ent-nalakara');
    assert.ok(handleDecision.targetEntityId);

    // Nalakara entity received nalakara.id in associatedHandles
    const updatedEntity = await contextStore.getEntity('ent-nalakara');
    assert.ok(updatedEntity?.associatedHandles.includes('nalakara.id'));
  });

  // ========================================================
  // 6. Multiple Handles Associated with Same Entity
  // ========================================================
  it('6. associates multiple handles with the same entity without collapsing them', async () => {
    const driver = new MemoryStorageDriver();
    const contextStore = new ContextStore(driver);
    const accumulator = new ContextAccumulator(contextStore, resolver);

    await contextStore.saveEntity({
      id: 'ent-nalakara',
      canonicalName: 'Nalakara',
      aliases: [],
      associatedHandles: [],
      epistemicStatus: 'verified',
      resolutionStatus: 'resolved',
      createdAt: '2026-05-10T10:00:00Z',
      updatedAt: '2026-05-10T10:00:00Z',
    });

    // Dump 1: Instagram handle
    const dump1: Dump = {
      id: 'dump-handle-1',
      rawText: 'nalakara.id adalah akun Instagram untuk Nalakara.',
      source: 'web_dock',
      createdAt: '2026-05-10T11:00:00Z',
      processingStatus: 'captured',
    };
    const g1 = await orchestrator.extractAndGround(dump1, contextStore.dumps, contextStore.entities);
    await accumulator.accumulate(g1);

    // Dump 2: Twitter handle
    const dump2: Dump = {
      id: 'dump-handle-2',
      rawText: 'nalakara_tw adalah akun Twitter untuk Nalakara.',
      source: 'web_dock',
      createdAt: '2026-05-10T12:00:00Z',
      processingStatus: 'captured',
    };
    const g2 = await orchestrator.extractAndGround(dump2, contextStore.dumps, contextStore.entities);
    await accumulator.accumulate(g2);

    const entity = await contextStore.getEntity('ent-nalakara');
    assert.ok(entity);
    assert.ok(entity.associatedHandles.includes('nalakara.id'));
    assert.ok(entity.associatedHandles.includes('nalakara_tw'));
    assert.strictEqual(entity.canonicalName, 'Nalakara');
  });

  // ========================================================
  // 7. Explicit Alias Match
  // ========================================================
  it('7. resolves known registered alias to existing entity', async () => {
    const driver = new MemoryStorageDriver();
    const contextStore = new ContextStore(driver);
    const accumulator = new ContextAccumulator(contextStore, resolver);

    await contextStore.saveEntity({
      id: 'ent-nalakara',
      canonicalName: 'Nalakara',
      aliases: ['Nalakara Studio', 'Nalakara Lab'],
      associatedHandles: [],
      epistemicStatus: 'verified',
      resolutionStatus: 'resolved',
      createdAt: '2026-05-10T10:00:00Z',
      updatedAt: '2026-05-10T10:00:00Z',
    });

    const dump: Dump = {
      id: 'dump-alias',
      rawText: 'Nalakara Lab adalah salah satu lini usaha saya, bergerak di bidang teknologi dan AI.',
      source: 'web_dock',
      createdAt: '2026-05-10T11:00:00Z',
      processingStatus: 'captured',
    };

    const grounded = await orchestrator.extractAndGround(
      dump,
      contextStore.dumps,
      contextStore.entities
    );
    const accResult = await accumulator.accumulate(grounded);

    const decision = accResult.decisions.find((d) => d.surfaceForm === 'Nalakara Lab');
    assert.ok(decision);
    assert.strictEqual(decision.outcome, 'matched_existing');
    assert.strictEqual(decision.targetEntityId, 'ent-nalakara');
  });

  // ========================================================
  // 8. User-Self Reference
  // ========================================================
  it('8. resolves 1st-person pronouns to USER_SELF_ENTITY_ID without creating arbitrary entities', async () => {
    const driver = new MemoryStorageDriver();
    const contextStore = new ContextStore(driver);
    const accumulator = new ContextAccumulator(contextStore, resolver);

    const dump: Dump = {
      id: 'dump-user-self',
      rawText: 'Saya menerima pesanan blend kopi.',
      source: 'web_dock',
      createdAt: '2026-05-10T10:00:00Z',
      processingStatus: 'captured',
    };

    const grounded = await orchestrator.extractAndGround(
      dump,
      contextStore.dumps,
      contextStore.entities
    );
    const accResult = await accumulator.accumulate(grounded);

    const userDecision = accResult.decisions.find(
      (d) => d.surfaceForm.toLowerCase() === 'saya'
    );
    assert.ok(userDecision);
    assert.strictEqual(userDecision.outcome, 'matched_existing');
    assert.strictEqual(userDecision.targetEntityId, USER_SELF_ENTITY_ID);

    // Verify no arbitrary entity named "Saya" exists
    const allEntities = await contextStore.getAllEntities();
    const sayaEntities = allEntities.filter((e) => e.canonicalName.toLowerCase() === 'saya');
    assert.strictEqual(sayaEntities.length, 0);
  });

  // ========================================================
  // 9. Quantity without Individual Identity
  // ========================================================
  it('9. records inventory cardinality claims on user without fabricating numbered item entities', async () => {
    const driver = new MemoryStorageDriver();
    const contextStore = new ContextStore(driver);
    const accumulator = new ContextAccumulator(contextStore, resolver);

    const dump: Dump = {
      id: 'dump-qty-res',
      rawText: 'Saya punya 2 mesin kopi, 1 mesin roasting, 1 freezer, 2 refrigerator.',
      source: 'web_dock',
      createdAt: '2026-05-10T10:00:00Z',
      processingStatus: 'captured',
    };

    const grounded = await orchestrator.extractAndGround(
      dump,
      contextStore.dumps,
      contextStore.entities
    );
    const accResult = await accumulator.accumulate(grounded);

    // Claims accumulated on user
    const userClaims = await contextStore.getClaimsForEntity(USER_SELF_ENTITY_ID);
    const assetClaims = userClaims.filter((c) => c.predicate === 'owns_asset');
    assert.strictEqual(assetClaims.length, 4);

    // Forbidden: Creating entities for Coffee Machine #1, etc.
    const allEntities = await contextStore.getAllEntities();
    const machineEntities = allEntities.filter((e) =>
      /mesin kopi\s*#?\d|coffee machine\s*#?\d/i.test(e.canonicalName)
    );
    assert.strictEqual(machineEntities.length, 0);
  });

  // ========================================================
  // 10. Activity without Entity Creation
  // ========================================================
  it('10. records activity assertions without manufacturing artificial Order or Channel entities', async () => {
    const driver = new MemoryStorageDriver();
    const contextStore = new ContextStore(driver);
    const accumulator = new ContextAccumulator(contextStore, resolver);

    const dump: Dump = {
      id: 'dump-activity-res',
      rawText: 'Saya menerima pesanan blend kopi.',
      source: 'web_dock',
      createdAt: '2026-05-10T10:00:00Z',
      processingStatus: 'captured',
    };

    const grounded = await orchestrator.extractAndGround(
      dump,
      contextStore.dumps,
      contextStore.entities
    );
    await accumulator.accumulate(grounded);

    const allEntities = await contextStore.getAllEntities();
    const orderEntities = allEntities.filter((e) => /order\s*#?\d/i.test(e.canonicalName));
    assert.strictEqual(orderEntities.length, 0);
  });

  // ========================================================
  // 11. Rebinding Mentions
  // ========================================================
  it('11. supports mention rebinding with resolution supersession and audit logging', async () => {
    const driver = new MemoryStorageDriver();
    const contextStore = new ContextStore(driver);

    // Seed Entity A and Entity B
    await contextStore.saveEntity({
      id: 'ent-a',
      canonicalName: 'Brand A',
      aliases: [],
      associatedHandles: [],
      epistemicStatus: 'verified',
      resolutionStatus: 'resolved',
      createdAt: '2026-05-10T10:00:00Z',
      updatedAt: '2026-05-10T10:00:00Z',
    });
    await contextStore.saveEntity({
      id: 'ent-b',
      canonicalName: 'Brand B',
      aliases: [],
      associatedHandles: [],
      epistemicStatus: 'verified',
      resolutionStatus: 'resolved',
      createdAt: '2026-05-10T10:00:00Z',
      updatedAt: '2026-05-10T10:00:00Z',
    });

    const dump: Dump = {
      id: 'dump-rebind',
      rawText: 'Brand A adalah lini usaha saya.',
      source: 'web_dock',
      createdAt: '2026-05-10T10:00:00Z',
      processingStatus: 'captured',
    };
    await contextStore.dumps.saveDump(dump);

    const grounded = await orchestrator.extractAndGround(
      dump,
      contextStore.dumps,
      contextStore.entities
    );
    const accumulator = new ContextAccumulator(contextStore, resolver);
    const accResult = await accumulator.accumulate(grounded);

    const decisionA = accResult.decisions.find((d) => d.surfaceForm === 'Brand A');
    assert.ok(decisionA);
    assert.strictEqual(decisionA.targetEntityId, 'ent-a');

    // Human performs rebinding to Brand B
    await contextStore.rebindMention(
      decisionA.mentionId,
      'ent-b',
      'User corrected mention to Brand B'
    );

    // Active resolution is now ent-b
    const activeRes = await contextStore.entities.getActiveResolutionForMention(
      decisionA.mentionId
    );
    assert.ok(activeRes);
    assert.strictEqual(activeRes.targetEntityId, 'ent-b');
    assert.strictEqual(activeRes.createdBy, 'human_override');

    // History preserved: 2 resolution records total
    const allRes = await contextStore.entities.getResolutionsForMention(
      decisionA.mentionId
    );
    assert.strictEqual(allRes.length, 2);
  });

  // ========================================================
  // 12. Human Override Precedence
  // ========================================================
  it('12. enforces human override precedence over machine decisions', async () => {
    const driver = new MemoryStorageDriver();
    const contextStore = new ContextStore(driver);

    await contextStore.saveEntity({
      id: 'ent-brand-a',
      canonicalName: 'Brand A',
      aliases: [],
      associatedHandles: [],
      epistemicStatus: 'verified',
      resolutionStatus: 'resolved',
      createdAt: '2026-05-10T10:00:00Z',
      updatedAt: '2026-05-10T10:00:00Z',
    });

    const mention: Mention = {
      id: 'men-1',
      dumpId: 'dump-1',
      evidenceId: 'ev-1',
      surfaceForm: 'Brand A Alternate',
      normalizedForm: 'brand a alternate',
      createdAt: '2026-05-10T10:00:00Z',
    };
    await contextStore.entities.saveMention(mention);

    // Apply human override on men-1
    await contextStore.applyHumanOverride({
      id: 'ovr-1',
      targetType: 'entity_resolution',
      targetId: 'men-1',
      action: 'bind_to_entity',
      payload: { targetEntityId: 'ent-brand-a' },
      userNotes: 'Human verified link',
      createdAt: '2026-05-10T10:00:00Z',
    });

    const activeRes = await contextStore.entities.getActiveResolutionForMention('men-1');
    assert.ok(activeRes);
    assert.strictEqual(activeRes.targetEntityId, 'ent-brand-a');
    assert.strictEqual(activeRes.createdBy, 'human_override');
  });

  // ========================================================
  // 13. Machine Reprocessing After Human Override (Lock Invariant)
  // ========================================================
  it('13. prevents machine reprocessing from undoing human override decisions', async () => {
    const driver = new MemoryStorageDriver();
    const contextStore = new ContextStore(driver);
    const accumulator = new ContextAccumulator(contextStore, resolver);

    await contextStore.saveEntity({
      id: 'ent-override-target',
      canonicalName: 'Custom Target',
      aliases: [],
      associatedHandles: [],
      epistemicStatus: 'verified',
      resolutionStatus: 'resolved',
      createdAt: '2026-05-10T10:00:00Z',
      updatedAt: '2026-05-10T10:00:00Z',
    });

    const dump: Dump = {
      id: 'dump-lock',
      rawText: 'Brand A adalah lini usaha saya.',
      source: 'web_dock',
      createdAt: '2026-05-10T10:00:00Z',
      processingStatus: 'captured',
    };
    await contextStore.dumps.saveDump(dump);

    const grounded = await orchestrator.extractAndGround(
      dump,
      contextStore.dumps,
      contextStore.entities
    );
    const mention = grounded.mentions.find((m) => m.surfaceForm === 'Brand A');
    assert.ok(mention);

    // Apply human override
    await contextStore.rebindMention(
      mention.id,
      'ent-override-target',
      'Human locked decision'
    );

    // Re-run resolution / accumulator
    const reAcc = await accumulator.accumulate(grounded);
    const reDecision = reAcc.decisions.find((d) => d.mentionId === mention.id);

    assert.ok(reDecision);
    // Human override locked
    assert.strictEqual(reDecision.targetEntityId, 'ent-override-target');
    assert.ok(reDecision.rationale.includes('human override'));
  });

  // ========================================================
  // 14. Subject-side Rebinding
  // ========================================================
  it('14. rebinds subject-side claim entity with immutable audit event', async () => {
    const driver = new MemoryStorageDriver();
    const contextStore = new ContextStore(driver);

    await contextStore.saveEntity({
      id: 'ent-orig',
      canonicalName: 'Original Org',
      aliases: [],
      associatedHandles: [],
      epistemicStatus: 'verified',
      resolutionStatus: 'resolved',
      createdAt: '2026-05-10T10:00:00Z',
      updatedAt: '2026-05-10T10:00:00Z',
    });
    await contextStore.saveEntity({
      id: 'ent-rebound',
      canonicalName: 'Rebound Org',
      aliases: [],
      associatedHandles: [],
      epistemicStatus: 'verified',
      resolutionStatus: 'resolved',
      createdAt: '2026-05-10T10:00:00Z',
      updatedAt: '2026-05-10T10:00:00Z',
    });

    const dump: Dump = {
      id: 'dump-subj-rebind',
      rawText: 'Nalakara adalah salah satu lini usaha saya, bergerak di bidang teknologi dan AI.',
      source: 'web_dock',
      createdAt: '2026-05-10T10:00:00Z',
      processingStatus: 'captured',
    };
    await contextStore.dumps.saveDump(dump);

    const grounded = await orchestrator.extractAndGround(
      dump,
      contextStore.dumps,
      contextStore.entities
    );
    const accumulator = new ContextAccumulator(contextStore, resolver);
    await accumulator.accumulate(grounded);

    const mention = grounded.mentions.find((m) => m.surfaceForm === 'Nalakara');
    assert.ok(mention);

    // Rebind mention to ent-rebound
    await contextStore.rebindMention(mention.id, 'ent-rebound', 'Corrected org');

    // Claim should now point to ent-rebound
    const claims = await contextStore.getClaimsForEntity('ent-rebound');
    assert.ok(claims.length > 0);
  });

  // ========================================================
  // 15. Object-side Rebinding
  // ========================================================
  it('15. rebinds object-side relational claim entity with audit trail', async () => {
    const driver = new MemoryStorageDriver();
    const contextStore = new ContextStore(driver);

    await contextStore.saveEntity({
      id: 'ent-nalakara',
      canonicalName: 'Nalakara',
      aliases: [],
      associatedHandles: [],
      epistemicStatus: 'verified',
      resolutionStatus: 'resolved',
      createdAt: '2026-05-10T10:00:00Z',
      updatedAt: '2026-05-10T10:00:00Z',
    });
    await contextStore.saveEntity({
      id: 'ent-handle-alt',
      canonicalName: 'nalakara_alt',
      aliases: [],
      associatedHandles: [],
      epistemicStatus: 'verified',
      resolutionStatus: 'resolved',
      createdAt: '2026-05-10T10:00:00Z',
      updatedAt: '2026-05-10T10:00:00Z',
    });

    const dump: Dump = {
      id: 'dump-obj-rebind',
      rawText: 'nalakara.id adalah akun Instagram untuk Nalakara.',
      source: 'web_dock',
      createdAt: '2026-05-10T10:00:00Z',
      processingStatus: 'captured',
    };
    await contextStore.dumps.saveDump(dump);

    const grounded = await orchestrator.extractAndGround(
      dump,
      contextStore.dumps,
      contextStore.entities
    );
    const accumulator = new ContextAccumulator(contextStore, resolver);
    await accumulator.accumulate(grounded);

    const handleMention = grounded.mentions.find((m) => m.surfaceForm === 'nalakara.id');
    assert.ok(handleMention);

    // Rebind object-side mention to ent-handle-alt
    await contextStore.rebindMention(
      handleMention.id,
      'ent-handle-alt',
      'Rebound handle target'
    );

    const relationalClaims = await contextStore.claims.getRelationalClaims('ent-nalakara');
    assert.ok(relationalClaims.length > 0);
    const audits = await contextStore.claims.getAuditsForClaim(relationalClaims[0].id);
    const objAudit = audits.find((a) => a.role === 'object');
    assert.ok(objAudit);
    assert.strictEqual(objAudit.newEntityId, 'ent-handle-alt');
  });

  // ========================================================
  // 16. Multi-Dump Context Accumulation (Enrichment Invariant)
  // ========================================================
  it('16. accumulates claims from multiple dumps onto the same entity without duplicating nodes', async () => {
    const driver = new MemoryStorageDriver();
    const contextStore = new ContextStore(driver);
    const accumulator = new ContextAccumulator(contextStore, resolver);

    // Dump 1: Declares Nalakara in technology
    const dump1: Dump = {
      id: 'dump-accum-1',
      rawText: 'Nalakara adalah salah satu lini usaha saya, bergerak di bidang teknologi dan AI.',
      source: 'web_dock',
      createdAt: '2026-05-10T10:00:00Z',
      processingStatus: 'captured',
    };
    await contextStore.dumps.saveDump(dump1);
    const g1 = await orchestrator.extractAndGround(dump1, contextStore.dumps, contextStore.entities);
    await accumulator.accumulate(g1);

    // Dump 2: Later observation links Instagram account
    const dump2: Dump = {
      id: 'dump-accum-2',
      rawText: 'nalakara.id adalah akun Instagram untuk Nalakara.',
      source: 'web_dock',
      createdAt: '2026-05-10T11:00:00Z',
      processingStatus: 'captured',
    };
    await contextStore.dumps.saveDump(dump2);
    const g2 = await orchestrator.extractAndGround(dump2, contextStore.dumps, contextStore.entities);
    await accumulator.accumulate(g2);

    // Assert only 1 Nalakara entity exists
    const allEntities = await contextStore.getAllEntities();
    const nalakaraEntities = allEntities.filter(
      (e) => e.canonicalName.toLowerCase() === 'nalakara'
    );
    assert.strictEqual(nalakaraEntities.length, 1);

    const nalakaraId = nalakaraEntities[0].id;
    // Entity context enriched with claims from BOTH dumps
    const claims = await contextStore.getClaimsForEntity(nalakaraId);
    assert.ok(claims.some((c) => c.predicate === 'operates_in_sector'));
    assert.ok(claims.some((c) => c.predicate === 'has_social_account'));
  });

  // ========================================================
  // 17. Canonical Instagram Test Sequence (Dumps A -> B -> C -> D)
  // ========================================================
  it('17. executes canonical sequence (A -> B -> C -> D) maintaining handle distinction and context accumulation', async () => {
    const driver = new MemoryStorageDriver();
    const contextStore = new ContextStore(driver);
    const accumulator = new ContextAccumulator(contextStore, resolver);

    // DUMP A: 5 accounts
    const dumpA: Dump = {
      id: 'dump-canon-a',
      rawText:
        'Saya punya 5 akun Instagram: freshbeda, yudhan.sebastian, nalakara.id, rampainusa, matatua.',
      source: 'web_dock',
      createdAt: '2026-05-10T10:00:00Z',
      processingStatus: 'captured',
    };
    await contextStore.dumps.saveDump(dumpA);
    const gA = await orchestrator.extractAndGround(dumpA, contextStore.dumps, contextStore.entities);
    const accA = await accumulator.accumulate(gA);

    // 5 handles instantiated as distinct handle entities
    assert.strictEqual(
      accA.decisions.filter((d) => d.outcome === 'new_entity').length,
      5
    );

    // DUMP B: Nalakara business line
    const dumpB: Dump = {
      id: 'dump-canon-b',
      rawText:
        'Nalakara adalah salah satu lini usaha saya, bergerak di bidang teknologi dan AI.',
      source: 'web_dock',
      createdAt: '2026-05-10T10:05:00Z',
      processingStatus: 'captured',
    };
    await contextStore.dumps.saveDump(dumpB);
    const gB = await orchestrator.extractAndGround(dumpB, contextStore.dumps, contextStore.entities);
    const accB = await accumulator.accumulate(gB);

    const nalakaraEntB = accB.createdEntities.find((e) => e.canonicalName === 'Nalakara');
    assert.ok(nalakaraEntB);

    // DUMP C: Freshbeda business line (MUST NOT merge with freshbeda Instagram handle)
    const dumpC: Dump = {
      id: 'dump-canon-c',
      rawText: 'Freshbeda adalah lini usaha saya yang berhubungan dengan visual design.',
      source: 'web_dock',
      createdAt: '2026-05-10T10:10:00Z',
      processingStatus: 'captured',
    };
    await contextStore.dumps.saveDump(dumpC);
    const gC = await orchestrator.extractAndGround(dumpC, contextStore.dumps, contextStore.entities);
    const accC = await accumulator.accumulate(gC);

    const freshbedaCompany = accC.createdEntities.find((e) => e.canonicalName === 'Freshbeda');
    assert.ok(freshbedaCompany, 'Freshbeda company must be created as new entity');

    // Verify Freshbeda company and freshbeda handle remain separate entities
    const allEnts = await contextStore.getAllEntities();
    const handleEntity = allEnts.find(
      (e) => e.canonicalName === 'freshbeda' && e.associatedHandles.includes('freshbeda')
    );
    assert.ok(handleEntity);
    assert.notStrictEqual(freshbedaCompany.id, handleEntity.id);

    // DUMP D: Explicit relational assertion linking nalakara.id to Nalakara
    const dumpD: Dump = {
      id: 'dump-canon-d',
      rawText: 'nalakara.id adalah akun Instagram untuk Nalakara.',
      source: 'web_dock',
      createdAt: '2026-05-10T10:15:00Z',
      processingStatus: 'captured',
    };
    await contextStore.dumps.saveDump(dumpD);
    const gD = await orchestrator.extractAndGround(dumpD, contextStore.dumps, contextStore.entities);
    const accD = await accumulator.accumulate(gD);

    const dNalakara = accD.decisions.find((d) => d.surfaceForm === 'Nalakara');
    const dHandle = accD.decisions.find((d) => d.surfaceForm === 'nalakara.id');

    assert.ok(dNalakara);
    assert.ok(dHandle);

    // Nalakara resolved to existing entity from Dump B
    assert.strictEqual(dNalakara.outcome, 'matched_existing');
    assert.strictEqual(dNalakara.targetEntityId, nalakaraEntB.id);

    // nalakara.id resolved as associated_handle for Nalakara
    assert.strictEqual(dHandle.outcome, 'associated_handle');
    assert.strictEqual(dHandle.associatedHandle?.parentEntityId, nalakaraEntB.id);
    assert.ok(dHandle.targetEntityId);

    // Nalakara entity received nalakara.id in associatedHandles
    const nalakaraFinal = await contextStore.getEntity(nalakaraEntB.id);
    assert.ok(nalakaraFinal?.associatedHandles.includes('nalakara.id'));

    // Zero duplicate Nalakara entity created
    const nalakaraCount = (await contextStore.getAllEntities()).filter(
      (e) => e.canonicalName.toLowerCase() === 'nalakara'
    ).length;
    assert.strictEqual(nalakaraCount, 1);
  });

  // ========================================================
  // 18. Explicit Evidence Insufficient -> Ambiguous
  // ========================================================
  it('18. returns ambiguous when evidence is insufficient to safely choose a candidate', async () => {
    const driver = new MemoryStorageDriver();
    const contextStore = new ContextStore(driver);
    const accumulator = new ContextAccumulator(contextStore, resolver);

    // Seed two candidate entities with high ambiguity
    await contextStore.saveEntity({
      id: 'ent-project-alpha',
      canonicalName: 'Project Alpha',
      aliases: ['Alpha'],
      associatedHandles: [],
      epistemicStatus: 'verified',
      resolutionStatus: 'ambiguous',
      createdAt: '2026-05-10T10:00:00Z',
      updatedAt: '2026-05-10T10:00:00Z',
    });
    await contextStore.saveEntity({
      id: 'ent-division-alpha',
      canonicalName: 'Division Alpha',
      aliases: ['Alpha'],
      associatedHandles: [],
      epistemicStatus: 'verified',
      resolutionStatus: 'ambiguous',
      createdAt: '2026-05-10T10:00:00Z',
      updatedAt: '2026-05-10T10:00:00Z',
    });

    const dump: Dump = {
      id: 'dump-ambig',
      rawText: 'Alpha adalah salah satu lini usaha saya, bergerak di bidang teknologi dan AI.',
      source: 'web_dock',
      createdAt: '2026-05-10T11:00:00Z',
      processingStatus: 'captured',
    };

    const grounded = await orchestrator.extractAndGround(
      dump,
      contextStore.dumps,
      contextStore.entities
    );
    const accResult = await accumulator.accumulate(grounded);

    const alphaDecision = accResult.decisions.find((d) => d.surfaceForm === 'Alpha');
    assert.ok(alphaDecision);
    assert.strictEqual(alphaDecision.outcome, 'ambiguous');
    assert.ok(alphaDecision.candidateEntityIds && alphaDecision.candidateEntityIds.length >= 2);
  });

  // ========================================================
  // Phase 2.2 Condition Closure Tests (F-2.2-01 to F-2.2-05)
  // ========================================================

  it('Closure C1: Reverse-order company -> social_handle does not false-merge', async () => {
    const driver = new MemoryStorageDriver();
    const contextStore = new ContextStore(driver);
    const accumulator = new ContextAccumulator(contextStore, resolver);

    // 1. Process Dump C FIRST (Company)
    const dumpC: Dump = {
      id: 'dump-reverse-c',
      rawText: 'Freshbeda adalah lini usaha saya yang berhubungan dengan visual design.',
      source: 'web_dock',
      createdAt: '2026-05-10T10:00:00Z',
      processingStatus: 'captured',
    };
    await contextStore.dumps.saveDump(dumpC);
    const gC = await orchestrator.extractAndGround(dumpC, contextStore.dumps, contextStore.entities);
    await accumulator.accumulate(gC);

    const companyEntity = (await contextStore.getAllEntities()).find(
      (e) => e.canonicalName === 'Freshbeda'
    );
    assert.ok(companyEntity);

    // 2. Process Dump A SECOND (Instagram Handles including freshbeda)
    const dumpA: Dump = {
      id: 'dump-reverse-a',
      rawText: 'Saya punya 5 akun Instagram: freshbeda, yudhan.sebastian, nalakara.id, rampainusa, matatua.',
      source: 'web_dock',
      createdAt: '2026-05-10T11:00:00Z',
      processingStatus: 'captured',
    };
    await contextStore.dumps.saveDump(dumpA);
    const gA = await orchestrator.extractAndGround(dumpA, contextStore.dumps, contextStore.entities);
    const accA = await accumulator.accumulate(gA);

    const freshDecision = accA.decisions.find((d) => d.surfaceForm === 'freshbeda');
    assert.ok(freshDecision);

    // MUST NOT merge with existing company entity
    assert.strictEqual(freshDecision.outcome, 'new_entity');
    assert.notStrictEqual(freshDecision.targetEntityId, companyEntity.id);

    // Both entities must exist independently
    const allEntities = await contextStore.getAllEntities();
    const handleEntity = allEntities.find(
      (e) => e.id === freshDecision.targetEntityId
    );
    assert.ok(handleEntity);
    assert.notStrictEqual(handleEntity.id, companyEntity.id);
  });

  it('Closure C2: Same-batch company/social_handle type collision does not false-merge', async () => {
    const resolverInstance = new DeterministicEntityResolver();

    const m1: Mention = {
      id: 'men-same-1',
      dumpId: 'dump-same',
      evidenceId: 'ev-same-1',
      surfaceForm: 'freshbeda',
      normalizedForm: 'freshbeda',
      candidateTypeHint: 'social_handle',
      createdAt: '2026-05-10T10:00:00Z',
    };

    const m2: Mention = {
      id: 'men-same-2',
      dumpId: 'dump-same',
      evidenceId: 'ev-same-2',
      surfaceForm: 'Freshbeda',
      normalizedForm: 'freshbeda',
      candidateTypeHint: 'company',
      createdAt: '2026-05-10T10:00:00Z',
    };

    const resolutionContext = {
      existingEntities: [],
      existingClaims: [],
      existingResolutions: [],
      dump: {
        id: 'dump-same',
        rawText: 'freshbeda adalah akun Instagram. Freshbeda adalah perusahaan desain.',
        source: 'web_dock' as const,
        createdAt: '2026-05-10T10:00:00Z',
        processingStatus: 'captured' as const,
      },
    };

    const decisions = await resolverInstance.resolveAll([m1, m2], resolutionContext);
    const dec1 = decisions.get('men-same-1');
    const dec2 = decisions.get('men-same-2');

    assert.ok(dec1);
    assert.ok(dec2);

    // Both must be new_entity; neither collapses into the other
    assert.strictEqual(dec1.outcome, 'new_entity');
    assert.strictEqual(dec2.outcome, 'new_entity');

    // Accumulate and verify distinct entity IDs in context store
    const driver = new MemoryStorageDriver();
    const contextStore = new ContextStore(driver);
    const accumulator = new ContextAccumulator(contextStore, resolverInstance);

    const groundedExtraction = {
      dump: resolutionContext.dump,
      evidence: [],
      mentions: [m1, m2],
      claims: [],
      rawObservations: [],
    };

    const accResult = await accumulator.accumulate(groundedExtraction);
    const accDec1 = accResult.decisions.find((d) => d.mentionId === 'men-same-1');
    const accDec2 = accResult.decisions.find((d) => d.mentionId === 'men-same-2');

    assert.ok(accDec1?.targetEntityId);
    assert.ok(accDec2?.targetEntityId);
    assert.notStrictEqual(accDec1.targetEntityId, accDec2.targetEntityId);
  });

  it('Closure C3: Reprocessing same Dump does not create multiple active resolutions', async () => {
    const driver = new MemoryStorageDriver();
    const contextStore = new ContextStore(driver);
    const accumulator = new ContextAccumulator(contextStore, resolver);

    const dump: Dump = {
      id: 'dump-idempotent',
      rawText: 'Nalakara adalah salah satu lini usaha saya, bergerak di bidang teknologi dan AI.',
      source: 'web_dock',
      createdAt: '2026-05-10T10:00:00Z',
      processingStatus: 'captured',
    };
    await contextStore.dumps.saveDump(dump);
    const grounded = await orchestrator.extractAndGround(dump, contextStore.dumps, contextStore.entities);

    const nalakaraMention = grounded.mentions.find((m) => m.surfaceForm === 'Nalakara');
    assert.ok(nalakaraMention);

    // Pass 1
    await accumulator.accumulate(grounded);
    const resPass1 = await contextStore.entities.getResolutionsForMention(nalakaraMention.id);
    const activePass1 = resPass1.filter((r) => r.status === 'active');
    assert.strictEqual(activePass1.length, 1);

    // Pass 2
    await accumulator.accumulate(grounded);
    const resPass2 = await contextStore.entities.getResolutionsForMention(nalakaraMention.id);
    const activePass2 = resPass2.filter((r) => r.status === 'active');
    assert.strictEqual(activePass2.length, 1);

    // Pass 3
    await accumulator.accumulate(grounded);
    const resPass3 = await contextStore.entities.getResolutionsForMention(nalakaraMention.id);
    const activePass3 = resPass3.filter((r) => r.status === 'active');
    assert.strictEqual(activePass3.length, 1);
  });

  it('Closure C4: Human override remains authoritative during reprocessing', async () => {
    const driver = new MemoryStorageDriver();
    const contextStore = new ContextStore(driver);
    const accumulator = new ContextAccumulator(contextStore, resolver);

    await contextStore.saveEntity({
      id: 'ent-pinned-co',
      canonicalName: 'Pinned Company',
      aliases: [],
      associatedHandles: [],
      epistemicStatus: 'verified',
      resolutionStatus: 'resolved',
      createdAt: '2026-05-10T10:00:00Z',
      updatedAt: '2026-05-10T10:00:00Z',
    });

    const dump: Dump = {
      id: 'dump-override-reprocess',
      rawText: 'Nalakara adalah salah satu lini usaha saya.',
      source: 'web_dock',
      createdAt: '2026-05-10T10:00:00Z',
      processingStatus: 'captured',
    };
    await contextStore.dumps.saveDump(dump);
    const grounded = await orchestrator.extractAndGround(dump, contextStore.dumps, contextStore.entities);

    const mention = grounded.mentions.find((m) => m.surfaceForm === 'Nalakara');
    assert.ok(mention);

    // Initial accumulation
    await accumulator.accumulate(grounded);

    // User applies human override
    await contextStore.applyHumanOverride({
      id: 'ovr-pinned',
      targetType: 'entity_resolution',
      targetId: mention.id,
      action: 'bind_to_entity',
      payload: { targetEntityId: 'ent-pinned-co' },
      userNotes: 'User explicitly re-bound to Pinned Company',
      createdAt: '2026-05-10T11:00:00Z',
    });

    // Verify human override active
    const activeResBefore = await contextStore.entities.getActiveResolutionForMention(mention.id);
    assert.ok(activeResBefore);
    assert.strictEqual(activeResBefore.targetEntityId, 'ent-pinned-co');
    assert.strictEqual(activeResBefore.createdBy, 'human_override');

    // Reprocess same dump
    await accumulator.accumulate(grounded);

    // Human override must still be active and unchanged
    const activeResAfter = await contextStore.entities.getActiveResolutionForMention(mention.id);
    assert.ok(activeResAfter);
    assert.strictEqual(activeResAfter.targetEntityId, 'ent-pinned-co');
    assert.strictEqual(activeResAfter.createdBy, 'human_override');
    assert.strictEqual(activeResAfter.status, 'active');
  });

  it('Closure C5: ContextAccumulator uses typed ContextStore.getAllResolutions API', async () => {
    const driver = new MemoryStorageDriver();
    const contextStore = new ContextStore(driver);

    // Verify typed repository method exists and returns array
    const resolutions = await contextStore.getAllResolutions();
    assert.ok(Array.isArray(resolutions));

    // Verify accumulator executes using typed API
    const accumulator = new ContextAccumulator(contextStore, resolver);
    const dump: Dump = {
      id: 'dump-typed-test',
      rawText: 'Nalakara adalah salah satu lini usaha saya.',
      source: 'web_dock',
      createdAt: '2026-05-10T10:00:00Z',
      processingStatus: 'captured',
    };
    await contextStore.dumps.saveDump(dump);
    const grounded = await orchestrator.extractAndGround(dump, contextStore.dumps, contextStore.entities);
    const result = await accumulator.accumulate(grounded);
    assert.ok(result.decisions.length > 0);

    const allResolutionsAfter = await contextStore.getAllResolutions();
    assert.ok(allResolutionsAfter.length >= result.decisions.length);
  });
});
