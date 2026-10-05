# Phase 2.2 — Condition Closure

## 1. Scope

This document records the verification and resolution of the four concrete conditions identified in the Phase 2.2 read-only audit ([`docs/phase_2_2_audit.md`](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/docs/phase_2_2_audit.md)).

Only the following conditions and findings were addressed:
- **Condition 1 (F-2.2-01):** Reverse-Order Handle Separation
- **Condition 2 (F-2.2-02):** Intra-Batch Type Compatibility
- **Condition 3 (F-2.2-04):** Resolution Reprocessing Idempotency
- **Condition 4 (F-2.2-05):** Repository Encapsulation

Explicit scope boundaries enforced during this closure:
- No redesign of Entity Resolution, Candidate Generation, Decision Gate, Entity model, Claim model, or ContextStore.
- No introduction of LLMs, embeddings, vector search, or external AI/cloud services.
- No commencement of Phase 3 (Graph Projection, D3 MapCanvas, Wander, UI changes).
- Findings **F-2.2-03** and **F-2.2-06** were NOT modified and remain preserved as known audit findings.

---

## 2. Condition 1 — Reverse-Order Handle Separation

### Root Cause
In `DecisionGate.ts` Step 5, when resolving a Mention with `candidateTypeHint === 'social_handle'`, the gate looked up existing entities matching `candidate.normalizedForm === mention.normalizedForm` via `exactHandleEntity`. However, it did not verify whether the candidate entity had an incompatible semantic type (e.g. `typeCompatibility === 'mismatch'`). When Dump C was ingested first, it created an entity `Freshbeda` with type `company`. When Dump A arrived subsequently with surface form `"freshbeda"` and type hint `"social_handle"`, Step 5 matched `exactHandleEntity` solely on lowercase string equality and incorrectly merged the handle into the company as `matched_existing`.

### Minimal Fix
In [`src/pipeline/resolution/decisionGate.ts`](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/pipeline/resolution/decisionGate.ts):
Step 5's `exactHandleEntity` discovery predicate was updated to explicitly require type compatibility:
```typescript
const exactHandleEntity = context.candidates
  .filter(c => c.typeCompatibility !== 'mismatch' && CandidateGenerator.checkTypeCompatibility(mention, c.entity, context) !== 'mismatch')
  .map(c => c.entity)
  .find(e => e.canonicalName.toLowerCase() === mention.normalizedForm);
```
Furthermore, `CandidateGenerator.checkTypeCompatibility` was made static and updated to inspect both persisted and simulated entity types, ensuring that a `social_handle` mention will not match an entity established as a `company` unless registered in `associatedHandles`.

### Test
Implemented `Closure C1: Reverse-order company -> social_handle does not false-merge`:
1. Ingest Dump C first ("Freshbeda adalah lini usaha saya yang berhubungan dengan visual design.") -> creates `Freshbeda` (`company`).
2. Ingest Dump A second ("Saya punya akun Instagram: freshbeda.") -> Mention `freshbeda` (`social_handle`).
3. Assert `decision.outcome === 'new_entity'`, minting a distinct entity (`ent-freshbeda-social_handle`) preserving separation until explicit association evidence arrives.

### Result
**RESOLVED.** Reverse-order processing preserves distinct identities for `Freshbeda` (business) and `freshbeda` (social handle).

---

## 3. Condition 2 — Intra-Batch Type Compatibility

### Root Cause
In intra-batch processing (mentions occurring within the same raw dump or before persistence), `CandidateGenerator.checkTypeCompatibility` previously only inspected persisted `ContextStore` claims (`context.existingClaims`). For newly simulated entities minted in the current batch, no claims existed yet in storage. Consequently, co-occurring mentions of different types (e.g. a handle and a company sharing the name `"freshbeda"` in the same sentence or batch) bypassed compatibility checks and could merge into a single entity.

### Minimal Fix
1. In [`src/pipeline/resolution/resolver.ts`](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/pipeline/resolution/resolver.ts):
   When `resolveAll` records a simulated entity for subsequent decisions within the same batch, it now records `typeHint: decision.proposedEntity.typeHint` directly on the simulated entity record.
2. In [`src/pipeline/resolution/candidateGen.ts`](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/pipeline/resolution/candidateGen.ts):
   `checkTypeCompatibility` was updated to check:
   - In-flight/simulated entity `typeHint`.
   - Direct entity ID claims in `context.existingClaims`.
   - `entity.associatedHandles` for established handle associations.
   - In-flight extracted claims in `context.currentExtraction.claims` grounded to the subject mention.

### Test
Implemented `Closure C2: Same-batch company/social_handle type collision does not false-merge`:
1. Provide single grounded extraction containing two mentions in the same dump:
   - Mention 1: `"freshbeda"` (`candidateTypeHint: 'social_handle'`)
   - Mention 2: `"Freshbeda"` (`candidateTypeHint: 'company'`)
2. Run `resolver.resolveAll`.
3. Assert Mention 1 resolves to `new_entity` (`ent-freshbeda-social_handle`).
4. Assert Mention 2 resolves to `new_entity` (`ent-freshbeda-company`).
5. Accumulate both into `ContextStore` and assert two distinct entity records exist with separate canonical identities.

### Result
**RESOLVED.** Same-batch type collisions are prevented without fabricating semantic inferences or external dependencies.

---

## 4. Condition 3 — Resolution Reprocessing Idempotency

### Root Cause
When a Dump was re-accumulated multiple times, `ContextAccumulator.persistResolutions` unconditionally created and stored a new `EntityResolution` record with `status: 'active'`, leaving multiple active machine resolution records for the exact same mention ID without superseding prior runs.

### Minimal Fix & Resolution Lifecycle
In [`src/pipeline/resolution/accumulator.ts`](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/pipeline/resolution/accumulator.ts):
1. Query active resolutions using `getActiveResolutionForMention(existingResolutions, res.mentionId)`.
2. **Authority Rule:** If an active resolution was set by a human (`resolvedBy === 'human'`), machine reprocessing ignores it and does NOT overwrite or supersede it.
3. **Idempotency Rule:** If an existing active machine resolution has the identical outcome and target entity, the new resolution is skipped (idempotent no-op).
4. **Supersession Rule:** If the machine resolution outcome or target has changed, the previous machine resolution is transitioned to `superseded` via `supersedeResolution(existingActive, res.id)` and persisted, while the new resolution is stored as `active`.
5. Historical records and audit events are strictly preserved without deletion.

### Test
Implemented `Closure C3` and `Closure C4`:
- `Closure C3`: Ingest the same Dump 3 consecutive times. Assert that exactly 1 active resolution exists for each mention in `ContextStore`, while history is preserved.
- `Closure C4`: Apply a human override on a mention resolution. Reprocess the identical dump via `accumulator.accumulate()`. Assert that the active resolution remains `resolvedBy === 'human'` with the human-assigned target entity.

### Result
**RESOLVED.** Reprocessing is fully idempotent, preserves audit history, maintains exactly one active machine resolution per mention, and guarantees human override authority.

---

## 5. Condition 4 — Repository Encapsulation

### Root Cause
In `ContextAccumulator.ts`, previous code retrieved existing resolution records by bypassing the repository layer:
```typescript
(this.contextStore as any).driver.getAll('entity_resolutions')
```
This leaked the raw storage driver and broke encapsulation boundaries.

### Minimal Fix
1. In [`src/storage/entityRepo.ts`](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/storage/entityRepo.ts):
   Added typed method:
   ```typescript
   async getAllResolutions(): Promise<EntityResolution[]> {
     return this.driver.getAll<EntityResolution>(STORES.ENTITY_RESOLUTIONS);
   }
   ```
2. In [`src/storage/contextStore.ts`](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/storage/contextStore.ts):
   Exposed typed delegation:
   ```typescript
   async getAllResolutions(): Promise<EntityResolution[]> {
     return this.entities.getAllResolutions();
   }
   ```
3. In [`src/pipeline/resolution/accumulator.ts`](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/pipeline/resolution/accumulator.ts):
   Replaced driver bypass with:
   ```typescript
   const allResolutions = await this.contextStore.getAllResolutions();
   ```
   No `as any` casting remains.

### Test
Implemented `Closure C5: ContextAccumulator uses typed ContextStore.getAllResolutions API`:
- Verifies that `contextStore.getAllResolutions()` is callable, returns typed `EntityResolution[]`, and that `ContextAccumulator` uses this API without accessing `.driver`.

### Result
**RESOLVED.** Clean, typed encapsulation at the repository and ContextStore boundary.

---

## 6. Regression Results

Full regression testing across domain, storage, extraction, and resolution:
```bash
node --import tsx --test \
  src/domain/__tests__/*.test.ts \
  src/storage/__tests__/*.test.ts \
  src/pipeline/__tests__/*.test.ts
```

- **Total Test Suites:** 10
- **Total Tests:** 63
- **Passing:** 63
- **Failing:** 0
- **Lint (`npm run lint` / `tsc --noEmit`):** PASS (0 errors, 0 warnings)
- **Build (`npm run build` / `vite build`):** PASS (Clean production bundle, 0 errors)

---

## 7. Remaining Findings

As explicitly instructed, the following audit findings were NOT modified during this condition closure and are preserved:

- **F-2.2-03 (Informational):** Ambiguous claims are currently skipped during ContextAccumulator persistence.
- **F-2.2-06 (Informational):** Claim subject matching matches on mention text rather than strictly enforcing character span offsets when resolving subject entities for multiple mentions of the same name.

These findings remain known technical debt and are tracked for future resolution when appropriate.

---

## 8. Deferred Items

The following items from the Phase 2.2 audit remain deferred:
- LLM / hybrid candidate generation and scoring
- Cross-platform handle disambiguation heuristics
- Graph Projection (`Projector`, `GraphView`, node-link generation)
- D3 MapCanvas rendering
- Wander exploratory engine
- UI components and dashboards
- Embeddings, vector search, Mem0, Qdrant

---

## 9. Phase Boundary

Phase 2 (Semantic Extraction Core & Entity Resolution) is complete and all conditions are closed.
Phase 3 (Graph Projection, MapCanvas, Wander) has **NOT** started. No Phase 3 files, modules, or abstractions have been created.

---

## 10. Closure Verdict

```
CLOSED
```
