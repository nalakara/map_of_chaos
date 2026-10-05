# Phase 1 Condition Closure

## 1. Conditions Addressed

This document records the resolution and verification of the four conditions identified during the Phase 1 read-only audit ([`docs/phase_1_audit.md`](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/docs/phase_1_audit.md)):

1. **Condition 1 (HIGH)**: Claim deduplication ignores qualifiers, causing semantically distinct claims with differing quantities or modalities to collapse.
2. **Condition 2 (HIGH)**: Relational claims lack `objectMentionId` grounding and object-side entity rebinding.
3. **Condition 3 (MEDIUM)**: `IndexedDBDriver` and storage layer lack multi-store transactional boundaries, risking partial writes on crashes.
4. **Condition 4 (MEDIUM)**: `evaluateClaimConflict` ignores `observationTime`, treating state evolution across observation dates as direct contradictions.

---

## 2. Changes Made

### Condition 1: Qualifier-Safe Claim Deduplication
- **Files Changed**:
  - [`src/domain/invariants.ts`](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/domain/invariants.ts)
  - [`src/storage/contextStore.ts`](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/storage/contextStore.ts)
- **Symbols/Functions Changed**:
  - Added [`areQualifiersEquivalent(q1?: ClaimQualifiers, q2?: ClaimQualifiers): boolean`](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/domain/invariants.ts#L82-L113) in `src/domain/invariants.ts`.
  - Updated [`ContextStore.addClaim`](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/storage/contextStore.ts#L103-L123) in `src/storage/contextStore.ts`.
- **Behavioral Change**:
  - The `identical` claim check now tests `areQualifiersEquivalent(c.qualifiers, claim.qualifiers)` in addition to subject, predicate, objectValue, and status.
  - Claims with different quantities (e.g., 2 vs. 3), conditions (e.g., `more_than` vs. `exact`), or modalities no longer collapse into a single record.
  - When claims have identical qualifiers and values, supporting evidence is reinforced without duplicating records.
- **Why It Satisfies the Audit**:
  - Directly fulfills `docs/context_model_contract.md:124-138` by preserving human nuance and qualifiers during context accumulation.

### Condition 2: Object Mention Grounding & Rebinding
- **Files Changed**:
  - [`src/domain/types.ts`](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/domain/types.ts)
  - [`src/domain/stateMachines.ts`](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/domain/stateMachines.ts)
  - [`src/storage/contextStore.ts`](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/storage/contextStore.ts)
- **Symbols/Functions Changed**:
  - Added `readonly subjectMentionId?: string;` and `readonly objectMentionId?: string;` to [`Claim`](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/domain/types.ts#L116-L120).
  - Added `readonly role?: 'subject' | 'object';` to [`ClaimBindingAudit`](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/domain/types.ts#L129-L136).
  - Added `objectMentionSurface?: string;` to [`ExtractedClaimCandidate`](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/domain/types.ts#L149-L163).
  - Updated [`rebindClaimEntity`](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/domain/stateMachines.ts#L99-L138) to accept `role: 'subject' | 'object' = 'subject'`.
  - Updated [`ContextStore.rebindMention`](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/storage/contextStore.ts#L225-L308) to query both subject claims and object relational claims, rebinding both roles when the mention is referenced.
- **Behavioral Change**:
  - Relational claims now ground both subject-side and object-side mention spans.
  - Re-binding an object mention updates the claim's `objectValue.value` to the new entity ID and writes an immutable `ClaimBindingAudit` with `role: 'object'`.
  - Re-binding preserves original evidence spans, dump IDs, and supporting evidence arrays.
- **Why It Satisfies the Audit**:
  - Resolves `docs/relationship_contract.md:45-56` by establishing dual-sided mention provenance and revisable relational entity bindings.

### Condition 3: Multi-Store Transaction Support
- **Files Changed**:
  - [`src/storage/db.ts`](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/storage/db.ts)
  - [`src/storage/contextStore.ts`](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/storage/contextStore.ts)
- **Symbols/Functions Changed**:
  - Added `runTransaction<R>` to [`IStorageDriver`](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/storage/db.ts#L33-L37).
  - Implemented `ScopedIndexedDBDriver` and updated [`IndexedDBDriver.runTransaction`](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/storage/db.ts#L175-L210) to execute atomic IDB transactions with `tx.abort()` on error.
  - Implemented snapshot isolation and rollback in [`MemoryStorageDriver.runTransaction`](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/storage/db.ts#L259-L287).
  - Wrapped [`ContextStore.rebindMention`](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/storage/contextStore.ts#L250-L306) inside `driver.runTransaction` across `[ENTITY_RESOLUTIONS, CLAIMS, CLAIM_AUDITS, HUMAN_OVERRIDES]`.
- **Behavioral Change**:
  - Complex entity re-binding and human override operations are executed as an all-or-nothing unit.
  - If any failure occurs mid-operation, changes to resolutions, claims, audits, and overrides are automatically rolled back without partial database corruption.
- **Why It Satisfies the Audit**:
  - Satisfies `docs/implementation_architecture.md:280-300` transactional integrity constraints without over-engineering or introducing external database engines.

### Condition 4: Observation Time vs Temporal Validity Scope
- **Files Changed**:
  - [`src/domain/invariants.ts`](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/domain/invariants.ts)
- **Symbols/Functions Changed**:
  - Updated [`evaluateClaimConflict`](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/domain/invariants.ts#L120-L167).
- **Behavioral Change**:
  - Preserves the domain distinction between `observationTime` (when the observation was made) and `temporalScope` (what time period the observation refers to).
  - Successive observations stating present-tense facts across different observation dates (e.g. "I have 2 coffee machines" at T1 vs. "I have 3 coffee machines" at T2) are classified as `temporal_shift` (state evolution over time), NOT direct contradictions.
  - Incompatible claims sharing the same observation context and same temporal scope continue to be correctly flagged as `direct_contradiction`.
- **Why It Satisfies the Audit**:
  - Satisfies `docs/context_model_contract.md:140-165` temporal separation rules.

---

## 3. Tests Added

A dedicated test suite was added in [`src/storage/__tests__/conditionClosure.test.ts`](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/storage/__tests__/conditionClosure.test.ts):

| Test | Suite / Case | Invariant Proved |
| :--- | :--- | :--- |
| 1 | `Condition 1 / Case A` | Does not collapse claims with differing quantities ("2 coffee machines" vs "3 coffee machines"). |
| 2 | `Condition 1 / Case B` | Does not collapse claims with differing conditions/modalities ("more than 2" vs "exactly 2"). |
| 3 | `Condition 1 / Case C` | Reinforces existing claim when same claim arrives with identical qualifiers and different evidence. |
| 4 | `Condition 2 / Case A & B` | Supports subject and object entity re-binding while preserving evidence spans and logging audits. |
| 5 | `Condition 3` | Rolls back all store mutations atomically when an operation fails mid-transaction. |
| 6 | `Condition 4 / Case A` | Classifies state changes over different observation times as `temporal_shift`, NOT contradiction. |
| 7 | `Condition 4 / Case B` | Preserves temporal distinction between "used to" (`past`) and "now" (`present`). |
| 8 | `Condition 4 / Case C` | Recognizes `direct_contradiction` when conflicting claims share the same observation window and temporal scope. |

---

## 4. Regression Results

### Test Execution
Command: `node --import tsx --test src/domain/__tests__/*.test.ts src/storage/__tests__/*.test.ts`
```text
▶ Domain Invariants Suite (5 tests)
  ✔ validates evidence grounding in raw dump
  ✔ validates mention grounding in evidence text
  ✔ prohibits automatic merge on lexical similarity alone
  ✔ evaluates temporal shifts vs direct contradictions
  ✔ determines active claims in current context
✔ Domain Invariants Suite (121.5ms)

▶ State Machines Suite (5 tests)
  ✔ creates active resolution records
  ✔ applies human override and supersedes previous resolution without deleting history
  ✔ re-binds claim entity with audit trail while preserving evidence
  ✔ enforces claim review state transitions and forbids demoting human decisions
  ✔ guarantees reprocessing locks human decisions and reinforces evidence
✔ State Machines Suite (60.2ms)

▶ Phase 1 Condition Closure Suite (8 tests)
  ✔ Case A: does NOT collapse claims with differing quantities
  ✔ Case B: does NOT collapse claims with differing conditions/modalities
  ✔ Case C: reinforces existing claim when same claim arrives with identical qualifiers
  ✔ Case A & B: supports subject and object entity re-binding while preserving evidence spans
  ✔ rolls back all store mutations atomically when an operation fails mid-transaction
  ✔ Case A: classifies state changes over different observation times as temporal_shift, NOT contradiction
  ✔ Case B: preserves temporal distinction between "used to" (past) and "now" (present)
  ✔ Case C: recognizes direct contradiction when conflicting claims share the same observation window and temporal scope
✔ Phase 1 Condition Closure Suite (29.2ms)

▶ Storage Layer & ContextStore Integration (5 tests)
  ✔ persists dumps and ground evidence spans
  ✔ enforces additive claim invariant and reinforces evidence on identical claims
  ✔ detects direct contradictions within the same temporal scope
  ✔ re-binds mention and derived claims to new entity with audit log when human overrides
  ✔ persists and retrieves human review overrides on claims
✔ Storage Layer & ContextStore Integration (18.8ms)

ℹ tests 23
ℹ suites 8
ℹ pass 23
ℹ fail 0
```

### TypeScript Check
Command: `npm run lint` (`tsc --noEmit`)
```text
> react-example@0.0.0 lint
> tsc --noEmit
(Exit code 0 — 0 errors)
```

### Production Build Check
Command: `npm run build` (`vite build`)
```text
✓ 1712 modules transformed.
dist/index.html                   2.05 kB │ gzip:   0.83 kB
dist/assets/index-DSq_y_6e.css   37.42 kB │ gzip:   6.92 kB
dist/assets/index-B2BQ0h5Z.js   328.06 kB │ gzip: 100.61 kB
✓ built in 1.50s
PWA v1.3.0 mode generateSW (precache 17 entries)
(Exit code 0)
```

---

## 5. Architectural Boundary Check

It is explicitly confirmed that this condition closure task did **NOT** implement:
- Semantic extraction pipelines or models
- Entity Resolution clustering or matching heuristics
- Graph projection engines
- Context retrieval mechanisms
- Wander reflection loops
- AI/LLM integrations
- Vector databases or embeddings
- UI or Canvas component modifications
- Legacy localStorage migrations

---

## 6. Remaining Limitations

1. **Complex Multi-Predicate Semantic Inference**:
   - `evaluateClaimConflict` operates on matching `predicate` and `subjectEntityId`. Semantic incompatibilities across different predicates (e.g., `operational_status: "closed"` vs `is_business_type: "tech"`) require the Phase 2 Context Accumulation pipeline and cannot be evaluated at the single-predicate syntactic level.
2. **ContextStore Contradiction Tagging Lifecycle**:
   - The low-severity finding from the audit noted that semantic contradiction tagging currently runs during `addClaim`. In Phase 2, this will be formally orchestrated by the pipeline's Context Accumulation stage rather than storage insertion.

---

## 7. Verdict

**CLOSED**

All four conditions identified in the Phase 1 audit have been resolved, verified, and backed by automated regression tests. Phase 1 is now complete and closed. Phase 2 may proceed when requested.
