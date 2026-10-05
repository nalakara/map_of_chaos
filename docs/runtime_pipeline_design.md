# Runtime Pipeline Design

Status: Draft — implementation design
Purpose: Define how Map of Chaos moves from raw human input to accumulated semantic context and UI projection.

This document is technology-neutral. It does not select an LLM, embedding model, vector database, persistence technology, or external AI service.

---

## 1. Core Principle

Map of Chaos must accumulate context, not merely accumulate nodes.

The semantic model is the source of truth.

Map, Thing, Graph, and Wander are projections or retrieval interfaces over accumulated context. They are not the semantic source of truth.

The primary conceptual flow is:

Dump
→ Evidence
→ Semantic Extraction
→ Entity Resolution
→ Context Accumulation
→ Inference
→ Projection / Retrieval

---

## 2. Pipeline Stages

### 2.1 Capture

The system immediately persists the original human input as an immutable Dump.

Capture must not depend on successful AI processing.

Minimum conceptual record:

- dump_id
- raw_text
- created_at
- source
- processing status

Invariants:

- raw_text is never overwritten by interpretation.
- A failed semantic processor must not cause loss of the Dump.
- The user must be able to continue capturing Dumps even if semantic processing is delayed or unavailable.

For V0, processing may be implemented synchronously for simplicity, provided that Capture is architecturally independent from successful AI processing.

---

### 2.2 Evidence

The original Dump is the authoritative human evidence.

Semantic results must retain provenance back to the Dump and, where applicable, to an exact evidence span within the original text.

Evidence should be treated as append-only.

An interpretation must never overwrite or replace the original human wording.

Conceptually:

Dump
→ Evidence
→ semantic result

not:

Dump
→ AI summary
→ replacement of Dump

---

### 2.3 Semantic Extraction

Extraction answers:

> What is explicitly supported by this Dump?

Extraction may produce:

- Entity Mentions
- Claims
- explicit inter-entity relationships
- quantities and counts
- temporal information
- qualifiers
- references and pronouns
- negation
- explicit uncertainty
- exact evidence spans

One Dump may produce multiple Mentions and multiple Claims.

Multiple Dumps may later contribute information to the same Entity.

Extraction does not determine whether a Mention refers to an existing Entity.

Extraction must preserve qualifiers such as:

- quantity
- purpose
- partitivity
- conditionality
- temporal scope
- degree
- explicit uncertainty

Examples:

> "Saya membuat yoghurt untuk saya sendiri dan nantinya saya jual juga."

must preserve the distinction between:

- current self-consumption activity
- future intention to sell

It must not turn future intention into a current fact.

Example:

> "Saya punya 2 mesin kopi, 1 mesin roasting, 1 freezer, 2 refrigerator."

must preserve quantities without inventing individual identities such as:

- Coffee Machine #1
- Coffee Machine #2

unless the human evidence distinguishes them.

---

### 2.4 Entity Resolution

Entity Resolution determines whether an Entity Mention refers to an existing persistent Entity.

Formal outcomes:

- `matched_existing`
- `new_entity`
- `ambiguous`
- `associated_handle`

Candidate generation and resolution are separate operations.

Candidate generation may use:

- lexical similarity
- identifiers
- contextual similarity
- semantic retrieval
- other retrieval mechanisms

However:

> Candidate generation is not resolution.

Lexical/string similarity has zero authority to automatically merge Entities.

Resolution must be based on available evidence.

Resolution decisions must preserve:

- candidate(s)
- supporting evidence
- resolution state
- reason/provenance
- relevant context

Resolution is derived state and may change when new evidence arrives.

The evidence itself must not be destroyed or overwritten.

Example:

`Freshbeda` as a business Entity and `freshbeda` as an Instagram account must not automatically be treated as the same Entity merely because their names match.

If evidence later states:

> "Akun Instagram freshbeda itu saya gunakan untuk brand Freshbeda."

the system may establish an explicit association.

---

### 2.5 Context Accumulation

Context accumulation is the central semantic operation of Map of Chaos.

The system must accumulate context rather than repeatedly replacing Entity records.

An Entity should not depend on a single mutable description as its semantic memory.

Instead:

Entity
→ Claims
→ Evidence

Example:

Entity: Nalakara

Claims:

- User operates Nalakara.
- Nalakara is a business line.
- Nalakara operates in technology.
- Nalakara operates in AI.
- Nalakara has social account nalakara.id.

Each Claim must remain traceable to supporting Evidence.

New Dumps may:

- add Claims
- add supporting Evidence to existing Claims
- enrich existing Entities
- establish relationships
- introduce temporal changes
- introduce qualifiers
- expose contradictions
- resolve previously ambiguous mentions

Context accumulation is additive rather than destructive.

A newer Claim must not silently delete older evidence.

---

### 2.6 Claim Accumulation and Duplicate Claims

Multiple Dumps may express semantically equivalent Claims.

Example:

Dump A:

> "Saya punya akun Instagram nalakara.id."

Dump B:

> "Instagram saya untuk Nalakara adalah nalakara.id."

These may represent the same semantic Claim:

User / Nalakara
→ has_social_account
→ nalakara.id

The second Dump must not be discarded.

Instead, the semantic Claim may have multiple supporting Evidence records.

Conceptually:

Claim
├── Evidence from Dump A
└── Evidence from Dump B

Therefore:

> Evidence is append-only; semantic Claims may accumulate supporting Evidence.

The implementation must avoid uncontrolled duplicate semantic Claims while preserving all underlying evidence.

---

### 2.7 Contradiction and Temporal Context

Contradictory Claims must not automatically be treated as errors.

A contradiction may represent a change over time.

Example:

1. "Saya punya 2 mesin kopi."
2. "Saya sudah menjual satu mesin kopi."
3. "Sekarang saya punya 1 mesin kopi."

These statements can all be valid within different temporal scopes.

Therefore:

- Claims retain temporal scope.
- Historical Claims remain preserved.
- Current context may be derived from temporal validity.
- Older Claims must not be deleted simply because they are no longer current.

If two human Claims appear to conflict within the same temporal scope, the conflict should remain unresolved until additional evidence clarifies it.

The system must not silently choose one Claim merely because it was processed later.

---

### 2.8 Inference

Inference operates downstream from accumulated evidence-backed context.

AI may generate derived Claims or hypotheses.

AI-generated information must remain distinguishable from human-supported information.

AI inference must:

- retain provenance to the source Claims/Evidence
- retain epistemic status
- never silently promote an inference to human-confirmed fact
- be rebuildable when inference logic changes

Conceptually:

Human Evidence
→ Human-supported Claim
→ AI Inference

not:

Human Evidence
→ AI interpretation
→ Fact

AI inference may enrich the user's context, but it does not rewrite the underlying evidence.

---

### 2.9 Projection

Projection converts accumulated semantic context into interface representations.

Not every Entity must become a canvas node.

Not every Claim must become a graph edge.

Projection may determine:

- canvas nodes
- visible relationships
- drawer/context information
- labels
- summaries
- graph positioning
- other presentation state

Projection is derived and rebuildable.

Graph topology must not become the semantic source of truth.

The Map is therefore a projection of accumulated context, not the database of truth itself.

---

## 3. Persistence Boundaries

Conceptually separate the following layers.

### Primary / Immutable

- Dump
- original human input
- Evidence

### Semantic / Accumulated

- Entity
- Entity Mention
- Claim
- Entity Resolution
- temporal scope
- qualifiers
- contradiction state
- provenance

### Derived / Rebuildable

- AI Inference
- Thing projection
- Graph projection
- summaries
- search indexes
- retrieval indexes

The exact database/storage implementation is intentionally unspecified.

---

## 4. Processing Model

The user-facing capture operation should be immediate.

Conceptually:

User
→ Capture Dump
→ "saved"

Semantic processing may happen afterward:

Dump
→ Extraction
→ Resolution
→ Context Update
→ Inference
→ Projection

For V0, these stages may execute synchronously if this simplifies implementation.

However, the architecture must not require synchronous AI completion for successful Capture.

Conceptual processing events:

- `DumpCaptured`
- `ExtractionCompleted`
- `ResolutionCompleted`
- `ContextUpdated`
- `InferenceGenerated`
- `ProjectionUpdated`

These are conceptual lifecycle boundaries.

V0 does not require an event bus.

---

## 5. Reprocessing

A Dump must be reprocessable with a newer extraction or inference implementation without losing the original evidence.

Examples:

- improved extraction rules
- improved Entity Resolution
- different AI model
- changed inference logic

Reprocessing must not:

- overwrite original Dump text
- destroy existing provenance
- create uncontrolled duplicate Entities
- create uncontrolled duplicate semantic Claims

Derived results should remain traceable to:

- source Dump
- processing version
- evidence span
- processing timestamp

Derived projections and indexes should be rebuildable from semantic context.

---

## 6. Canonical Context Accumulation Test

The following sequence is a required semantic test.

### Dump 1

> Saya punya 5 akun Instagram: freshbeda, yudhan.sebastian, nalakara.id, rampainusa, matatua.

Expected semantic behavior:

- identify five Instagram account mentions
- preserve quantity = 5
- establish Claims connecting the user to each account
- preserve the original account identifiers exactly
- do not create arbitrary individual account identities beyond what the evidence supports

### Dump 2

> Nalakara adalah salah satu lini usaha saya, bergerak di bidang teknologi dan AI.

Expected:

- resolve/create Entity `Nalakara`
- establish that Nalakara is a business line
- establish technology context
- establish AI context
- preserve partitivity: Nalakara is one of the user's business lines
- preserve present/ongoing temporal scope

### Dump 3

> Freshbeda adalah lini usaha saya yang berhubungan dengan visual design.

Expected:

- resolve/create Entity `Freshbeda`
- establish that Freshbeda is a business line
- establish visual design context

Important:

The existing Instagram account mention `freshbeda` must NOT automatically be merged with the business Entity `Freshbeda` solely because the strings match.

### Dump 4

> nalakara.id adalah akun Instagram untuk Nalakara.

Expected:

- establish `nalakara.id` as an Instagram account
- establish explicit association between `nalakara.id` and `Nalakara`
- preserve the relationship as evidence-backed semantic context

---

## 7. Canonical Inventory Test

Input:

> Saya punya 2 mesin kopi, 1 mesin roasting, 1 freezer, 2 refrigerator.

Expected:

- preserve quantities
- represent inventory categories appropriately
- do not invent individual machine identities
- do not force every quantity into separate graph nodes

---

## 8. Canonical Activity and Intention Tests

### Activity

> Saya menerima pesanan blend kopi.

Expected:

- establish a current/ongoing activity or Claim that the user receives coffee-blend orders
- do not invent a specific order Entity unless the user provides one

### Current activity + future intention

> Saya membuat yoghurt untuk saya sendiri dan nantinya saya jual juga.

Expected:

- establish current yoghurt-making activity
- preserve purpose = self-consumption
- establish future intention to sell
- do not represent future intention as a current commercial fact

### Exploratory activity

> Saya sedang research tentang membuat video YouTube faceless.

Expected:

- establish current research/exploration activity
- preserve exploratory status
- do not infer that the user is already a YouTuber
- do not infer that a YouTube channel exists
- do not infer a future commitment beyond the evidence

---

## 9. Architectural Invariants

1. Capture must never depend on AI success.
2. Original human input is immutable.
3. Evidence is never destroyed by later interpretation.
4. Extraction does not perform Entity Resolution.
5. Lexical similarity does not authorize automatic Entity merge.
6. Entity Resolution is revisable when new evidence arrives.
7. Context accumulation is additive rather than destructive.
8. Contradictory human evidence is preserved.
9. AI inference is never silently promoted to human-confirmed fact.
10. Graph and Thing projection are derived from semantic context.
11. Projection must never become the semantic source of truth.
12. Reprocessing must preserve provenance.
13. Reprocessing must avoid uncontrolled duplication.
14. Quantities do not automatically imply individually identified Entities.
15. Temporal qualifiers must be preserved when they materially change meaning.
16. Future intention must not be represented as current fact.
17. Exploratory activity must not automatically become a committed project or identity.
18. Explicit human relationships take precedence over weak inferred similarity.
19. New context enriches existing Entities when evidence supports the same identity.
20. Unresolved ambiguity is a valid semantic state and must not be forcibly resolved.

---

## 10. Explicit Non-Goals

This document does not decide:

- which LLM is used
- whether embeddings are used
- whether Qdrant, Mem0, or another retrieval system is used
- exact database schema
- exact canvas projection thresholds
- final treatment of generic concepts versus persistent Entities
- automatic versus supervised confirmation UX
- final Wander retrieval architecture
- final UI representation of contradictions

Those decisions should follow the semantic model rather than define it.

---

## 11. Design Principle

The fundamental transformation is:

Dump → Thing → Graph

must become:

Dump → Evidence → Semantic Context → Projection

The Map is not the memory.

The Graph is not the memory.

The AI summary is not the memory.

The accumulated, provenance-backed semantic context is the memory.