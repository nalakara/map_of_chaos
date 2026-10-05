# Phase 2.1 Implementation — Semantic Extraction Core

## 1. Scope

Phase 2.1 implements **Semantic Extraction Core** strictly following `docs/phase_2_design.md` and the semantic contracts:
- Pipeline stage: `Dump -> Evidence -> Semantic Extraction -> Mention -> Claim Candidate`.
- The extractor answers only: *"What did the human explicitly say?"* and never *"What is probably true?"*.
- All extracted semantic candidates are strictly grounded back to the source `Dump` via byte-indexed `Evidence` spans.
- Full multi-entity and multi-claim extraction from single dumps.
- Strict isolation from Entity Resolution (Phase 2.2), graph projection, UI redesign, embeddings, vector search, or external databases.

---

## 2. Files Added

The following files were created in `src/pipeline/`:

1. [`src/pipeline/types.ts`](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/pipeline/types.ts)
   - Defines the pluggable engine interface `ISemanticExtractor`.
   - Defines pipeline types: `GroundedExtraction`, `ExtractionOptions`, `RawExtractionCandidate`.
2. [`src/pipeline/extraction/normalizer.ts`](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/pipeline/extraction/normalizer.ts)
   - Implements span matching utilities (`findExactSpan`, `findAllExactSpans`).
   - Implements 1st-person pronoun detector (`isUserSelfReference` for "saya", "aku", "me", "ku").
   - Implements surface normalizers and cardinal word parsers.
3. [`src/pipeline/extraction/invariantGate.ts`](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/pipeline/extraction/invariantGate.ts)
   - Implements the contract-level Invariant Gate `InvariantGate.verify(dump, rawResult)`.
   - Guarantees zero hallucinations / zero ungrounded candidates by re-slicing and asserting evidence spans against raw dump text.
4. [`src/pipeline/extraction/deterministic.ts`](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/pipeline/extraction/deterministic.ts)
   - Implements `DeterministicSemanticExtractor` adhering to `ISemanticExtractor`.
   - Handles multi-account enumeration (Instagram handles with dots and underscores), business line declarations with partitivity qualifiers ("salah satu lini usaha"), domain sectors ("teknologi", "AI", "visual design"), relational account bindings ("X adalah akun Instagram untuk Y"), numerical cardinality without individual identity fabrication, activity assertions without synthetic order entities, present activity vs. future intention, exploratory activity without role inference, pronoun candidates (`user_self`), explicit negation ("tidak punya"), explicit uncertainty ("mungkin"), and temporal qualifiers ("dulu").
5. [`src/pipeline/extraction/extractor.ts`](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/pipeline/extraction/extractor.ts)
   - Implements `SemanticExtractionOrchestrator`.
   - Coordinates extraction engines, invariant verification, and repository persistence.
   - Provides `extract(dump, options)` and `extractAndGround(dump, repositories, options)`.
6. [`src/pipeline/index.ts`](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/pipeline/index.ts)
   - Public export surface for the extraction pipeline.
7. [`src/pipeline/__tests__/semanticExtraction.test.ts`](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/pipeline/__tests__/semanticExtraction.test.ts)
   - 13 comprehensive unit and integration tests covering the 18 test matrix requirements.

---

## 3. Files Modified

1. [`src/domain/types.ts`](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/domain/types.ts)
   - Added optional `referenceTarget?: 'user_self' | 'unresolved_pronoun' | 'context_referent'` to `ExtractedMentionCandidate` to preserve pronoun semantic targets without creating arbitrary entities.
   - Added optional `category?: string` and `platform?: string` to `ClaimQualifiers`.
2. [`src/domain/invariants.ts`](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/domain/invariants.ts)
   - Updated `areQualifiersEquivalent` to include `category` and `platform` comparison in claim identity evaluation.

*No legacy files (`src/types.ts`, `src/App.tsx`, `src/services/aiService.ts`, `src/MapCanvas.tsx`, `src/data/initialData.ts`) were touched.*

---

## 4. Extraction Architecture

The architecture enforces a modular, pluggable extraction flow:

```
                  ┌──────────────┐
                  │     Dump     │
                  └──────┬───────┘
                         │
                         ▼
        ┌──────────────────────────────────┐
        │  ISemanticExtractor Engine       │
        │  (Deterministic / LLM / Hybrid)  │
        └────────────────┬─────────────────┘
                         │
                         ▼ RawExtractionCandidate
        ┌──────────────────────────────────┐
        │        Invariant Gate            │
        │  - Exact span re-slice check     │
        │  - Mention-in-evidence check     │
        │  - Relational grounding check    │
        │  - Drop ungrounded candidates    │
        └────────────────┬─────────────────┘
                         │
                         ▼ Verified ExtractionCandidate
        ┌──────────────────────────────────┐
        │ SemanticExtractionOrchestrator   │
        │  - Creates Evidence records      │
        │  - Emits Mentions                │
        │  - Emits Claim Candidates        │
        │  - Idempotent Repo Persistence   │
        └────────────────┬─────────────────┘
                         │
                         ▼
             Grounded Extraction Output
    (Ready for Phase 2.2 Entity Resolution)
```

---

## 5. Provenance Model

Every extracted item maintains a cryptographic/structural provenance chain:
- **Evidence Spans**: Record `dumpId`, exact `startOffset`, `endOffset`, and `exactQuote`.
- **Mentions**: Record `mentionId`, `rawSurface`, `evidenceSpan` referencing the exact evidence slice, and an ephemeral `tempEntityId` (`temp:entity:...`) ensuring no entity is prematurely synthesized.
- **Relational Claims**: Feature dual-side grounding using both subject `evidenceId` and object `objectMentionId`, as standardized in Phase 1 Condition Closure.
- **Epistemic Modality**: Explicitly distinguishes `factual`, `negated`, `uncertain`, `hypothetical`, and `temporal_bound`.

---

## 6. Extraction Engine

The engine implementation follows `ISemanticExtractor`:
- Default implementation: `DeterministicSemanticExtractor`.
- Fully deterministic and offline; requires no external LLM, API keys, network calls, or embeddings.
- Handles Indonesian grammar constructs present in all canonical acceptance criteria ("adalah", "salah satu lini usaha", "bergerak di bidang", "punya N [item]", "menerima pesanan", "sedang research tentang", "untuk X dan nantinya Y", "dulu", "mungkin", "tidak punya").
- Pluggable design allows future addition of LLM-based extractors (e.g. `GeminiSemanticExtractor`) without altering the orchestrator or invariant validation layer.

---

## 7. Idempotency Strategy

- Reprocessing the exact same dump produces deterministic mention temporary IDs and evidence spans based on `dumpId` and span offsets.
- When `extractAndGround` runs against storage:
  1. Mentions and Evidence spans for the dump are looked up via `dumpRepo`.
  2. If evidence spans already exist for the dump with matching offsets, existing spans are reused to prevent duplicate storage records.
  3. No ungrounded entities are written to `entityRepo`.

---

## 8. Tests

The test suite in [`src/pipeline/__tests__/semanticExtraction.test.ts`](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/pipeline/__tests__/semanticExtraction.test.ts) validates:

1. **Instagram Multi-Account (Canonical DUMP A)**:
   - Extracts 5 account mentions (`freshbeda`, `yudhan.sebastian`, `nalakara.id`, `rampainusa`, `matatua`), individual ownership claims, and quantity aggregate claim (count = 5).
2. **Nalakara Business & Partitivity (Canonical DUMP B)**:
   - Extracts `Nalakara` mention, business-line assertion with `partitivity: 'one_of_several_business_lines'`, user relationship, and sector classifications (`teknologi`, `AI`).
3. **Freshbeda Business & Focus (Canonical DUMP C)**:
   - Extracts `Freshbeda` mention, business-line assertion, and sector classification (`visual design`).
4. **Relational Claim with Provenance (Canonical DUMP D)**:
   - Extracts `nalakara.id` and `Nalakara` mentions, relational claim candidate `instagram_account_for`, with `subjectMentionId` and `objectMentionId` provenance.
5. **Quantity without Individual Identities**:
   - "Saya punya 2 mesin kopi, 1 mesin roasting, 1 freezer, 2 refrigerator" produces 4 quantity claims with exact counts (2, 1, 1, 2) without fabricating synthetic item entities (`Coffee Machine #1`, etc.).
6. **Activity Extraction**:
   - "Saya menerima pesanan blend kopi" extracts `accepts_orders` activity claim without fabricating synthetic `Order #1` entities.
7. **Present Activity vs Future Intention**:
   - "Saya membuat yoghurt untuk saya sendiri dan nantinya saya jual juga" extracts present activity (`makes_yoghurt`, `temporalScope: 'present'`) and future intention (`intends_to_sell_yoghurt`, `temporalScope: 'future'`).
8. **Exploratory Activity**:
   - "Saya sedang research tentang membuat video YouTube faceless" extracts exploratory research claim without inferring that user is a YouTuber or owns a channel.
9. **Pronoun / User Reference**:
   - First-person pronouns ("saya") are tagged `referenceTarget: 'user_self'` and do not generate an arbitrary "saya" entity.
10. **Temporal Modifiers**:
    - "Dulu saya punya kafe di Bandung" extracts claim with `temporalScope: 'past'` and qualifier `validityPeriod: 'past'`.
11. **Negation & Uncertainty**:
    - "Saya tidak punya tim sales" extracts `modality: 'negated'`.
    - "Mungkin saya akan buka cabang baru" extracts `modality: 'uncertain'`.
12. **Grounding & Storage Idempotency**:
    - Verified against in-memory repository driver, producing properly grounded `Evidence` records.
13. **Entity Resolution Boundary Enforcement**:
    - Directly verifies that `freshbeda` (Dump A) and `Freshbeda` (Dump B) remain separate un-merged mentions with separate temporary IDs, strictly verifying that Phase 2.1 does not perform entity resolution.

---

## 9. Test Results

### 1. Test Suite Execution
```bash
node --import tsx --test src/domain/__tests__/*.test.ts src/storage/__tests__/*.test.ts src/pipeline/__tests__/*.test.ts
```
**Output:**
```
▶ Domain Invariants Suite (8.6ms) - 5 tests passed
▶ State Machines Suite (9.1ms) - 5 tests passed
▶ Phase 2.1 — Semantic Extraction Core Suite (65.7ms) - 13 tests passed
▶ Phase 1 Condition Closure Suite (88.1ms) - 8 tests passed
▶ Storage Layer & ContextStore Integration (52.0ms) - 5 tests passed

ℹ tests 36
ℹ suites 9
ℹ pass 36
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

### 2. TypeScript / Lint Verification
```bash
npm run lint (tsc --noEmit)
```
**Output:**
```
> react-example@0.0.0 lint
> tsc --noEmit
# Exit code: 0 (0 errors)
```

### 3. Production Build Verification
```bash
npm run build (vite build)
```
**Output:**
```
✓ 1712 modules transformed.
dist/index.html                   2.05 kB │ gzip:   0.83 kB
dist/assets/index-DSq_y_6e.css   37.42 kB │ gzip:   6.92 kB
dist/assets/index-B2BQ0h5Z.js   328.06 kB │ gzip: 100.61 kB
✓ built in 1.44s
# Exit code: 0
```

---

## 10. Phase 2 Boundary Check

We explicitly confirm that **NONE** of the following were implemented:
- [x] **Entity Resolution**: NOT implemented. Mentions carry ephemeral temporary IDs; no entity matching was performed.
- [x] **Graph Projection**: NOT implemented. Projections remain deferred to Phase 3.
- [x] **Wander**: NOT implemented.
- [x] **UI redesign**: NOT implemented.
- [x] **localStorage migration**: NOT implemented.
- [x] **Embeddings**: NOT implemented.
- [x] **Vector database**: NOT implemented.
- [x] **Mem0**: NOT implemented.
- [x] **Qdrant**: NOT implemented.

---

## 11. Known Limitations

The following items are intentionally deferred to Phase 2.2 (Entity Resolution):
1. **Mention-to-Entity Resolution**: Resolving whether `freshbeda` and `Freshbeda` bind to the same persistent entity.
2. **Entity Creation**: Upgrading `tempEntityId` to permanent entity IDs in `entityRepo`.
3. **Resolution Decisions**: Generating resolution records (`matched_existing`, `new_entity`, `ambiguous`, `associated_handle`).
4. **Context Accumulation**: Committing un-resolved claim candidates into persistent active context entities.

---

## 12. Implementation Verdict

**COMPLETE**
