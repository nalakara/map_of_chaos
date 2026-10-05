# Phase 3 — Minimum Context Projection

## 1. Objective

The objective of Phase 3 is to make the semantic context already built by Phase 1 (Domain & Storage) and Phase 2 (Semantic Extraction Core & Entity Resolution) visible and usable in the existing Map of Chaos without inventing additional semantic relationships, adding artificial graph intelligence, or introducing external inference services.

The pipeline boundary enforced is:
```
Raw Dump → Semantic Extraction → Entity Resolution → ContextStore → ContextProjector → MapCanvas
```

---

## 2. Existing Architecture Reviewed

1. **Context Model as Source of Truth**:
   The domain architecture strictly separates semantic context (`Entity`, `Claim`, `Evidence`, `Mention`, `EntityResolution`) from downstream visual graph representations (`ThingProjection`, `EdgeProjection`). Semantic truth lives exclusively inside `ContextStore` (backed by IndexedDB/Memory driver), while the graph canvas is an ephemeral spatial projection layer.
2. **Existing MapCanvas Component**:
   [`src/components/MapCanvas.tsx`](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/components/MapCanvas.tsx) utilizes D3 force simulation (`d3-force`) consuming `Thing[]` nodes and `Relationship[]` links. It natively supports node radii, labels, drag coordinates, isolated node repulsions, and root origin anchoring.
3. **Legacy Heuristics Decoupled**:
   The previous `analyzeDumpLocally` routine in `src/services/aiService.ts` manufactured ungrounded ad-hoc relationships and local things. Phase 3 routes user dumps through the validated semantic pipeline into `ContextStore`, projecting the verified context directly into `MapCanvas` without bypasses.

---

## 3. Projection Path

Phase 3 established a dedicated projection module located in `src/projection/`:

```
ContextStore (getAllEntities, getAllClaims)
       │
       ▼
ContextProjector (src/projection/projector.ts)
       │
       ├── Entity[] ────────► ThingProjection[] (stable ID = entity.id)
       │
       └── Relational Claims ─► EdgeProjection[] (endpoints verified)
       │
       ▼
ProjectionResult (things, edges, diagnostics)
       │
       ▼
projectToMapElements (src/projection/adapter.ts)
       │
       ▼
MapCanvas ({ things, relationships })
```

Both `project(contextStore: IContextStore)` and `projectFromContext(entities: Entity[], claims: Claim[])` are deterministic, reproducible, and synchronous in transformation logic.

---

## 4. Entity Projection

Persistent `Entity` records are projected into `ThingProjection`:
- **Stable Identity**: `thing.id = entity.id` and `thing.entityId = entity.id`. Node identities do not churn between renders or re-projections.
- **Title**: `entity.canonicalName`.
- **Display Types**:
  - `['person', 'origin']` for `USER_SELF_ENTITY_ID` (`'ent-user-self'`).
  - `['company']` if context claims indicate business operations (`operates_business`, `category: 'business_line'`, `focuses_on_domain`, or `operates_in_sector`).
  - `['social_handle']` if the entity represents a handle (`associatedHandles.length > 0`).
  - `['concept']` by default.
- **Uncertainty Badge**:
  - `'verified'` when `epistemicStatus === 'verified'`.
  - `'ambiguous'` when `resolutionStatus === 'ambiguous'`.
  - `'unverified'` when `epistemicStatus === 'unverified'`.
- **Salience & Sizing**:
  - Root node is pinned (`projectionReason: 'user_pinned'`, `radius: 28`).
  - Non-root nodes default to `isolated_presence` (`radius: 14`), dynamically upgraded to `high_salience` (`radius: 14 + degree * 2.5`) as connected relational edges accumulate.
- **Filtering**: Internal provenance records (`Evidence`, `Mention`, `EntityResolution`, audits, raw dumps) are NEVER projected as canvas nodes.

---

## 5. Claim / Edge Projection

Relational `Claim` records are projected into `EdgeProjection`:
- **Relational Qualification**: A claim produces an edge candidate if and only if `claim.status === 'active'`, `claim.reviewState !== 'rejected'`, and `claim.objectValue.type === 'entity_id'`.
- **Strict Endpoint Verification**:
  - The projector looks up both `claim.subjectEntityId` and `claim.objectValue.value` in the map of projected entities.
  - If **either** endpoint is missing, ambiguous, or unresolved, **no edge is created** and **no phantom node is invented**. The diagnostic counter `skippedEdgesCount` is incremented.
- **Edge Attributes**:
  - `id`: `edge-${claim.id}`
  - `sourceThingId`: `claim.subjectEntityId`
  - `targetThingId`: `claim.objectValue.value`
  - `label`: `claim.predicate` (e.g., `'has_social_account'`, `'owns_social_account'`)
  - `style`: `'solid'` for human-stated/human-confirmed claims; `'dashed'` for provisional claims.

---

## 6. MapCanvas Integration

1. **Adapter Layer (`src/projection/adapter.ts`)**:
   `projectToMapElements(projection, existingCoords)` converts `ThingProjection[]` and `EdgeProjection[]` into the `Thing[]` and `Relationship[]` structures consumed by `MapCanvas`.
2. **Coordinate Stability**:
   User-dragged node coordinates are preserved across re-projections by passing existing coordinates into the adapter.
3. **Application Lifecycle (`src/App.tsx`)**:
   - **Mount Sync**: On application load, `useEffect` queries `getDefaultContextStore()`. If existing entities exist in IndexedDB, they are projected immediately to populate `MapCanvas`.
   - **Dump Ingestion**: When the user enters text in the `DumpBox`, `handleDump` executes:
     1. Ingest raw text as domain `Dump`.
     2. Save to `ContextStore`.
     3. Run `SemanticExtractionOrchestrator.extractAndGround`.
     4. Run `DeterministicEntityResolver` and `ContextAccumulator.accumulate`.
     5. Run `ContextProjector.project(store)`.
     6. Adapt to `MapCanvas` elements and render.
   - **Clean Reset**: `handleResetToDemo` clears `ContextStore` stores before reverting to prototype demo fixtures.

---

## 7. Canonical Scenario

The canonical sequence (Dumps A → B → C → D) was verified end-to-end:

- **DUMP A**: `"Saya punya 5 akun Instagram: freshbeda, yudhan.sebastian, nalakara.id, rampainusa, matatua."`
  - Projects `User Self` (`isRoot: true`) and 5 distinct account nodes (`freshbeda`, `yudhan.sebastian`, `nalakara.id`, `rampainusa`, `matatua`).
  - Projects `owns_social_account` edges from `User Self` to each handle.
- **DUMP B**: `"Nalakara adalah salah satu lini usaha saya, bergerak dalam bidang teknologi dan kecerdasan buatan."`
  - Projects `Nalakara` as a distinct `company` entity node.
- **DUMP C**: `"Freshbeda adalah lini usaha lain yang berhubungan dengan visual design."`
  - Projects `Freshbeda` as a distinct `company` entity node.
  - **Critical Distinction Maintained**: `Freshbeda` (company) and `freshbeda` (social handle) remain two distinct visual nodes with separate IDs and **zero connecting edges**.
- **DUMP D**: `"nalakara.id adalah akun Instagram untuk Nalakara."`
  - Projects an explicit relational edge:
    `Nalakara` ── `has_social_account` ──► `nalakara.id`
  - Connects the company to the handle without merging their identities.

---

## 8. Tests

Implemented in [`src/projection/__tests__/projection.test.ts`](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/projection/__tests__/projection.test.ts):
1. **Entity to ThingProjection**: Verifies stable identity, title, types, uncertainty badge, and isolated presence reason.
2. **Relational Claim to EdgeProjection**: Verifies edge generation, endpoint binding, and salience degree updates.
3. **Endpoint Grounding Defense**: Proves that claims with missing or non-entity targets do NOT invent edges or nodes.
4. **Name Distinction Defense**: Proves that similar names (`Freshbeda` company vs `freshbeda` handle) remain separate nodes without an invented link.
5. **Canonical Vertical Slice (A → B → C → D)**: Proves full end-to-end pipeline extraction, resolution, context accumulation, and projection to `MapCanvas` elements.
6. **Reprojection Idempotency**: Proves that reprojecting identical context produces identical outputs without duplicate nodes.

---

## 9. Test Results

### Test Suite Execution
```bash
node --import tsx --test \
  src/domain/__tests__/*.test.ts \
  src/storage/__tests__/*.test.ts \
  src/pipeline/__tests__/*.test.ts \
  src/projection/__tests__/*.test.ts
```
- **Total Test Suites:** 11
- **Total Tests:** 69
- **Passing:** 69
- **Failing:** 0
- **Duration:** ~5.0s

### Code Quality & Production Build
- **Typecheck & Lint (`npm run lint` / `tsc --noEmit`):** PASS (0 errors, 0 warnings)
- **Production Bundle (`npm run build` / `vite build`):** PASS (Built in 2.56s)

---

## 10. Known Limitations

1. **Playwright Browser Subagent Driver Download**:
   Automated browser video recording was blocked by an external Playwright driver CDN 404 (`https://playwright.azureedge.net/.../playwright-1.57.0-mac.zip`). Integration verification was completed via direct HTTP preview testing (`http://localhost:5050`) and full end-to-end unit/integration suites.
2. **F-2.2-03 (Informational)**: Ambiguous claims are currently skipped during ContextAccumulator persistence.
3. **F-2.2-06 (Informational)**: Claim subject matching matches on mention text rather than character span offsets.

---

## 11. Explicitly Deferred

The following capabilities were intentionally excluded from Phase 3 in compliance with architectural discipline:
- Wander improvements and reflection engine refactoring
- Graph intelligence and graph completion algorithms
- AI/LLM relationship inference
- Embeddings and vector search (Qdrant, Pinecone, Mem0)
- UI redesign and canvas restyling
- Graph analytics and centrality algorithms
- Advanced full-text and semantic search
- Historical legacy localStorage migration project
- Multi-user and cloud scalability infrastructure

---

## 12. Phase Boundary

Phase 3 is strictly confined to projecting verified semantic context from `ContextStore` into the existing Map.
- No AI or external inference was introduced.
- No semantic interpretation was assigned to `MapCanvas`.
- Future phases (Wander, Search, Catalog views, V0 migration) have NOT been started.

---

## 13. Verdict

```
COMPLETE
```
