# Phase 1 Audit — Domain & Storage Layer

## 1. Audit Scope

This document provides a rigorous, skeptical, and read-only audit of the Phase 1 implementation (Domain & Storage Layer) against the frozen Map of Chaos architectural contracts.

### Audited Documents:
- `docs/product_contract.md`
- `docs/thing_contract.md`
- `docs/relationship_contract.md`
- `docs/context_model_contract.md`
- `docs/entity_resolution_contract.md`
- `docs/semantic_extraction_contract.md`
- `docs/runtime_pipeline_design.md`
- `docs/domain_data_schema_and_state_spec.md`
- `docs/implementation_architecture.md`

### Audited Source Files:
- `src/domain/types.ts`
- `src/domain/invariants.ts`
- `src/domain/stateMachines.ts`
- `src/domain/index.ts`
- `src/domain/__tests__/invariants.test.ts`
- `src/domain/__tests__/stateMachines.test.ts`
- `src/storage/db.ts`
- `src/storage/dumpRepo.ts`
- `src/storage/entityRepo.ts`
- `src/storage/claimRepo.ts`
- `src/storage/overrideRepo.ts`
- `src/storage/contextStore.ts`
- `src/storage/index.ts`
- `src/storage/__tests__/storage.test.ts`

### Audited Legacy Files (Coupling Check Only):
- `src/types.ts`
- `src/App.tsx`
- `src/services/aiService.ts`
- `src/MapCanvas.tsx`
- `src/data/initialData.ts`

---

## 2. Executive Verdict

**READY WITH CONDITIONS**

The Phase 1 implementation establishes a clean, decoupled, and strictly typed domain foundation that compiles with zero TypeScript errors and passes all 15 unit and integration tests. It enforces the fundamental paradigm shift: **Claim** is the primary semantic primitive, **Entity** is the persistent identity, and **Thing/Edge** projections are downstream ephemeral views.

However, an adversarial inspection reveals 4 significant architectural gaps:
1. **Deduplication ignores qualifiers**: Identical predicate/object checks omit `qualifiers` (e.g., quantity 2 vs 3), collapsing nuanced claims into single records.
2. **Object mention provenance asymmetry in relational claims**: Relational claims store only a single `mentionId` (subject), losing direct grounding to object mention spans and preventing object-side entity rebinding.
3. **Transaction non-atomicity in storage**: The `IStorageDriver` lacks multi-store transactional boundaries, meaning complex operations like `rebindMention` write to multiple stores asynchronously without rollback guarantees.
4. **Syntactic temporal conflict heuristic**: `evaluateClaimConflict` ignores `observationTime`, misidentifying temporal state transitions between successive dumps as direct contradictions.

These findings do not require discarding the architecture, but they define concrete constraints that must be resolved as conditions for Phase 2.

---

## 3. Contract Compliance Matrix

| Area | Status | Evidence | Finding |
| :--- | :--- | :--- | :--- |
| **Dump Primitive** | **PASS** | `src/domain/types.ts:10-18`, `src/storage/dumpRepo.ts:4-35` | Fully grounded raw input representation with processing lifecycle. |
| **Evidence Primitive** | **PASS** | `src/domain/types.ts:20-27`, `src/domain/invariants.ts:26-30` | Character offset slices grounded in raw dumps with immutable semantics. |
| **Mention Primitive** | **PASS** | `src/domain/types.ts:29-37`, `src/storage/entityRepo.ts:46-68` | Surface span capture decoupled from persistent entity identity. |
| **Entity Primitive** | **PASS** | `src/domain/types.ts:63-72`, `src/storage/entityRepo.ts:8-44` | Persistent semantic identity with aliases, handles, and epistemic states. |
| **Entity Resolution** | **PASS** | `src/domain/types.ts:49-61`, `src/domain/stateMachines.ts:35-92` | Explicit resolution records with confidence, rationale, and supersede history. |
| **Claim Model** | **PARTIAL** | `src/domain/types.ts:99-127` | Claim correctly implements epistemic origins and temporal scopes, but lacks `objectMentionId`. |
| **Claim Re-binding Audit** | **PASS** | `src/domain/types.ts:129-136`, `src/domain/stateMachines.ts:98-129` | Rebinding preserves evidence and produces immutable `ClaimBindingAudit`. |
| **Human Override** | **PASS** | `src/domain/types.ts:178-195`, `src/storage/overrideRepo.ts:4-30` | Explicit audit records for human interventions and review actions. |
| **Thing/Edge Projection** | **PASS** | `src/domain/types.ts:201-229` | Strictly defined as ephemeral view models derived from context entities and claims. |
| **Epistemic Model** | **PASS** | `src/domain/types.ts:112-113`, `src/domain/stateMachines.ts:143-227` | Strict separation of source origin and review state; human locks enforced. |
| **Additive Accumulation** | **PARTIAL** | `src/storage/contextStore.ts:102-122` | Reinforces supporting evidence, but deduplication omits qualifiers. |
| **Contradiction Evaluation** | **PARTIAL** | `src/domain/invariants.ts:82-105` | Ignores `observationTime`, causing multi-dump temporal shifts to flag as contradictions. |
| **Storage Transactions** | **PARTIAL** | `src/storage/db.ts:38-102` | Single-store operations only; multi-store operations lack ACID guarantees. |
| **ContextStore Boundaries** | **PARTIAL** | `src/storage/contextStore.ts:124-137` | Storage layer actively performs semantic contradiction tagging during insertion. |
| **Legacy Isolation** | **PASS** | Grep analysis across `src/` | Zero imports or references to legacy prototype components. |

---

## 4. Domain Model Audit

### Evaluation by Type

1. **`Dump`**: **PASS**
   - Implements immutable raw text, source channels (`web_dock`, `pwa`, `api`, `import`), and processing state machine (`captured`, `processing`, `processed`, `failed`). Matches `domain_data_schema_and_state_spec.md`.

2. **`Evidence`**: **PASS**
   - Strictly references `dumpId` with 0-indexed character offsets (`startOffset`, `endOffset`) and exact text slice (`textSpan`). Fully verified by invariant `isEvidenceGroundedInDump`.

3. **`Mention`**: **PASS**
   - Captures surface form, normalized form, and type hint. Mentions do NOT store resolved entity pointers directly; resolution is handled by `EntityResolution`. This preserves the separation between extraction and resolution.

4. **`Entity`**: **PASS**
   - Contains `canonicalName`, `aliases`, `associatedHandles`, `epistemicStatus` (`verified`, `unverified`, `unknown`), and `resolutionStatus` (`resolved`, `ambiguous`, `provisional`). It is not confused with canvas nodes.

5. **`EntityResolution`**: **PASS**
   - Reified object capturing the binding between a `mentionId` and an optional `targetEntityId`. Tracks `outcome`, `confidence`, `rationale`, `createdBy` (`machine` vs `human_override`), and lifecycle status (`active` vs `superseded`).

6. **`Claim`**: **PARTIAL**
   - Properly models assertions with `subjectEntityId`, `predicate`, `objectValue` (literal, concept, or entity_id), `temporalScope`, `qualifiers`, `sourceOrigin`, `reviewState`, and grounding fields.
   - **Gap**: Only provides `readonly mentionId?: string`. In relational claims where `objectValue.type === 'entity_id'`, there is no `objectMentionId` to ground the object mention.

7. **`ClaimBindingAudit`**: **PASS**
   - Captures `claimId`, `previousEntityId`, `newEntityId`, `resolutionId`, and `timestamp`. Guarantees traceability of semantic re-bindings.

8. **`HumanOverride`**: **PASS**
   - Reified human intervention record supporting `entity_resolution`, `claim_review`, `entity_merge`, and `entity_split`.

9. **`ExtractionResult`**: **PASS**
   - Intermediate machine extraction payload containing candidate mentions, candidate claims, and observation notes.

10. **`ThingProjection` & `EdgeProjection`**: **PASS**
    - View models located strictly downstream. Include visualization hints (`uncertaintyBadge`, `radius`, `style: solid | dashed`) without polluting domain entities.

---

## 5. Epistemic Model Audit

### 1. Can a human-stated assertion remain unconfirmed?
**Yes.** In `src/domain/types.ts:112-113`, a claim has two orthogonal axes:
- `sourceOrigin: 'human_stated' | 'ai_inferred'`
- `reviewState: 'extracted' | 'needs_review' | 'human_confirmed' | 'rejected'`
When a machine extractor parses human unstructured text, the source utterance is human-stated (`sourceOrigin = 'human_stated'`), but the machine extraction of that claim is initialized to `reviewState = 'extracted'`. It remains unconfirmed until the user explicitly reviews it.

### 2. Can an AI inference accidentally become equivalent to a human assertion?
**No.** `sourceOrigin` is immutable. Even if an AI-inferred claim (`sourceOrigin = 'ai_inferred'`) is reviewed and accepted by a human, its `reviewState` becomes `'human_confirmed'`, but its `sourceOrigin` remains `'ai_inferred'`.

### 3. Can a human-confirmed claim later be overwritten by machine reprocessing?
**No.** Enforced in two distinct locations:
- `src/domain/stateMachines.ts:154-156`: `canTransitionClaimReview` returns `false` if `currentState === 'human_confirmed'`.
- `src/domain/stateMachines.ts:198-212`: In `reconcileClaimWithReprocessing`, if `reviewState === 'human_confirmed'`, machine reprocessing only appends new evidence IDs to `supportingEvidenceIds` and cannot alter the claim predicate, object, or review state.

### 4. Can a rejected claim be resurrected accidentally?
**No.** In `src/domain/stateMachines.ts:157-159`, `rejected` is a terminal state for that extraction (`canTransitionClaimReview` returns `false`). `reconcileClaimWithReprocessing` locks rejected claims against review state modifications.

### 5. Is epistemic status represented at the correct semantic level?
**Yes.**
- At the **Assertion level**: Claims carry `sourceOrigin` and `reviewState`.
- At the **Identity level**: Entities carry `epistemicStatus` (`verified`, `unverified`, `unknown`) and `resolutionStatus` (`resolved`, `ambiguous`, `provisional`).
- At the **View level**: Projections carry `uncertaintyBadge` and edge styles (`solid` vs `dashed`).

---

## 6. Provenance / Evidence Audit

### Traceability Test:
*"If I show a Claim to the user, can the system tell me exactly which human text caused that Claim to exist?"*

**Trace from Code:**
1. Given `claim: Claim`:
2. Inspect `claim.dumpId` $\rightarrow$ retrieves original raw dump via `DumpRepository.getDump(dumpId)`.
3. Inspect `claim.evidenceId` $\rightarrow$ retrieves primary evidence span via `DumpRepository.getEvidence(evidenceId)`.
4. Inspect `claim.supportingEvidenceIds` $\rightarrow$ retrieves all reinforcing evidence spans across dumps.
5. In `Evidence`: `startOffset`, `endOffset`, and `textSpan` allow exact highlight rendering: `dump.rawText.slice(evidence.startOffset, evidence.endOffset) === evidence.textSpan`.
6. Verified by invariant `isEvidenceGroundedInDump` (`src/domain/invariants.ts:26-30`).

### Provenance Weakness Identified:
- **Object Mention Grounding**: In a relational claim (e.g., *"Borga partners with Tungku"*), the evidence text covers the sentence, but `claim.mentionId` only references the subject mention ("Borga"). The object mention ("Tungku") has no dedicated field on `Claim`. Once extraction finishes, the direct link from the Claim to the object mention span is lost.

---

## 7. Entity ↔ Claim Binding Audit

### Analysis of Mention Re-binding:
In `src/storage/contextStore.ts:222-269`:
When a mention is rebound from Entity A to Entity B via `rebindMention`:
1. The previous resolution is marked `status = 'superseded'`.
2. A new resolution is created with `createdBy = 'human_override'` and `status = 'active'`.
3. Claims where `c.mentionId === mentionId` and `c.subjectEntityId === oldEntityId` are rebound using `rebindClaimEntity`:
   - `claim.subjectEntityId` is updated to `newEntityId`.
   - Original `dumpId`, `evidenceId`, and `supportingEvidenceIds` remain completely intact.
   - An immutable `ClaimBindingAudit` is recorded in `STORES.CLAIM_AUDITS`.

### Deficiencies Identified:
1. **Object Entity Rebinding Missing**: If a relational claim has `objectValue.type === 'entity_id'` and `objectValue.value === oldEntityId`, `rebindMention` does NOT update `objectValue.value`. Claims where the rebound mention was the object remain bound to the wrong entity.
2. **Missing Mention ID Vulnerability**: If a claim's `mentionId` is omitted (e.g., extracted from sentence-level context), `rebindMention` fails to identify and rebind the claim because it filters strictly on `c.mentionId === mentionId`.

---

## 8. Additive Context Accumulation Audit

### Test Cases:

- **Case A: Exact duplicate claim arrives**:
  - `ContextStore.addClaim` (`src/storage/contextStore.ts:102-122`) detects identical `predicate`, `objectValue.type`, and `objectValue.value`.
  - Appends new evidence IDs into `supportingEvidenceIds` via a deduplicating Set.
  - Result: **PASS** (Reinforces without duplicate records).

- **Case B: Semantically identical claim with different evidence**:
  - Successfully appends new `evidenceId` to `supportingEvidenceIds`.
  - Result: **PASS**.

- **Case C: Similar but non-identical claim arrives**:
  - Creates a distinct claim record.
  - Result: **PASS**.

- **Case D: Contradictory claim arrives**:
  - Both claims are retained. Neither is overwritten.
  - Flags `conflictState = 'direct_contradiction'` on both claims and links their IDs.
  - Result: **PASS**.

- **Case E: Claim in different temporal scope**:
  - Both claims are retained. Flags `conflictState = 'temporal_shift'`.
  - Result: **PASS**.

- **Case F: Claim with different qualifiers (CRITICAL BUG)**:
  - In `src/storage/contextStore.ts:104-110`:
    ```typescript
    const identical = existingClaims.find(
      (c) =>
        c.predicate === claim.predicate &&
        c.objectValue.type === claim.objectValue.type &&
        c.objectValue.value === claim.objectValue.value &&
        c.status === 'active'
    );
    ```
  - **The check ignores `c.qualifiers`!**
  - If Claim 1 has `{ quantity: 2 }` and Claim 2 has `{ quantity: 3 }` with the same object value ("coffee machines"), Claim 2 is treated as identical to Claim 1. Claim 2's distinct qualifier is discarded, and it merely reinforces Claim 1's evidence list!
  - Result: **VIOLATION (HIGH)**.

---

## 9. Contradiction & Temporal Audit

### Analysis of `evaluateClaimConflict` (`src/domain/invariants.ts:82-105`):

```typescript
export function evaluateClaimConflict(
  existingClaim: Claim,
  newClaim: Claim
): 'none' | 'temporal_shift' | 'direct_contradiction' {
  if (existingClaim.subjectEntityId !== newClaim.subjectEntityId) return 'none';
  if (existingClaim.predicate !== newClaim.predicate) return 'none';

  if (
    existingClaim.objectValue.type === newClaim.objectValue.type &&
    existingClaim.objectValue.value === newClaim.objectValue.value
  ) {
    return 'none';
  }

  if (existingClaim.temporalScope !== newClaim.temporalScope) {
    return 'temporal_shift';
  }

  return 'direct_contradiction';
}
```

### Prompt Test Cases:

1. *"I have 2 coffee machines"* vs *"I have 3 coffee machines"*:
   - If extracted with `temporalScope = 'present'`, flagged as `direct_contradiction`.
   - Limitation: Cannot recognize numerical refinement or change of state without temporal tags.

2. *"I live in Bali"* (Dump 1, Jan 2026) vs *"I moved to Jakarta"* (Dump 2, May 2026):
   - **Failure Mode**: Extractor assigns `temporalScope = 'present'` to both statements because both were present-tense at the time of writing.
   - Because `evaluateClaimConflict` does NOT check `observationTime`, it flags them as a `direct_contradiction` instead of an observational timeline evolution!

3. *"I plan to sell yoghurt"* (`future`) vs *"I am selling yoghurt"* (`present`):
   - Different scopes $\rightarrow$ flagged as `temporal_shift`. **PASS**.

4. *"Nalakara is a technology business"* vs *"Nalakara is no longer operating"*:
   - Different predicates $\rightarrow$ returns `'none'`.
   - Limitation: Syntactic matching cannot infer that operational status affects business activities.

---

## 10. Human Override Precedence Audit

### Hierarchy Verification:
$$\text{Human Decision} > \text{Machine Reprocessing} > \text{Historical Derivation}$$

1. **Human Decision Precedence**:
   - `applyResolutionOverride` creates resolutions with `confidence = 1.0` and `createdBy = 'human_override'`.
   - `transitionClaimReviewState` prevents reverting `human_confirmed` or `rejected` claims to machine states.
2. **Machine Reprocessing Constraints**:
   - `reconcileClaimWithReprocessing` guarantees that machine reprocessing never changes a human-confirmed or rejected claim's review state.
3. **Auditability**:
   - Superseded resolutions remain queryable in `entity_resolutions`.
   - `ClaimBindingAudit` records who, when, and why a claim binding changed.
   - Result: **PASS**.

---

## 11. Storage & Transaction Audit

### Integrity Evaluation:
1. **Schema & Indexes** (`src/storage/db.ts:170-236`):
   - 9 dedicated object stores matching domain aggregates.
   - Comprehensive indexes on query fields (`dumpId`, `subjectEntityId`, `normalizedForm`, etc.).
2. **Transaction Boundaries (Deficiency)**:
   - `IndexedDBDriver` methods (`get`, `put`, `delete`, `getAll`) create single-store transactions per call:
     ```typescript
     const tx = this.db.transaction(storeName, 'readwrite');
     ```
   - **Risk**: `ContextStore.rebindMention` performs multiple successive writes across `ENTITY_RESOLUTIONS`, `CLAIMS`, `CLAIM_AUDITS`, and `HUMAN_OVERRIDES`. If the browser tab closes or storage fills up midway, the database is left in an inconsistent state.
   - Result: **PARTIAL (MEDIUM)**.

---

## 12. ContextStore Boundary Audit

### Assessment of Responsibilities:
In `src/storage/contextStore.ts:124-137`:
- When `addClaim` is called, it actively iterates existing claims, runs `evaluateClaimConflict`, and mutates both the new claim and existing claims to record contradiction statuses.
- **Classification**: **Potentially Dangerous Architectural Leakage**.
- **Rationale**: Determining semantic contradiction and updating epistemic conflict graphs is a responsibility of the runtime pipeline's **Context Accumulation Stage** (`docs/runtime_pipeline_design.md:120-135`), not a side effect of a storage facade. Doing this during storage insertion couples the persistence layer to a simplistic syntactic heuristic.

---

## 13. Legacy Coupling Audit

### Verification:
- All new code is strictly confined to `src/domain/` and `src/storage/`.
- No imports from `src/App.tsx`, `src/types.ts`, `src/services/aiService.ts`, `src/MapCanvas.tsx`, or `src/data/initialData.ts`.
- Legacy prototype files contain zero references to `src/domain` or `src/storage`.
- Result: **PASS (Zero Coupling)**.

---

## 14. Projection Boundary Audit

### Verification:
- `ThingProjection` and `EdgeProjection` are pure view interfaces in `src/domain/types.ts:201-229`.
- No domain primitive references projections.
- Repositories store semantic entities and claims; projection caching is isolated in `STORES.PROJECTION_CACHE`.
- Result: **PASS**.

---

## 15. Reprocessing Readiness Audit

### Verification:
- `ExtractionResult` records `extractorVersion`.
- Reprocessing can execute idempotently via `reconcileClaimWithReprocessing`.
- Reprocessing preserves human overrides and reinforces evidence spans without destroying historical data.
- Result: **PASS**.

---

## 16. Test Coverage Assessment

### Current Test Suite (15 passing tests):
- `src/domain/__tests__/invariants.test.ts` (5 tests): Validates evidence grounding, mention grounding, auto-merge blocking, conflict evaluation, active claims.
- `src/domain/__tests__/stateMachines.test.ts` (5 tests): Validates resolution creation, override superseding, claim rebinding audits, review transitions, reprocessing locks.
- `src/storage/__tests__/storage.test.ts` (5 tests): Validates dump/evidence storage, claim reinforcement, contradiction flagging, mention rebinding, review overrides.

### Missing Test Cases (Required before Phase 2):
1. **Conflicting Qualifiers**: Add claim with `{ quantity: 2 }`, then add claim with `{ quantity: 3 }` (verifies they do not accidentally collapse).
2. **Relational Claim Object Rebinding**: Verify what happens to relational claims when the object entity is changed.
3. **Temporal Shift with Observation Times**: Claims with same present tense but different dump timestamps.
4. **Multiple Mentions to One Entity**: Multiple distinct surface forms resolving to the same entity.
5. **Partial Rebinding Failure Recovery**: Ensuring audit records match exact rebound counts.

---

## 17. Findings

### High Severity
1. **[HIGH] Qualifier Loss in Additive Claim Deduplication**:
   - **Location**: `src/storage/contextStore.ts:104-110` (`addClaim`)
   - **Conflict**: Conflicts with `docs/context_model_contract.md:124-138` (Claims must preserve human nuance and qualifiers).
   - **Impact**: Claims with different quantities, purposes, or degrees collapse into a single claim if predicate and object match.
   - **Recommendation**: Include `qualifiers` equality in the identical claim matching predicate.

2. **[HIGH] Relational Claims Lack Object Mention Provenance**:
   - **Location**: `src/domain/types.ts:117` (`Claim`) and `src/storage/contextStore.ts:254-268` (`rebindMention`)
   - **Conflict**: Conflicts with `docs/relationship_contract.md:45-56` (Relationships must ground both subject and object).
   - **Impact**: Object mention span is lost; rebinding an object mention fails to rebind the relationship.
   - **Recommendation**: Add `objectMentionId?: string` to `Claim` and update `rebindMention` to inspect both subject and object bindings.

### Medium Severity
3. **[MEDIUM] Non-Atomic Multi-Store Operations in Storage Driver**:
   - **Location**: `src/storage/db.ts:38-102` (`IndexedDBDriver`)
   - **Conflict**: Conflicts with `docs/implementation_architecture.md:280-300` (Persistence transactional integrity).
   - **Impact**: System crashes during rebinding can leave orphaned audit records or half-rebound claims.
   - **Recommendation**: Add a transaction helper `runTransaction(storeNames, mode, callback)` to `IStorageDriver`.

4. **[MEDIUM] `observationTime` Ignored in Contradiction Evaluation**:
   - **Location**: `src/domain/invariants.ts:82-105` (`evaluateClaimConflict`)
   - **Conflict**: Conflicts with `docs/context_model_contract.md:140-165` (Observation time vs validity time separation).
   - **Impact**: Successive dumps stating present-tense facts at different times are flagged as contradictions instead of timeline shifts.
   - **Recommendation**: Incorporate observation timestamp ordering into conflict evaluation.

### Low Severity
5. **[LOW] Semantic Interpretation Leakage in ContextStore**:
   - **Location**: `src/storage/contextStore.ts:124-137`
   - **Conflict**: Blurs storage layer and pipeline accumulation boundaries.
   - **Impact**: Tight coupling between storage insertion and contradiction heuristics.
   - **Recommendation**: Move automatic contradiction tagging into the Phase 2 Context Accumulation pipeline step.

---

## 18. Required Changes Before Phase 2

Before starting Phase 2 implementation, the following targeted refinements must be scheduled:
1. **Update `Claim` type** to include `objectMentionId?: string`.
2. **Refine `addClaim` deduplication logic** to compare `qualifiers` so differing qualifiers produce separate claims.
3. **Extend `rebindMention`** to rebind relational claims where `objectValue.type === 'entity_id'` and `objectValue.value === oldEntityId`.
4. **Expose multi-store transaction support** in `IStorageDriver` for browser IndexedDB.

---

## 19. Phase 2 Readiness Verdict

**READY WITH CONDITIONS**

Phase 1 provides a clean, well-tested, decoupled architecture that fully satisfies the primary domain boundaries. Proceeding to Phase 2 is approved **subject to addressing the 4 conditions listed in Section 18** prior to implementing the extraction and entity resolution pipelines.

---

## 20. Explicit Non-Changes

This audit was conducted strictly in read-only mode. It did **NOT**:
- Modify application behavior or existing code
- Modify any React UI or MapCanvas files
- Implement extraction, entity resolution, projection, retrieval, or Wander
- Implement legacy localStorage migration
- Add AI/LLM models, embeddings, or vector databases
- Alter any source files to pass build or lint checks
