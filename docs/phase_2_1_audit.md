# Phase 2.1 Audit — Semantic Extraction Core

## 1. Audit Scope

This document provides a comprehensive, read-only architectural audit of **Phase 2.1 — Semantic Extraction Core**.
The implementation was audited against:
- `docs/product_contract.md`
- `docs/context_model_contract.md`
- `docs/semantic_extraction_contract.md`
- `docs/entity_resolution_contract.md`
- `docs/runtime_pipeline_design.md`
- `docs/domain_data_schema_and_state_spec.md`
- `docs/implementation_architecture.md`
- `docs/phase_1_audit.md`
- `docs/phase_1_condition_closure.md`
- `docs/phase_2_design.md`
- `docs/phase_2_1_implementation.md`

Audited source code:
- `src/pipeline/types.ts`
- `src/pipeline/extraction/normalizer.ts`
- `src/pipeline/extraction/invariantGate.ts`
- `src/pipeline/extraction/deterministic.ts`
- `src/pipeline/extraction/extractor.ts`
- `src/pipeline/index.ts`
- `src/pipeline/__tests__/semanticExtraction.test.ts`
- All Phase 1 domain and storage suites (`src/domain/`, `src/storage/`).

---

## 2. Executive Verdict

### **READY WITH CONDITIONS**

The structural and architectural foundations of Phase 2.1 are sound:
1. **Pipeline & Architectural Boundary**: The `Dump -> Evidence -> Semantic Extraction -> Mention -> Claim Candidate` pipeline is cleanly implemented.
2. **Pluggable Engine Interface**: `ISemanticExtractor` cleanly abstracts the extraction engine from invariant verification and persistence orchestration.
3. **Zero-Fabrication Invariant Gate**: Syntactic character-offset verification prevents hallucinated spans from entering the pipeline.
4. **Strict Entity Resolution Isolation**: Phase 2.1 completely avoids entity creation, entity resolution, and candidate merging. `freshbeda` and `Freshbeda` remain isolated candidate mentions with distinct temporary IDs.
5. **Persistence Isolation**: Repositories are used exclusively; zero writes to `localStorage`; zero references to legacy `Thing` or `Relationship`.

**However**, three concrete conditions require resolution before Phase 2.2:
- **Condition 1 (Claim Evidence Grounding)**: `extractAndGround` persists `Evidence` spans for mentions, but omits persisting `Evidence` spans for claims, leaving claims without persistent `evidenceId` references.
- **Condition 2 (Scoped Modality & Temporal Pollution)**: Dump-level keywords (`mungkin`, `dulu`) pollute all claims extracted from the entire dump indiscriminately, corrupting compound multi-sentence dumps.
- **Condition 3 (Deterministic Engine Overfitting)**: `DeterministicSemanticExtractor` is tightly fitted to canonical sentence templates and cannot generalize to arbitrary syntax, requiring recognition that it serves as an offline test harness rather than a general-purpose natural language extractor.

---

## 3. Architecture Compliance Matrix

| Dimension | Status | Evidence | Finding |
| :--- | :--- | :--- | :--- |
| **1. Domain alignment** | **PASS** | `src/pipeline/types.ts` | Adheres strictly to `Dump -> Evidence -> Mention -> ClaimCandidate` model. |
| **2. Provenance integrity** | **PARTIAL** | `src/pipeline/extraction/extractor.ts:58-72` | Mention spans are saved as `Evidence`, but Claim sentence spans are not saved to `dumpRepo`. |
| **3. Semantic fidelity** | **PASS** | `src/pipeline/extraction/deterministic.ts` | Captures cardinality, partitivity, activity, and domain sectors without synthesizing artificial entities. |
| **4. Uncertainty preservation** | **PARTIAL** | `src/pipeline/extraction/deterministic.ts:452-457` | Captures `uncertain` modality, but applies globally to all claims in the dump. |
| **5. Temporal fidelity** | **PARTIAL** | `src/pipeline/extraction/deterministic.ts:460-464` | Distinguishes `present`, `future`, `recurring`, and `past`, but keyword "dulu" pollutes all claims in dump. |
| **6. Qualifier preservation** | **PASS** | `src/domain/invariants.ts`, `types.ts` | `quantity`, `partitivity`, `purpose`, `category`, and `platform` qualifiers survive and participate in claim identity. |
| **7. Multi-entity support** | **PASS** | `src/pipeline/__tests__/semanticExtraction.test.ts:18-77` | Single dumps yield multiple distinct mentions without binding to a single entity. |
| **8. Multi-claim support** | **PASS** | `src/pipeline/__tests__/semanticExtraction.test.ts:82-124` | Single dumps produce multiple claims (e.g. business line + 2 sector classifications). |
| **9. Entity Resolution boundary** | **PASS** | `src/pipeline/__tests__/semanticExtraction.test.ts:449-485` | Zero entity creation or merging. `freshbeda` and `Freshbeda` remain distinct mentions. |
| **10. Generalization** | **FAIL** | `src/pipeline/extraction/deterministic.ts` | Relies on hardcoded regex templates matching canonical prompt sentences; fails on synonyms or alternate syntax. |
| **11. Idempotency** | **PASS** | `src/pipeline/extraction/extractor.ts:44-98` | Re-extraction deduplicates existing evidence and mentions by exact span and dump ID. |
| **12. Pluggability** | **PASS** | `src/pipeline/types.ts:15-18` | `ISemanticExtractor` is completely modular and decoupling-ready for LLM engines. |
| **13. Test quality** | **PARTIAL** | `src/pipeline/__tests__/semanticExtraction.test.ts` | 13 tests cover all canonical cases, but suffer from high overfit risk to exact phrasing. |

---

## 4. Extraction vs Pattern Matching

The current `DeterministicSemanticExtractor` was inspected mechanism by mechanism:

| Mechanism | Implementation Type | Classification | Detail |
| :--- | :--- | :--- | :--- |
| **User Pronoun** | Regex `\b(saya\|aku\|gue\|gw\|i)\b` | **DOMAIN-GENERAL** | Correctly detects 1st-person pronouns across Indonesian and English. |
| **Multi-Account** | `punya (\d+) akun (instagram\|twitter\|tiktok\|x): [handles]` | **CANONICAL-CASE-SPECIFIC** | Hardcoded to 4 platforms; fails if platform is LinkedIn, GitHub, YouTube, or if phrasing is "Akun Instagram saya ada 5". |
| **Account Declaration** | `[handle] adalah akun [platform] untuk [Target]` | **CANONICAL-CASE-SPECIFIC** | Matches canonical DUMP D syntax; fails on "Nalakara punya akun IG [handle]". |
| **Business Line** | `[Name] adalah (salah satu )?lini usaha saya...` | **CANONICAL-CASE-SPECIFIC** | Fitted to exact phrasing of DUMP B and C; fails on "Bisnis saya namanya Nalakara" or "Nalakara itu usaha saya". |
| **Quantity Inventory** | `punya [item], [item]` + `(\d+) ([noun])` | **DOMAIN-GENERAL (Parsing) / CANONICAL (Trigger)** | Count parsing is domain-general for arbitrary nouns, but trigger has hardcoded guard `!text.includes('lini usaha')`. |
| **Present vs Future** | `membuat [X] untuk saya sendiri dan nantinya saya jual` | **CANONICAL-CASE-SPECIFIC** | Rigidly requires "untuk saya sendiri dan nantinya saya jual"; fails on "Saya bikin yoghurt, mau dijual nanti". |
| **Exploratory Activity** | `sedang (research\|riset\|mencari tahu) tentang [topic]` | **DOMAIN-GENERAL** | General pattern for research activities. |
| **Recurring Activity** | `menerima pesanan [type]` | **CANONICAL-CASE-SPECIFIC** | Specifically matches order acceptance phrasing. |
| **Negation** | `tidak punya [item]` | **DOMAIN-GENERAL** | General possessive negation pattern. |
| **Uncertainty Modifier** | Global `mungkin\|maybe\|i think` search | **COARSE GLOBAL PATTERN** | Mutates all claims in the dump rather than scoping to the enclosing proposition. |
| **Past Temporal Modifier**| Global `dulu\|used to` search | **COARSE GLOBAL PATTERN** | Mutates all claims in the dump to `past` indiscriminately. |

---

## 5. Evidence & Provenance

1. **Character-Offset Slicing**:
   - `startOffset` and `endOffset` strictly reference `dump.rawText`.
   - `InvariantGate.verify()` asserts `dump.rawText.slice(startOffset, endOffset) === textSpan`.
2. **Provenance Preservation**:
   - Mentions are tied to exact character spans within `dump.rawText`.
   - Relational claims record both `subjectMentionSurface` and `objectMentionSurface`.
3. **Identified Provenance Gap**:
   - In `SemanticExtractionOrchestrator.extractAndGround()`:
     ```typescript
     for (const mention of verifiedResult.mentions) {
       // saves evidence for mention...
     }
     ```
     Evidence spans are persisted for mentions, but **NOT** for claims. `claim.textSpan` is validated in memory but never stored in `dumpRepo` as an `Evidence` record. When claims are converted to persistent entities during Phase 2.2, they will lack a persistent `evidenceId`.

---

## 6. Claim Semantics

1. **Predicates & Values**:
   - Predicates are clean semantic assertions: `owns_social_account`, `operates_business`, `operates_in_sector`, `focuses_on_domain`, `has_social_account`, `owns_asset`, `engages_in_activity`, `intends_activity`, `researches_topic`.
   - Object values use structured discriminators: `mention_surface`, `concept`, `literal`.
2. **Zero Default Fabrication**:
   - The extractor does not invent synthetic IDs (`Coffee Machine #1`, `Order #1`).
   - Cardinality claims store numbers in `qualifiers.quantity` instead of creating multiple fake entities.
3. **Temporal Scope**:
   - Defaults to `'present'` for ongoing states and assets.
   - Distinct from `observationTime` (which belongs to the Dump and is tracked via `dump.createdAt`).

---

## 7. Negation & Uncertainty

1. **Negation**:
   - Captures `tidak punya` and sets `qualifiers.modality = 'negated'`.
   - *Limitation*: Does not support nuanced aspectual negation:
     - "Saya belum punya" (prospective / not yet).
     - "Saya tidak lagi punya" (terminated state / cessation).
     - "Saya bukan pemilik" (identity negation).
2. **Uncertainty & Global Scope Defect**:
   - `deterministic.ts:452-457`:
     ```typescript
     if (/\b(mungkin|maybe|i think)\b/i.test(text)) {
       claims.forEach((c) => {
         c.qualifiers = { ...c.qualifiers, modality: 'uncertain' };
         c.extractionConfidence = Math.min(c.extractionConfidence, 0.6);
       });
     }
     ```
   - If a dump contains:
     *"Saya punya 2 mesin roasting. Mungkin saya akan beli 1 lagi tahun depan."*
     The certainty of owning 2 roasting machines is corrupted to `modality: 'uncertain'` and confidence `0.6`.
   - **Requirement**: Modality must be scoped to the sentence/clause span from which the claim was extracted.

---

## 8. Temporal Semantics

1. **Temporal Distinction**:
   - Present activity ("membuat yoghurt") is correctly marked `temporalScope: 'present'`.
   - Future commercial intention ("nantinya saya jual") is correctly marked `temporalScope: 'future'`.
   - Recurring activity ("menerima pesanan") is marked `temporalScope: 'recurring'`.
2. **Past Temporal Defect**:
   - `deterministic.ts:460-464`:
     ```typescript
     if (/\b(dulu|used to)\b/i.test(text)) {
       claims.forEach((c) => {
         c.temporalScope = 'past';
       });
     }
     ```
   - In a compound dump:
     *"Dulu saya punya kafe di Bandung. Sekarang saya menjalankan Freshbeda."*
     Both claims are overwritten with `temporalScope: 'past'`.
   - **Requirement**: Temporal modifiers must be applied locally to the matching proposition span.

---

## 9. Qualifiers & Cardinality

1. **Cardinality**:
   - `"Saya punya 2 mesin kopi, 1 mesin roasting, 1 freezer, 2 refrigerator."`
   - Produces 4 distinct `owns_asset` claims with exact counts: `2`, `1`, `1`, `2`.
   - Avoids creating individual numbered item entities.
   - Generalizes to arbitrary nouns (e.g. "2 sepeda, 1 treadmill").
2. **Qualifiers**:
   - `partitivity: 'one_of_several_business_lines'` is preserved for "salah satu lini usaha".
   - `purpose: 'self_consumption'` is preserved for "untuk saya sendiri".
   - `platform: 'instagram'` is preserved for social handles.
3. **Gaps**:
   - Approximation qualifiers ("sekitar 2", "kurang lebih 5") are stripped by `parseNumberWord`.
   - Degree/condition qualifiers are not extracted.

---

## 10. Multi-Entity / Multi-Claim

- Tested with DUMP A, DUMP B, and inventory dumps:
  - DUMP A yields 6 mentions (1 person + 5 handles) and 6 claims (5 individual + 1 aggregate cardinality).
  - DUMP B yields 2 mentions (1 person + 1 company) and 3 claims (1 business line + 2 domain sectors).
- No ordering assumptions or single-entity bottlenecks exist in the orchestrator.

---

## 11. Relational Claims

- DUMP D: `"nalakara.id adalah akun Instagram untuk Nalakara."`
  - Correctly extracts:
    - Subject: `Nalakara` (`typeHint: 'company'`).
    - Object: `nalakara.id` (`typeHint: 'social_handle'`).
    - Predicate: `has_social_account`.
    - Both subject and object surfaces are preserved.
  - Relational grounding connects both ends without prematurely resolving them to persistent entities.

---

## 12. Pronouns & References

- First-person pronouns ("saya", "aku", "gue", "gw", "i"):
  - Tagged with `referenceTarget: 'user_self'`.
  - Type hint: `'person'`.
  - **Zero entity creation**: No entity named `"saya"` is stored in `entityRepo`.
  - Satisfies the contract requirement that pronouns remain reference candidates pending resolution.

---

## 13. Entity Resolution Boundary

**STRICT COMPLIANCE**:
- Tested explicitly in `src/pipeline/__tests__/semanticExtraction.test.ts:449-485`:
  - DUMP A: `"freshbeda adalah akun Instagram saya."` -> `surfaceForm: 'freshbeda'`, `typeHint: 'social_handle'`.
  - DUMP C: `"Freshbeda adalah lini usaha saya..."` -> `surfaceForm: 'Freshbeda'`, `typeHint: 'company'`.
- Result:
  - Both mentions remain completely distinct candidates.
  - No merging occurs.
  - No match decisions (`matched_existing`, `new_entity`, `ambiguous`) are generated.
  - No persistent Entity IDs are assigned.

---

## 14. Human-Stated vs AI-Inferred

- In the exploratory test (`"Saya sedang research tentang membuat video YouTube faceless"`):
  - Extracted claim: `researches_topic` with `value: 'membuat video YouTube faceless'` and `modality: 'exploratory'`.
  - Prohibited inferences (`is_youtuber`, `owns_channel`, `will_create_channel`) are **NOT** generated.
- The extractor preserves strictly what was said, without fabricating inferred commitments.

---

## 15. Invariant Gate

- `InvariantGate.verify()` performs strict syntactic validation:
  1. Checks `dump.rawText.slice(startOffset, endOffset) === textSpan`.
  2. Verifies that `mention.surfaceForm` is contained within `mention.textSpan`.
  3. Drops any candidate whose offsets fail string slicing.
- **Architectural Limitation**:
  - The Invariant Gate is a **syntactic offset verifier**, not a **semantic truth verifier**.
  - If an extractor outputs a claim with predicate `owns_asset` on a sentence that reads *"Saya tidak punya mesin kopi"*, the Invariant Gate will pass it because the sentence span exists in `rawText`.
  - Semantic consistency must be guarded by the extraction engine itself and subsequent review/validation rules.

---

## 16. Idempotency & Reprocessing

- `SemanticExtractionOrchestrator.extractAndGround()`:
  - Queries existing `Evidence` and `Mentions` by `dumpId`.
  - If a mention with identical `surfaceForm` and `evidenceId` already exists, it is skipped.
  - If an evidence span with identical `textSpan` exists, it is reused.
  - Verified by integration test: running `extractAndGround` twice on the same dump inserts zero duplicate rows into IndexedDB/Memory driver.
- **Limitation**: Does not implement versioned invalidation (e.g. purging or superseding mentions when `extractorVersion` changes).

---

## 17. Persistence Boundary

- **No localStorage**: Zero direct calls to browser `localStorage`.
- **Repository Pattern**: All persistence runs through `DumpRepository` and `EntityRepository`.
- **Zero Legacy Contamination**: No instances of `Thing` or `Relationship` (from `src/types.ts`) are created, imported, or modified.
- **Graph State**: Graph projection is completely decoupled; no graph nodes or canvas elements are created.

---

## 18. Test Quality

The 36 passing tests across the 9 test suites were classified:

| Suite / Test Group | Category | Assessment |
| :--- | :--- | :--- |
| **Domain Invariants Suite (5 tests)** | **FOUNDATIONAL** | Verifies core domain rules (merging prevention, temporal shift evaluation, grounding). |
| **State Machines Suite (5 tests)** | **FOUNDATIONAL** | Verifies audit trails, claim reviews, and human overrides. |
| **Phase 1 Condition Closure (8 tests)** | **REGRESSION** | Verifies multi-store transactions, qualifier comparison, observation time separation. |
| **Storage & ContextStore (5 tests)** | **FOUNDATIONAL** | Verifies additive accumulation, contradiction detection, and repository invariants. |
| **Extraction: Tests 12 & 13** | **FOUNDATIONAL** | Verifies repository idempotency and strict entity resolution boundary enforcement. |
| **Extraction: Test 9** | **FOUNDATIONAL** | Verifies pronoun `user_self` reference preservation without entity creation. |
| **Extraction: Tests 1–8, 10–11** | **OVERFIT-RISK** | Tests the exact canonical phrasing; passes because `DeterministicSemanticExtractor` has regexes tailored to these specific sentence strings. |

---

## 19. Generalization Benchmark

To evaluate whether the current implementation generalizes beyond the canonical examples, 5 unseen prompts were evaluated conceptually against the codebase:

1. `"Tenho três contas no LinkedIn: studio_a, yudhanworks, nalakara."`
   - Language: Portuguese; Platform: LinkedIn.
   - **Result: FAILS**. Extractor only recognizes Indonesian/English and Instagram/Twitter/TikTok/X.
2. `"Acme adalah salah satu bisnis saya dan fokus pada konsultasi."`
   - Phrasing: "bisnis saya" instead of "lini usaha saya".
   - **Result: FAILS**. Regex strictly requires literal `lini usaha saya`.
3. `"Saya sudah tidak menjalankan bisnis itu."`
   - Semantics: Terminated activity / historical ownership.
   - **Result: FAILS**. No pattern matches `sudah tidak menjalankan`.
4. `"Saya mungkin akan menjual kopi tahun depan."`
   - Phrasing: Future intent without "untuk saya sendiri".
   - **Result: FAILS**. Global regex sets `modality: 'uncertain'`, but fails to extract the commercial intention claim because `presentFutureRegex` requires `untuk saya sendiri`.
5. `"Di rumah saya ada dua sepeda dan satu treadmill."`
   - Phrasing: "ada" instead of "punya / memiliki".
   - **Result: FAILS**. `itemsListRegex` requires `punya` or `memiliki`.

**Conclusion**: The `DeterministicSemanticExtractor` does not generalize to arbitrary phrasing. It functions strictly as a deterministic test harness for the canonical suite.

---

## 20. Findings by Severity

### HIGH
1. **F-2.1-01: Deterministic Engine Overfitting**:
   - `DeterministicSemanticExtractor` is tightly fitted to canonical prompt examples. While compliant with the prompt directive to implement deterministic fallback only to the extent necessary for acceptance tests without external LLM keys, it cannot serve as a production extraction engine.
   - *Impact*: Any variance in user phrasing results in zero extraction.

### MEDIUM
2. **F-2.1-02: Claim Sentence Spans Omitted from Evidence Persistence**:
   - In `SemanticExtractionOrchestrator.extractAndGround()`, `Evidence` records are persisted for `mention.textSpan`, but omitted for `claim.textSpan`.
   - *Impact*: In Phase 2.2, when claim candidates are resolved and stored in `claimRepo`, claims will have no backing `Evidence` record ID in `dumpRepo`.
3. **F-2.1-03: Global Modality and Temporal Scope Pollution**:
   - The keywords `mungkin` and `dulu` iterate over all claims in the dump and overwrite `modality` and `temporalScope` globally across the entire dump.
   - *Impact*: Compound dumps containing both past and present, or certain and uncertain statements, have their semantics corrupted.
4. **F-2.1-04: Invariant Gate Semantic Blindness**:
   - `InvariantGate` only validates character offsets and substring existence. It cannot detect semantic inversion or fabricated predicates within a valid text slice.

### LOW
5. **F-2.1-05: Missing Extractor Version Invalidation in Repository Grounding**:
   - `extractAndGround` reuses existing evidence spans without checking whether the `extractorVersion` has changed, preventing clean re-extraction upon engine upgrades.

---

## 21. Required Changes Before Phase 2.2

Before beginning Phase 2.2 (Entity Resolution), the following two architectural conditions must be closed:

1. **Condition 1 (Persist Claim Evidence Spans)**:
   - Update `SemanticExtractionOrchestrator.extractAndGround()` to create and persist `Evidence` records for `verifiedResult.claims`, ensuring every claim candidate has an identifiable `evidenceId`.
2. **Condition 2 (Clause-Scoped Modality and Temporal Scope)**:
   - Refactor `DeterministicSemanticExtractor` so that `mungkin` and `dulu` only modify claims whose `startOffset` and `endOffset` fall within the sentence or clause containing those modifiers, rather than mutating all claims globally.

*(Note: Replacing the deterministic extractor with a full production LLM engine is deferred until external model integration is scheduled; the pluggable `ISemanticExtractor` interface is already in place).*

---

## 22. Phase 2.2 Readiness

### **READY WITH CONDITIONS**

Phase 2.1 has successfully proven the pipeline structure, invariant safety gate, multi-entity / multi-claim support, and strict entity resolution boundary.

Upon closing Condition 1 (Claim Evidence Persistence) and Condition 2 (Clause-Scoped Modality/Temporal Binding), the system will be fully ready for **Phase 2.2 — Entity Resolution & Context Accumulation**.
