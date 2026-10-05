# Phase 2.1 Condition Closure

## 1. Conditions Addressed

This document records the resolution of the two conditions identified during the read-only audit of Phase 2.1 in `docs/phase_2_1_audit.md`:
1. **Condition 1 (F-2.1-02)**: Claim Evidence Persistence
2. **Condition 2 (F-2.1-03)**: Local Modality / Temporal Scoping

Both conditions have been fully resolved and verified with dedicated regression tests.

---

## 2. Condition 1 — Claim Evidence Persistence

### Root Cause
In `SemanticExtractionOrchestrator.extractAndGround()`, the orchestrator persisted `Evidence` records for `verifiedResult.mentions`, but omitted creating and saving `Evidence` records for `verifiedResult.claims`. Consequently, claim candidates had no persistent `evidenceId` reference in `dumpRepo`, breaking the provenance chain:
$$\text{Claim} \to \text{evidenceId} \to \text{Evidence} \to \text{Dump}$$

### Files Changed
- [`src/domain/types.ts`](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/domain/types.ts): Added optional `evidenceId?: string` to `ExtractedClaimCandidate`.
- [`src/pipeline/extraction/extractor.ts`](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/pipeline/extraction/extractor.ts): Updated `extractAndGround()` to persist `Evidence` spans for all verified claim candidates using `dumpRepo.saveEvidence()` and bind `claim.evidenceId = ev.id`.

### Implementation Details
`extractAndGround()` now implements a unified `ensureEvidence(startOffset, endOffset, textSpan)` routine that:
1. Keys existing evidence by `${startOffset}:${endOffset}:${textSpan}` and `textSpan`.
2. Reuses existing evidence records if already stored, preventing duplicate rows during repeated processing.
3. Persists evidence records for both mentions and claim candidates.
4. Binds each claim candidate to its backing `evidenceId`.

### Provenance Behavior
Every claim candidate emitted from `extractAndGround()` now carries a verified `evidenceId`. The backing `Evidence` record in `dumpRepo`:
- Matches `dumpId` of the source dump.
- Has `textSpan` exactly matching `rawText.slice(startOffset, endOffset)`.
- Contains the exact propositional text from which the claim candidate was extracted.

### Tests
- **Test 14** in `src/pipeline/__tests__/semanticExtraction.test.ts`: Verifies that every claim produced by `extractAndGround()` possesses a valid `evidenceId`, that the `Evidence` record exists in `dumpRepo`, that its offsets slice the dump text verbatim, and that repeated grounding runs create zero duplicate evidence rows.

---

## 3. Condition 2 — Local Modality / Temporal Scoping

### Root Cause
`DeterministicSemanticExtractor` evaluated modifier keywords such as `mungkin` and `dulu` against the entire dump text using global regular expressions (`if (/\b(mungkin|maybe)\b/i.test(text)) claims.forEach(...)`). In compound dumps with multiple sentences, a modifier in one clause (e.g. "Saya mungkin punya bisnis A") polluted unrelated claims in sibling clauses (e.g. "Bisnis B saya sudah berjalan"), corrupting their modality or temporal scope.

### Files Changed
- [`src/pipeline/extraction/normalizer.ts`](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/pipeline/extraction/normalizer.ts):
  - Added `getEnclosingClause(fullText, startOffset, endOffset)`: Delimits propositions by sentence terminators (`.`, `;`, `\n`, `!`, `?`) and contrastive conjunctions (`dan nantinya`, `dan kemudian`), searching forward from `startOffset` so sentence punctuation terminates the current clause without bleeding into subsequent sentences.
  - Updated `findExactSpan` with a case-insensitive fallback slice so extracted spans match casing variations without falling back to full sentence spans.
- [`src/pipeline/extraction/deterministic.ts`](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/pipeline/extraction/deterministic.ts):
  - Added direct business assertion regexes (`directBizRegexes`) matching patterns such as "punya/menjalankan bisnis X" and "bisnis X saya sudah berjalan".
  - Added standalone future intention regex (`standaloneFutureRegex`) matching "akan/mau menjual X".
  - Replaced dump-level modifier overrides with local clause-scoped resolution:
    - Scoped `mungkin` / `barangkali` / `maybe` to `clauseText`.
    - Scoped `dulu` / `used to` / `sebelumnya` to `clauseText`.
    - Scoped `sekarang` / `saat ini` / `sudah berjalan` to `clauseText`.
    - Scoped `akan` / `nanti` / `nantinya` to `clauseText` (without overriding ongoing activities).

### Scoping Behavior
Modifiers are strictly bound to the local proposition:
- In compound dumps, uncertainty in sentence 1 does not mutate sentence 2.
- Past temporal scope in sentence 1 does not mutate present temporal scope in sentence 2.
- Future intention in sentence 1 does not overwrite ongoing activity in sentence 2.

### Tests
- **Test 15 (Test A)**: `"Saya mungkin punya bisnis A. Bisnis B saya sudah berjalan."`
  - Asserts Claim A is `modality: 'uncertain'` with confidence $\le 0.6$.
  - Asserts Claim B has `temporalScope: 'present'` and is **not** uncertain.
- **Test 16 (Test B)**: `"Saya dulu punya bisnis A. Sekarang saya menjalankan bisnis B."`
  - Asserts Claim A has `temporalScope: 'past'`.
  - Asserts Claim B has `temporalScope: 'present'` (unpolluted by `dulu`).
- **Test 17 (Test C)**: `"Saya mungkin akan menjual yoghurt. Saya membuat yoghurt untuk saya sendiri."`
  - Asserts future intention ("menjual yoghurt") is `temporalScope: 'future'` and `modality: 'uncertain'`.
  - Asserts ongoing activity ("membuat yoghurt") has `temporalScope: 'present'`, `purpose: 'self_consumption'`, and is **not** uncertain.

---

## 4. Regression Results

### Test Execution
Command:
```bash
node --import tsx --test src/domain/__tests__/*.test.ts src/storage/__tests__/*.test.ts src/pipeline/__tests__/*.test.ts
```
Results:
- **Total Tests**: 40
- **Passed**: 40
- **Failed**: 0
- **Suites**: 9 passed
- **Duration**: ~1.2s

### Static Analysis
Command:
```bash
npm run lint (tsc --noEmit)
```
- **Result**: 0 errors (clean pass)

### Production Build
Command:
```bash
npm run build (vite build)
```
- **Result**: Built successfully in 886ms (clean bundle generation)

---

## 5. Deferred Findings

As directed by the audit protocol, the following findings are **intentionally NOT addressed** in this condition-closure task:

1. **F-2.1-01 (Deterministic Extractor Overfitting)**:
   - The deterministic engine is designed as a lightweight, offline test harness for the canonical test matrix without requiring cloud LLM dependencies or API keys. Full generalization across open-domain human phrasing will be addressed when an LLM extraction engine is plugged into `ISemanticExtractor`.
2. **F-2.1-04 (Invariant Gate Semantic Blindness)**:
   - The Invariant Gate remains strictly a syntactic character-offset verifier enforcing the Zero-Fabrication Invariant. Semantic correctness remains the responsibility of the extraction engine and subsequent review stages.
3. **F-2.1-05 (Extractor Version Invalidation)**:
   - Versioned deprecation/reprocessing policies remain deferred until the re-indexing engine is designed.

---

## 6. Phase 2.1 Boundary

We strictly confirm that **NONE** of the following out-of-scope capabilities were implemented:
- [x] **Entity Resolution**: NOT implemented. Mentions remain candidate surfaces; no entity creation or candidate merging occurs.
- [x] **Graph Projection**: NOT implemented.
- [x] **Wander**: NOT implemented.
- [x] **UI**: NOT modified.
- [x] **localStorage migration**: NOT implemented.
- [x] **Embeddings**: NOT implemented.
- [x] **Vector search**: NOT implemented.
- [x] **Mem0**: NOT implemented.
- [x] **Qdrant**: NOT implemented.

---

## 7. Verdict

# **CLOSED**
