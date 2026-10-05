# Phase 2 Design — Semantic Extraction & Entity Resolution

## 1. Objective

Phase 2 establishes the **Semantic Ingestion Pipeline** for Map of Chaos:

$$\text{Raw Dump} \longrightarrow \text{Evidence} \longrightarrow \text{Extraction} \longrightarrow \text{Mention} \longrightarrow \text{Entity Resolution} \longrightarrow \text{Claim} \longrightarrow \text{Context Accumulation}$$

### Core Invariant
> **"Map of Chaos accumulates context, not merely nodes."**

The system does not convert raw text directly into visual map nodes. Instead, human language is grounded into immutable character-span evidence, parsed into candidate mentions and assertions, linked through revisable entity resolutions, and accumulated additively into persistent semantic memory.

---

## 2. Architectural Context

This design builds directly on the closed Phase 1 foundation:
- **Domain Layer** ([`src/domain/`](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/domain)): Canonical types, epistemic state machines, qualifier-safe invariants, and atomic re-binding audits.
- **Storage Layer** ([`src/storage/`](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/storage)): IndexedDB schema (`map_of_chaos_db_v1`), multi-store transaction execution, and the [`ContextStore`](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/storage/contextStore.ts) facade.
- **Phase 1 Audit & Condition Closure** ([`docs/phase_1_audit.md`](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/docs/phase_1_audit.md), [`docs/phase_1_condition_closure.md`](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/docs/phase_1_condition_closure.md)): Resolved qualifier preservation, object mention provenance, multi-store transactions, and `observationTime` vs. `temporalScope` separation.
- **Downstream Boundaries**: Graph projection ([`MapCanvas`](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/MapCanvas.tsx)) and reflection loops ([`Wander`](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/services/aiService.ts)) remain strictly downstream consumers in Phase 3.

---

## 3. Pipeline Overview

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. DUMP INGESTION                                                          │
│    DumpRepository.saveDump(rawText, source, createdAt, observationTime)     │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. EVIDENCE SPAN GROUNDING                                                 │
│    Create Evidence spans: startOffset, endOffset, textSpan slice            │
│    Invariant Guard: isEvidenceGroundedInDump()                             │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. SEMANTIC EXTRACTION                                                     │
│    ISemanticExtractor: Mentions, Predicates, Object Values, Qualifiers,     │
│    Observation Times, Temporal Scopes, Modalities                          │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 4. ENTITY RESOLUTION PIPELINE                                              │
│    Candidate Generation -> Multi-Signal Scoring -> Decision Gate           │
│    Outcomes: matched_existing | new_entity | ambiguous | associated_handle  │
│    Invariant Guard: Lexical similarity CANNOT authorize auto-merges        │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 5. CLAIM REIFICATION & REBINDING                                           │
│    Bind Subject & Object Entity IDs; link subjectMentionId & objectMentionId │
│    Initial Review State: 'extracted' | 'needs_review'                       │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 6. ADDITIVE CONTEXT ACCUMULATION                                           │
│    ContextStore.addClaim(): Qualifier-safe deduplication & reinforcement    │
│    Conflict Evaluation: Temporal Shift vs. Direct Contradiction             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Semantic Extraction Design

### 4.1 Interface Specification
```typescript
export interface ISemanticExtractor {
  extract(dump: Dump): Promise<ExtractionResult>;
}

export interface ExtractionResult {
  readonly dumpId: string;
  readonly extractorVersion: string;
  mentions: ExtractedMentionCandidate[];
  claims: ExtractedClaimCandidate[];
  rawObservations: string[];
  readonly executedAt: string;
}
```

### 4.2 Intermediate Structures
```typescript
export interface ExtractedMentionCandidate {
  surfaceForm: string;
  normalizedForm: string;
  textSpan: string;
  startOffset: number;
  endOffset: number;
  candidateTypeHint?: 'person' | 'company' | 'social_handle' | 'tool' | 'project' | 'concept' | 'location';
}

export interface ExtractedClaimCandidate {
  subjectMentionSurface: string;
  objectMentionSurface?: string;
  predicate: string;
  objectValue: {
    type: 'mention_surface' | 'literal' | 'concept';
    value: string;
  };
  qualifiers?: ClaimQualifiers;
  temporalScope: TemporalScope;
  textSpan: string;
  startOffset: number;
  endOffset: number;
  extractionConfidence: number;
}
```

### 4.3 Invariant Enforcement Gate
Before any candidate is admitted into the pipeline, it passes through the strict invariant gate:
1. `isEvidenceGroundedInDump(evidence, dump)`: `dump.rawText.slice(startOffset, endOffset) === textSpan`.
2. `isMentionGrounded(mention, evidence)`: The mention's surface text must be contained within the evidence span.
3. **Zero Fabrication Rule**: Any mention or claim whose character offsets fail string slicing is immediately dropped and logged as extraction error.

---

## 5. Evidence & Provenance

Map of Chaos enforces strict, unbroken provenance from raw human input to accumulated assertions:

```text
Dump (raw text)
  └── Evidence (exact startOffset, endOffset, textSpan)
        ├── Subject Mention (surfaceForm, evidenceId)
        │     └── EntityResolution (mentionId -> targetEntityId)
        ├── Object Mention (surfaceForm, evidenceId)
        │     └── EntityResolution (mentionId -> targetEntityId)
        └── Claim (predicate, objectValue, qualifiers)
              ├── dumpId
              ├── evidenceId (primary provenance)
              ├── supportingEvidenceIds (multi-dump reinforcement)
              ├── subjectMentionId
              └── objectMentionId
```

### Traceability Guarantee:
Given any `Claim`, the UI can immediately display the exact raw human sentence that produced it, highlight the subject and object tokens, and enumerate all corroborating dumps across time.

---

## 6. Mention Model

Mentions represent **ephemeral linguistic occurrences**, not persistent semantic identities:
- A mention captures *how* something was uttered at a specific location in a dump.
- A mention does *not* possess aliases, handles, or permanent graph properties.
- Multiple mentions in the same dump or across dumps can refer to the same Entity.
- Mentions are immutable once grounded.

```typescript
export interface Mention {
  readonly id: string;
  readonly evidenceId: string;
  readonly dumpId: string;
  readonly surfaceForm: string;
  readonly normalizedForm: string;
  candidateTypeHint?: string;
  readonly createdAt: string;
}
```

---

## 7. Entity Resolution Design

Entity Resolution maps an ephemeral `Mention` to a persistent `Entity` identity.

```text
Candidate Generation
  ├── 1. Exact Registered Handle Match (@handle, social username)
  ├── 2. Exact Canonical Name Match
  ├── 3. Alias / Known Synonyms Match
  └── 4. Lexical Overlap / Normalized Substring Match
        │
        ▼
Multi-Signal Evaluation
  ├── Lexical Similarity Score (0.0 - 1.0)
  ├── Contextual Predicate Corroboration (existing claims match)
  ├── Temporal / Domain Overlap
  └── Co-occurring Mention Support
        │
        ▼
Decision Gate (Strict Authority Matrix)
```

### Resolution Decision Matrix

| Signal Strength | Context Corroboration | Resolution Decision | Status | Human Review Needed? |
| :--- | :--- | :--- | :--- | :--- |
| Exact Handle match | Any | `associated_handle` | Active | No |
| Exact Canonical Name | Entity not ambiguous | `matched_existing` | Active | No |
| Exact Canonical Name | Entity flagged ambiguous | `ambiguous` | Provisional | Yes (`needs_review`) |
| Alias match | Shared domain/context | `matched_existing` | Active | No |
| High Lexical overlap | Explicit relational link | `matched_existing` | Active | No |
| High Lexical overlap | NO explicit link | `new_entity` + candidate links | Active / Candidate | Yes (`candidate_links`) |
| No match | N/A | `new_entity` | Active | No |

### CRITICAL INVARIANT:
**Lexical similarity alone CANNOT authorize an automated merge.** If "Freshbeda" (business) and "freshbeda" (Instagram account) both appear, they MUST remain distinct entities until explicit evidence or human override binds them.

---

## 8. Entity Linking States

Entity resolution records are reified and revisable:

```typescript
export interface EntityResolution {
  readonly id: string;
  readonly mentionId: string;
  readonly targetEntityId?: string;
  readonly outcome: 'matched_existing' | 'new_entity' | 'ambiguous' | 'associated_handle';
  readonly confidence: number;
  readonly rationale: string;
  readonly createdBy: 'machine' | 'human_override';
  status: 'active' | 'superseded';
  candidateEntityIds?: string[];
  overrideReason?: string;
  readonly createdAt: string;
}
```

### Lifecycle & Overrides:
1. Machine generates an initial resolution (`createdBy: 'machine'`).
2. If human re-binds the mention via UI (`ContextStore.rebindMention`):
   - The old resolution becomes `status: 'superseded'`.
   - A new resolution is written with `createdBy: 'human_override'`, `confidence: 1.0`.
   - Derived claims are rebound (both subject and object roles) with an immutable `ClaimBindingAudit`.
   - The original evidence span is preserved.

---

## 9. Claim Generation

Claims are the fundamental assertion primitive of Map of Chaos:

```typescript
export interface Claim {
  readonly id: string;
  subjectEntityId: string;
  predicate: string;
  objectValue: ClaimObjectValue; // { type: 'entity_id' | 'literal' | 'concept', value: string }
  qualifiers?: ClaimQualifiers;

  readonly observationTime: string;
  temporalScope: TemporalScope;
  validityDetails?: string;

  sourceOrigin: 'human_stated' | 'ai_inferred';
  reviewState: 'extracted' | 'needs_review' | 'human_confirmed' | 'rejected';

  readonly dumpId: string;
  readonly subjectMentionId?: string;
  readonly objectMentionId?: string;
  readonly evidenceId: string;
  supportingEvidenceIds: string[];

  conflictState?: 'none' | 'temporal_shift' | 'direct_contradiction';
  conflictingClaimIds?: string[];
  status: 'active' | 'superseded' | 'retracted';
}
```

### Relationship View:
A Relationship in Map of Chaos is simply a Claim where:
$$\text{Claim.objectValue.type} == \text{'entity\_id'}$$
Both endpoints (`subjectEntityId` and `objectValue.value`) link to persistent Entities, while `subjectMentionId` and `objectMentionId` retain exact character-span provenance.

---

## 10. Quantities & Cardinality

### Core Rule:
**Do not invent individual Entity identities for anonymous counts.**

When the user says:
> *"Saya punya 2 mesin kopi, 1 mesin roasting, 1 freezer, 2 refrigerator."*

### Pipeline Representation:
1. The system creates or resolves the category concept (e.g. `concept:coffee_machine`).
2. It generates a single Claim on the User:
   - `subjectEntityId`: `ent-user`
   - `predicate`: `owns_asset`
   - `objectValue`: `{ type: 'literal', value: 'coffee machine' }`
   - `qualifiers`: `{ quantity: 2, condition: 'exact' }`
3. It does **NOT** create:
   - `Coffee Machine #1`
   - `Coffee Machine #2`
4. If a future dump identifies a specific machine (*"Mesin kopi yang La Marzocco rusak"*), an explicit Entity is instantiated for `La Marzocco` with a claim qualifying its membership in the user's coffee machine inventory.

---

## 11. Temporal Semantics

Map of Chaos strictly separates **when an observation was made** from **the temporal period it refers to**:

### 1. `observationTime` (ISO-8601)
The timestamp when the dump was created or recorded (e.g. `2026-01-10T10:00:00Z`).

### 2. `temporalScope`
- `past`: Prior state, completed action, former association (*"dulu saya..."*, *"used to"*).
- `present`: Current active state at the time of observation (*"sekarang saya..."*, *"saat ini"*).
- `future`: Intended, planned, or prospective state (*"nantinya saya akan..."*, *"rencananya"*).
- `recurring`: Habitual or ongoing activity (*"setiap hari saya..."*, *"menerima pesanan"*).
- `timeless`: Conceptual, definitional, or mathematical truth (*"Nalakara adalah perseroan"*).

### Conflict Evaluation Matrix (`evaluateClaimConflict`):
- **Identical values & qualifiers**: Reinforcing evidence (`none`).
- **Different temporal scopes** (`past` vs `present`): `temporal_shift`.
- **Same temporal scope, DIFFERENT observation times**: `temporal_shift` (state evolution over time).
- **Same temporal scope, SAME observation time, incompatible values**: `direct_contradiction`.

---

## 12. References & Pronouns

### Rules for Reference Resolution:

1. **User Self-Anchoring ("Saya", "Aku", "Gue", "I", "Me")**:
   - Mapped directly to the singleton `User Context Entity` (`ent-user-self`).
   - The system must **never** create a separate Entity called *"Saya"*.
2. **Third-Person & Demonstrative Pronouns ("Dia", "Itu", "Akun tersebut", "Usaha saya yang lain")**:
   - If the antecedent entity is unambiguous within the current dump context (e.g. sentence 2 referring to the entity named in sentence 1), the mention links to that entity with a notation in resolution rationale (`"Resolved via intra-dump coreference"`).
   - If ambiguous or unresolved, the pipeline marks `outcome: 'ambiguous'` and routes to the human review queue.
   - **Zero Invention**: The system must never guess a referent across distant dumps without explicit corroborating signals.

---

## 13. Activities & Intentions

Human statements often describe explorations, intentions, or activities rather than permanent static entities.

### 1. Activity vs. Entity:
> *"Saya menerima pesanan blend kopi."*
- **Correct Representation**: Claim on `ent-user` $\rightarrow$ `predicate: 'accepts_orders'` $\rightarrow$ `objectValue: 'custom coffee blends'` $\rightarrow$ `temporalScope: 'recurring'`.
- **Forbidden**: Inventing an artificial `Order #1` Entity.

### 2. Present Activity vs. Future Intention:
> *"Saya membuat yoghurt untuk saya sendiri dan nantinya saya jual juga."*
- **Claim 1 (Current Activity)**:
  - `predicate`: `engages_in_activity`
  - `objectValue`: `making yoghurt`
  - `temporalScope`: `present`
  - `qualifiers`: `{ purpose: 'self_consumption' }`
- **Claim 2 (Future Intention)**:
  - `predicate`: `intends_activity`
  - `objectValue`: `selling yoghurt`
  - `temporalScope`: `future`
  - `qualifiers`: `{ modality: 'commercial_intention' }`
- **Forbidden**: Marking the user as actively running a commercial yoghurt business today.

### 3. Exploration vs. Commitment:
> *"Saya sedang research tentang membuat video YouTube faceless."*
- **Claim**:
  - `predicate`: `researches_topic`
  - `objectValue`: `faceless YouTube video production`
  - `temporalScope`: `present`
  - `qualifiers`: `{ modality: 'exploratory' }`
- **Forbidden**: Inferring that the user is a YouTuber or owns a channel.

---

## 14. Human-Stated vs. AI-Inferred

The system maintains two distinct processing tracks:

```text
┌──────────────────────────────────────┐     ┌──────────────────────────────────────┐
│ TRACK A: HUMAN-STATED EXTRACTION     │     │ TRACK B: AI-INFERRED HYPOTHESIS      │
├──────────────────────────────────────┤     ├──────────────────────────────────────┤
│ Source: Explicit text in Dump        │     │ Source: AI reflection / Wander echo  │
│ sourceOrigin: 'human_stated'         │     │ sourceOrigin: 'ai_inferred'          │
│ reviewState: 'extracted'             │     │ reviewState: 'needs_review'          │
│ Grounding: Character offset slice    │     │ Grounding: Inferred from Claims      │
│ Invariant: Cannot be hallucinated    │     │ Invariant: CANNOT alter human facts  │
└──────────────────────────────────────┘     └──────────────────────────────────────┘
```

An AI-inferred hypothesis can never overwrite, supersede, or dilute a human-stated assertion.

---

## 15. Reprocessing

When extraction algorithms or prompt models are improved, dumps can be reprocessed idempotently:

```typescript
export interface IReprocessingEngine {
  reprocessDump(dumpId: string, options?: { force?: boolean }): Promise<ReprocessingReport>;
}
```

### Invariants during Reprocessing:
1. **Raw Dumps are Immutable**: Raw text and timestamps are never modified.
2. **Human Confirmations are Locked**: Claims with `reviewState: 'human_confirmed'` or `'rejected'` are preserved untouched. New evidence spans are appended to `supportingEvidenceIds` via `reconcileClaimWithReprocessing`.
3. **Human Resolutions are Locked**: Mentions resolved by `createdBy: 'human_override'` are never overridden by machine reprocessing.
4. **Idempotency**: Running reprocessing multiple times on the same dump produces identical outputs without duplicate claims or entities.

---

## 16. Ambiguity & Failure Handling

When language is vague, ambiguous, or contradictory, Map of Chaos adheres to the principle:
> **"Preserve uncertainty rather than inventing certainty."**

### Failure Modes & Responses:
1. **Unclear Surface Form**:
   - If a word might be a brand or a common noun (*"borga"*), extract as candidate with `candidateTypeHint: 'unknown'` and confidence $< 0.7$.
2. **Ambiguous Referent**:
   - Multiple entities match (*"Freshbeda"* business vs *"freshbeda"* handle). Create resolution record with `outcome: 'ambiguous'`, list `candidateEntityIds`, and set `status: 'provisional'`.
3. **Malformed Syntax / Incomplete Sentence**:
   - Extract raw observation span in `ExtractionResult.rawObservations` without asserting speculative claims.
4. **Direct Contradiction in Same Observation**:
   - Retain both claims, set `conflictState: 'direct_contradiction'`, populate `conflictingClaimIds`, and surface in the Epistemic Review Queue.

---

## 17. Module Architecture

The Phase 2 implementation will reside entirely within [`src/pipeline/`](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/pipeline):

```text
src/
├── domain/                      # Phase 1 Domain Layer (Frozen)
├── storage/                     # Phase 1 Storage Layer (Frozen)
└── pipeline/                    # Phase 2 Semantic Pipeline
    ├── index.ts                 # Pipeline module exports
    ├── types.ts                 # Pipeline internal interfaces & options
    ├── extraction/
    │   ├── extractor.ts         # ISemanticExtractor interface & orchestrator
    │   ├── deterministic.ts     # Regex/heuristic extractor (offline baseline)
    │   ├── structuredLlm.ts     # Schema-constrained LLM extractor
    │   └── normalizer.ts        # Indonesian & English linguistic normalizer
    ├── resolution/
    │   ├── resolver.ts          # IEntityResolver interface & engine
    │   ├── candidateGen.ts      # Multi-index candidate retrieval
    │   ├── scorer.ts            # Multi-signal evidence scoring
    │   └── decisionGate.ts      # Authority matrix & human review router
    ├── accumulation/
    │   ├── accumulator.ts       # Context accumulation orchestrator
    │   └── conflictDetector.ts  # Contradiction & temporal evolution classifier
    └── reprocessing/
        └── reprocessor.ts       # Idempotent re-extraction & human lock reconciler
```

### Module Responsibilities:
- **`extraction/`**: Converts grounded dump text into validated mention and claim candidates. Zero authority to resolve entities.
- **`resolution/`**: Evaluates candidate entities against existing persistent memory. Strictly obeys non-merging authority rules.
- **`accumulation/`**: Bridges extraction and resolution to `ContextStore`, writing claims, reinforcing evidence, and annotating conflict states.
- **`reprocessing/`**: Manages pipeline re-execution while enforcing human lock invariants.

---

## 18. Technology Evaluation

| Strategy | Determinism | Offline Support | Linguistic Nuance (ID/EN) | Provenance Grounding | Latency / Cost | Assessment |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **Pure Heuristics / Regex** | 100% | Full (Local) | Poor (Brittle on colloquial text) | High | Zero cost, <10ms | Insufficient on its own for complex natural language. |
| **Direct Cloud LLM** | Non-deterministic | None (Online only) | Excellent | Risk of offset drift | Variable latency, API key required | Cannot guarantee character offset grounding without validation. |
| **Hybrid Verified Pipeline (RECOMMENDED)** | High (Deterministic Gate) | Graceful local fallback | Excellent (via LLM) + Robust fallback | 100% Guaranteed by Invariant Gate | Optimal balance | **Selected Strategy** |

### Selected Architecture: Hybrid Verified Pipeline
1. **Primary Extractor**: Structured JSON LLM extraction (using existing API key infrastructure or local WebWorker/Wasm model where available).
2. **Invariant Verification Gate**: Every extracted span is verified against raw text using `isEvidenceGroundedInDump`. Any hallucinated span is discarded.
3. **Deterministic Fallback**: If offline or no API key is provided, the deterministic rule extractor processes handles, numbers, and basic patterns without crashing.

---

## 19. Acceptance Test Matrix

| # | Test Scenario | Input Text | Expected Entities | Expected Mentions | Expected Claims | Expected Outcome | Review State | Forbidden Behavior |
| :- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **Instagram Multi-Account** | *"Saya punya 5 akun Instagram: freshbeda, yudhan.sebastian, nalakara.id, rampainusa, matatua."* | 5 handle entities | 5 handle mentions | User owns 5 accounts (`qty: 5`); 5 individual account claims | `associated_handle` | `extracted` | Do NOT invent account numbers (#1, #2). |
| 2 | **Nalakara Business** | *"Nalakara adalah salah satu lini usaha saya, bergerak di bidang teknologi dan AI."* | `Nalakara` | `Nalakara` | User operates Nalakara (`partitivity: one_of_several`); Nalakara in tech; Nalakara in AI | `new_entity` / `matched` | `extracted` | Do NOT flatten partitivity into identity. |
| 3 | **Freshbeda Business** | *"Freshbeda adalah lini usaha saya yang berhubungan dengan visual design."* | `Freshbeda` | `Freshbeda` | User operates Freshbeda; Freshbeda relates to visual design | `new_entity` | `extracted` | Do NOT merge with `freshbeda` handle. |
| 4 | **Handle-to-Business Link** | *"nalakara.id adalah akun Instagram untuk Nalakara."* | `nalakara.id`, `Nalakara` | `nalakara.id`, `Nalakara` | `Nalakara` `has_social_account` `nalakara.id` | `matched_existing` | `extracted` | Do NOT lose dual-sided mention provenance. |
| 5 | **Cross-Dump Entity Reference** | Dump 1: *"Nalakara di Bali."* Dump 2: *"Nalakara menambah tim AI."* | `Nalakara` (single entity) | 2 mentions | 2 claims on same entity | `matched_existing` | `extracted` | Do NOT create duplicate `Nalakara` entity. |
| 6 | **Lexical Overlap Non-Merge** | Dump 1: *"freshbeda"* handle. Dump 2: *"Freshbeda"* company. | 2 distinct entities | 2 mentions | Independent claims | `new_entity` | `extracted` | Do NOT auto-merge on name similarity. |
| 7 | **Ambiguous Entity** | *"Saya bertemu dengan Alex kemarin."* (Multiple Alexes exist) | `Alex` | `Alex` | User met Alex | `ambiguous` | `needs_review` | Do NOT guess which Alex without evidence. |
| 8 | **Quantity / Cardinality** | *"Saya punya 2 mesin kopi, 1 mesin roasting."* | Concept entities | 2 mentions | User owns coffee machine (`qty: 2`); roasting machine (`qty: 1`) | Concept match | `extracted` | Do NOT create `Coffee Machine #1`, `#2`. |
| 9 | **Current Activity** | *"Saya menerima pesanan blend kopi."* | `ent-user` | Pesanan blend | User accepts orders (`recurring`) | N/A (Claim) | `extracted` | Do NOT create `Order #1` entity. |
| 10 | **Future Intention** | *"Saya membuat yoghurt dan nantinya saya jual."* | `ent-user`, Yoghurt | Yoghurt | Activity: making (`present`); Intention: selling (`future`) | N/A (Claim) | `extracted` | Do NOT claim user sells yoghurt today. |
| 11 | **Exploratory Activity** | *"Saya sedang research membuat video YouTube faceless."* | `ent-user` | YouTube faceless | User researches topic (`exploratory`) | N/A (Claim) | `extracted` | Do NOT infer user is a YouTuber. |
| 12 | **Temporal State Evolution** | T1: *"Saya punya 2 mesin."* T2: *"Saya punya 3 mesin."* | `ent-user` | Mesin | State evolved from 2 to 3 | `temporal_shift` | `extracted` | Do NOT flag as direct contradiction. |
| 13 | **Direct Contradiction** | Same T1: *"HQ di Oslo."* and *"HQ di Bergen."* | `Nalakara` | Oslo, Bergen | Conflicting HQ locations | `direct_contradiction` | `needs_review` | Do NOT silently drop either location. |
| 14 | **Pronoun Resolution** | *"Saya memulai proyek baru. Proyek ini dinamai Karsa."* | `Karsa` | Saya, proyek ini, Karsa | User started Karsa | `matched_existing` | `extracted` | Do NOT create entity named *"Saya"*. |
| 15 | **Human Override** | User overrides machine resolution of `Borga`. | `Borga Cafe` | Borga | Rebound claim with audit trail | `human_override` | `human_confirmed` | Machine must not overwrite human decision. |
| 16 | **Reprocessing Idempotency** | Reprocess Dump A twice. | Same entities | Same mentions | Same claims; reinforced evidence | Stable | Unchanged | Do NOT duplicate claims or entities. |
| 17 | **AI Inferred vs. Human Fact** | AI infers *"Nalakara mungkin buka cabang."* | `Nalakara` | N/A | Inferred claim (`sourceOrigin: ai_inferred`) | N/A | `needs_review` | Do NOT mark as `human_stated`. |
| 18 | **Unsupported Inference** | User mentions meeting a friend; AI guesses romance. | N/A | Friend | Meeting claim only | N/A | N/A | Hallucinated relationship rejected. |

---

## 20. Phase 2 Scope Boundary

### Strict Inclusions (Phase 2 WILL Implement):
- `src/pipeline/extraction/` (Deterministic & Structured LLM extractors)
- `src/pipeline/resolution/` (Candidate generator, multi-signal scorer, decision gate)
- `src/pipeline/accumulation/` (Additive context ingestion, conflict detection)
- `src/pipeline/reprocessing/` (Reprocessing orchestrator with human lock reconciliation)
- Comprehensive test suite matching the Acceptance Test Matrix

### Strict Exclusions (Phase 2 WILL NOT Implement):
- **Graph Canvas UI**: No modifications to `MapCanvas.tsx`, D3 force simulations, or node rendering.
- **Wander Redesign**: No modification of wander prompts or UI reflection components.
- **Legacy Storage Migration**: No automatic migration of legacy `localStorage` data into IndexedDB.
- **External Vector DB / Embeddings**: No Mem0, Qdrant, Pinecone, or heavy vector infrastructure.
- **React UI Hooks**: UI integration remains scheduled for Phase 3.

---

## 21. Open Architectural Decisions

1. **LLM Provider Abstraction**:
   - The extractor will use an abstract `ILLMClient` interface (`complete(prompt, schema)`). The existing prototype Google GenAI / Gemini client in `src/services/aiService.ts` can be adapted behind this interface without pulling new external dependencies.
2. **User Identity Singleton**:
   - The user's self-entity (`ent-user-self`) will be seeded in `ContextStore` on database initialization with canonical name `"User"`, ensuring personal pronouns ("saya", "me") always anchor to a stable identity.

---

## 22. Risks & Mitigations

1. **Risk: Offset Drift in LLM Extractions**:
   - *Mitigation*: The `InvariantGate` re-slices `dump.rawText.slice(startOffset, endOffset)`. If it doesn't match `textSpan`, a fuzzy substring search locates the exact character offsets in the raw dump. If not found, the candidate is discarded.
2. **Risk: Over-eager Entity Merging**:
   - *Mitigation*: Hardcoded invariant `canAutoMergeEntities` returns `false` on lexical similarity alone. Ambiguous candidates are routed to the review queue.
3. **Risk: Performance on Bulk Dumps**:
   - *Mitigation*: Single dumps are processed asynchronously with lightweight in-memory candidate indices before committing to IndexedDB via atomic transactions.

---

## 23. Implementation Sequence

When Phase 2 execution begins, it will proceed in 4 strictly ordered steps:
1. **Step 2.1 — Pipeline Contracts & Interfaces**: Define `src/pipeline/types.ts` and core interfaces.
2. **Step 2.2 — Semantic Extraction Subsystem**: Implement `ISemanticExtractor`, linguistic normalizer, and invariant grounding gate with unit tests.
3. **Step 2.3 — Entity Resolution Subsystem**: Implement candidate generator, multi-signal scorer, decision gate, and audit logging with unit tests.
4. **Step 2.4 — Accumulation, Reprocessing & Pipeline Integration**: Connect extraction and resolution to `ContextStore`, execute the complete 18-case acceptance test suite, and verify regression stability.

---

## 24. Self-Audit

- **Preserves Phase 1 Invariants?**: **YES.** Zero mutations to Phase 1 domain types or storage logic; relies on `ContextStore` and `IStorageDriver` transactions.
- **Preserves Provenance?**: **YES.** Every claim and mention traces back to character offsets in raw dumps via `isEvidenceGroundedInDump`.
- **Preserves Human Decision Precedence?**: **YES.** Human confirmed/rejected claims and human overrides are locked against machine reprocessing.
- **Prevents Lexical Auto-Merging?**: **YES.** Enforced by authority matrix and `canAutoMergeEntities`.
- **Supports Multi-Entity / Multi-Claim Dumps?**: **YES.** Designed specifically for $1 \text{ Dump} \rightarrow N \text{ Entities}, M \text{ Claims}$.
- **Supports Context Accumulation?**: **YES.** Claims accumulate additively with qualifier-safe evidence reinforcement.
- **Preserves Uncertainty?**: **YES.** Unresolved references and ambiguous candidates route to `ambiguous` resolution states and the review queue.
- **Avoids Turning Inference into Fact?**: **YES.** Epistemic origin `sourceOrigin: 'ai_inferred'` is segregated from `human_stated`.
- **Downstream Graph Boundary Maintained?**: **YES.** Canvas projections remain downstream view models.

---

## Design Readiness Verdict

**READY FOR IMPLEMENTATION**

Phase 2 design is complete, internally consistent with all frozen contracts, fully aligned with the Phase 1 domain and storage foundation, and ready for code execution upon user approval.
