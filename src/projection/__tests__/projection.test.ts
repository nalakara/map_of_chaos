import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Claim, Dump, Entity } from '../../domain/types';
import { MemoryStorageDriver } from '../../storage/db';
import { ContextStore } from '../../storage/contextStore';
import { SemanticExtractionOrchestrator } from '../../pipeline/extraction/extractor';
import { DeterministicSemanticExtractor } from '../../pipeline/extraction/deterministic';
import { DeterministicEntityResolver } from '../../pipeline/resolution/resolver';
import { ContextAccumulator } from '../../pipeline/resolution/accumulator';
import { USER_SELF_ENTITY_ID } from '../../pipeline/resolution/types';
import { ContextProjector } from '../projector';
import { projectToMapElements } from '../adapter';

describe('Phase 3 — Context Projection Suite', () => {
  const projector = new ContextProjector();

  // ========================================================
  // 1. Entity projects to ThingProjection
  // ========================================================
  it('1. projects Entity to ThingProjection with stable identity', () => {
    const entities: Entity[] = [
      {
        id: 'ent-nalakara-biz',
        canonicalName: 'Nalakara',
        aliases: [],
        associatedHandles: [],
        epistemicStatus: 'verified',
        resolutionStatus: 'resolved',
        createdAt: '2026-05-10T10:00:00Z',
        updatedAt: '2026-05-10T10:00:00Z',
      },
    ];

    const result = projector.projectFromContext(entities, []);

    assert.strictEqual(result.things.length, 1);
    const thing = result.things[0];
    assert.strictEqual(thing.id, 'ent-nalakara-biz');
    assert.strictEqual(thing.entityId, 'ent-nalakara-biz');
    assert.strictEqual(thing.title, 'Nalakara');
    assert.deepStrictEqual(thing.displayTypes, ['concept']);
    assert.strictEqual(thing.uncertaintyBadge, 'verified');
    assert.strictEqual(thing.isProjected, true);
    assert.strictEqual(thing.projectionReason, 'isolated_presence');
    assert.strictEqual(thing.degree, 0);
  });

  // ========================================================
  // 2. Resolved relational Claim projects to EdgeProjection
  // ========================================================
  it('2. projects resolved relational Claim to EdgeProjection', () => {
    const entities: Entity[] = [
      {
        id: 'ent-nalakara',
        canonicalName: 'Nalakara',
        aliases: [],
        associatedHandles: [],
        epistemicStatus: 'verified',
        resolutionStatus: 'resolved',
        createdAt: '2026-05-10T10:00:00Z',
        updatedAt: '2026-05-10T10:00:00Z',
      },
      {
        id: 'ent-nalakara.id',
        canonicalName: 'nalakara.id',
        aliases: [],
        associatedHandles: ['nalakara.id'],
        epistemicStatus: 'verified',
        resolutionStatus: 'resolved',
        createdAt: '2026-05-10T10:00:00Z',
        updatedAt: '2026-05-10T10:00:00Z',
      },
    ];

    const claims: Claim[] = [
      {
        id: 'clm-rel-1',
        dumpId: 'dump-1',
        subjectEntityId: 'ent-nalakara',
        predicate: 'has_social_account',
        objectValue: {
          type: 'entity_id',
          value: 'ent-nalakara.id',
        },
        qualifiers: { platform: 'instagram' },
        observationTime: '2026-05-10T10:00:00Z',
        temporalScope: 'present',
        sourceOrigin: 'human_stated',
        reviewState: 'human_confirmed',
        evidenceId: 'ev-1',
        supportingEvidenceIds: ['ev-1'],
        status: 'active',
        createdAt: '2026-05-10T10:00:00Z',
        updatedAt: '2026-05-10T10:00:00Z',
      },
    ];

    const result = projector.projectFromContext(entities, claims);

    assert.strictEqual(result.edges.length, 1);
    const edge = result.edges[0];
    assert.strictEqual(edge.sourceThingId, 'ent-nalakara');
    assert.strictEqual(edge.targetThingId, 'ent-nalakara.id');
    assert.strictEqual(edge.label, 'has_social_account');
    assert.strictEqual(edge.style, 'solid');
    assert.strictEqual(edge.isVisible, true);

    // Degree and salience updated on connected things
    const nalakaraThing = result.things.find((t) => t.id === 'ent-nalakara');
    const handleThing = result.things.find((t) => t.id === 'ent-nalakara.id');
    assert.strictEqual(nalakaraThing?.degree, 1);
    assert.strictEqual(nalakaraThing?.projectionReason, 'high_salience');
    assert.strictEqual(handleThing?.degree, 1);
    assert.strictEqual(handleThing?.projectionReason, 'high_salience');
  });

  // ========================================================
  // 3. Claim without resolved endpoint does not invent edge
  // ========================================================
  it('3. does NOT create an edge or invent a node when claim lacks resolved endpoints', () => {
    const entities: Entity[] = [
      {
        id: 'ent-nalakara',
        canonicalName: 'Nalakara',
        aliases: [],
        associatedHandles: [],
        epistemicStatus: 'verified',
        resolutionStatus: 'resolved',
        createdAt: '2026-05-10T10:00:00Z',
        updatedAt: '2026-05-10T10:00:00Z',
      },
    ];

    const claims: Claim[] = [
      // Relational claim pointing to non-existent entity
      {
        id: 'clm-missing-target',
        dumpId: 'dump-missing',
        subjectEntityId: 'ent-nalakara',
        predicate: 'has_social_account',
        objectValue: {
          type: 'entity_id',
          value: 'ent-ghost-endpoint',
        },
        observationTime: '2026-05-10T10:00:00Z',
        temporalScope: 'present',
        sourceOrigin: 'human_stated',
        reviewState: 'needs_review',
        evidenceId: 'ev-2',
        supportingEvidenceIds: ['ev-2'],
        status: 'active',
        createdAt: '2026-05-10T10:00:00Z',
        updatedAt: '2026-05-10T10:00:00Z',
      },
      // Concept claim (non-relational)
      {
        id: 'clm-concept',
        dumpId: 'dump-concept',
        subjectEntityId: 'ent-nalakara',
        predicate: 'operates_in_sector',
        objectValue: {
          type: 'concept',
          value: 'AI',
        },
        observationTime: '2026-05-10T10:00:00Z',
        temporalScope: 'present',
        sourceOrigin: 'human_stated',
        reviewState: 'needs_review',
        evidenceId: 'ev-3',
        supportingEvidenceIds: ['ev-3'],
        status: 'active',
        createdAt: '2026-05-10T10:00:00Z',
        updatedAt: '2026-05-10T10:00:00Z',
      },
    ];

    const result = projector.projectFromContext(entities, claims);

    // No phantom nodes created
    assert.strictEqual(result.things.length, 1);
    assert.strictEqual(result.things[0].id, 'ent-nalakara');

    // No edge created
    assert.strictEqual(result.edges.length, 0);
    assert.strictEqual(result.diagnostics.skippedEdgesCount, 1);
    assert.strictEqual(result.things[0].degree, 0);
    assert.strictEqual(result.things[0].projectionReason, 'isolated_presence');
  });

  // ========================================================
  // 4. Similar names remain distinct projected nodes
  // ========================================================
  it('4. preserves separate projected nodes for similar names without false connection', () => {
    const entities: Entity[] = [
      {
        id: 'ent-freshbeda-company',
        canonicalName: 'Freshbeda',
        aliases: [],
        associatedHandles: [],
        epistemicStatus: 'verified',
        resolutionStatus: 'resolved',
        createdAt: '2026-05-10T10:00:00Z',
        updatedAt: '2026-05-10T10:00:00Z',
      },
      {
        id: 'ent-freshbeda-handle',
        canonicalName: 'freshbeda',
        aliases: [],
        associatedHandles: ['freshbeda'],
        epistemicStatus: 'verified',
        resolutionStatus: 'resolved',
        createdAt: '2026-05-10T10:00:00Z',
        updatedAt: '2026-05-10T10:00:00Z',
      },
    ];

    // No claims connecting them
    const result = projector.projectFromContext(entities, []);

    assert.strictEqual(result.things.length, 2);
    const company = result.things.find((t) => t.id === 'ent-freshbeda-company');
    const handle = result.things.find((t) => t.id === 'ent-freshbeda-handle');

    assert.ok(company);
    assert.ok(handle);
    assert.notStrictEqual(company.id, handle.id);
    assert.strictEqual(company.title, 'Freshbeda');
    assert.strictEqual(handle.title, 'freshbeda');

    // Zero connecting edges between them
    assert.strictEqual(result.edges.length, 0);
  });

  // ========================================================
  // 5. Canonical A -> B -> C -> D Sequence Projection
  // ========================================================
  it('5. projects canonical sequence (A -> B -> C -> D) with correct semantic graph', async () => {
    const driver = new MemoryStorageDriver();
    const contextStore = new ContextStore(driver);
    const deterministic = new DeterministicSemanticExtractor();
    const orchestrator = new SemanticExtractionOrchestrator(deterministic);
    const resolver = new DeterministicEntityResolver();
    const accumulator = new ContextAccumulator(contextStore, resolver);

    // DUMP A: 5 accounts
    const dumpA: Dump = {
      id: 'dump-proj-a',
      rawText:
        'Saya punya 5 akun Instagram: freshbeda, yudhan.sebastian, nalakara.id, rampainusa, matatua.',
      source: 'web_dock',
      createdAt: '2026-05-10T10:00:00Z',
      processingStatus: 'captured',
    };
    await contextStore.dumps.saveDump(dumpA);
    const gA = await orchestrator.extractAndGround(dumpA, contextStore.dumps, contextStore.entities);
    await accumulator.accumulate(gA);

    // DUMP B: Nalakara business line
    const dumpB: Dump = {
      id: 'dump-proj-b',
      rawText:
        'Nalakara adalah salah satu lini usaha saya, bergerak dalam bidang teknologi dan kecerdasan buatan.',
      source: 'web_dock',
      createdAt: '2026-05-10T10:05:00Z',
      processingStatus: 'captured',
    };
    await contextStore.dumps.saveDump(dumpB);
    const gB = await orchestrator.extractAndGround(dumpB, contextStore.dumps, contextStore.entities);
    await accumulator.accumulate(gB);

    // DUMP C: Freshbeda business line
    const dumpC: Dump = {
      id: 'dump-proj-c',
      rawText: 'Freshbeda adalah lini usaha lain yang berhubungan dengan visual design.',
      source: 'web_dock',
      createdAt: '2026-05-10T10:10:00Z',
      processingStatus: 'captured',
    };
    await contextStore.dumps.saveDump(dumpC);
    const gC = await orchestrator.extractAndGround(dumpC, contextStore.dumps, contextStore.entities);
    await accumulator.accumulate(gC);

    // DUMP D: Explicit relational assertion
    const dumpD: Dump = {
      id: 'dump-proj-d',
      rawText: 'nalakara.id adalah akun Instagram untuk Nalakara.',
      source: 'web_dock',
      createdAt: '2026-05-10T10:15:00Z',
      processingStatus: 'captured',
    };
    await contextStore.dumps.saveDump(dumpD);
    const gD = await orchestrator.extractAndGround(dumpD, contextStore.dumps, contextStore.entities);
    await accumulator.accumulate(gD);

    // Run ContextProjector over the accumulated context store
    const projection = await projector.project(contextStore);

    // 1. Visually discoverable nodes
    const titles = projection.things.map((t) => t.title);
    assert.ok(titles.includes('Nalakara'), 'Nalakara must be projected');
    assert.ok(titles.includes('Freshbeda'), 'Freshbeda company must be projected');
    assert.ok(titles.includes('nalakara.id'), 'nalakara.id handle must be projected');
    assert.ok(titles.includes('freshbeda'), 'freshbeda handle must be projected');
    assert.ok(titles.includes('yudhan.sebastian'), 'yudhan.sebastian must be projected');
    assert.ok(titles.includes('rampainusa'), 'rampainusa must be projected');
    assert.ok(titles.includes('matatua'), 'matatua must be projected');

    // User self origin node is projected
    const userThing = projection.things.find((t) => t.entityId === USER_SELF_ENTITY_ID);
    assert.ok(userThing, 'User Self must be projected');
    assert.strictEqual(userThing.projectionReason, 'user_pinned');
    assert.strictEqual(userThing.radius, 28);

    // 2. Freshbeda company and freshbeda handle remain separate nodes
    const freshbedaCompany = projection.things.find(
      (t) => t.title === 'Freshbeda' && t.displayTypes.includes('company')
    );
    const freshbedaHandle = projection.things.find(
      (t) => t.title === 'freshbeda' && t.displayTypes.includes('social_handle')
    );
    assert.ok(freshbedaCompany);
    assert.ok(freshbedaHandle);
    assert.notStrictEqual(freshbedaCompany.id, freshbedaHandle.id);

    // No edge between Freshbeda company and freshbeda handle
    const falseMergeEdge = projection.edges.find(
      (e) =>
        (e.sourceThingId === freshbedaCompany.id && e.targetThingId === freshbedaHandle.id) ||
        (e.sourceThingId === freshbedaHandle.id && e.targetThingId === freshbedaCompany.id)
    );
    assert.strictEqual(falseMergeEdge, undefined, 'Must not invent edge between Freshbeda and freshbeda');

    // 3. Nalakara and nalakara.id are separate nodes connected by explicit has_social_account edge
    const nalakaraCompany = projection.things.find(
      (t) => t.title === 'Nalakara' && t.displayTypes.includes('company')
    );
    const nalakaraHandle = projection.things.find(
      (t) => t.title === 'nalakara.id' && t.displayTypes.includes('social_handle')
    );
    assert.ok(nalakaraCompany);
    assert.ok(nalakaraHandle);
    assert.notStrictEqual(nalakaraCompany.id, nalakaraHandle.id);

    const nalakaraEdge = projection.edges.find(
      (e) =>
        e.sourceThingId === nalakaraCompany.id &&
        e.targetThingId === nalakaraHandle.id &&
        e.label === 'has_social_account'
    );
    assert.ok(nalakaraEdge, 'Explicit has_social_account edge must connect Nalakara to nalakara.id');

    // 4. Adapt to MapCanvas elements
    const mapElements = projectToMapElements(projection);
    assert.strictEqual(mapElements.things.length, projection.things.length);
    assert.strictEqual(mapElements.relationships.length, projection.edges.length);
    const rootThing = mapElements.things.find((t) => t.isRoot);
    assert.ok(rootThing);
    assert.strictEqual(rootThing.id, USER_SELF_ENTITY_ID);
  });

  // ========================================================
  // 6. Reprojecting unchanged context does not create duplicates
  // ========================================================
  it('6. reprojecting unchanged context is idempotent with stable identities', () => {
    const entities: Entity[] = [
      {
        id: 'ent-stable-1',
        canonicalName: 'Alpha',
        aliases: [],
        associatedHandles: [],
        epistemicStatus: 'verified',
        resolutionStatus: 'resolved',
        createdAt: '2026-05-10T10:00:00Z',
        updatedAt: '2026-05-10T10:00:00Z',
      },
    ];

    const run1 = projector.projectFromContext(entities, []);
    const run2 = projector.projectFromContext(entities, []);

    assert.strictEqual(run1.things.length, 1);
    assert.strictEqual(run2.things.length, 1);
    assert.strictEqual(run1.things[0].id, run2.things[0].id);
    assert.strictEqual(run1.things[0].title, run2.things[0].title);
  });
});
