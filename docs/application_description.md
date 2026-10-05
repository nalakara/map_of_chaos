# Map of Chaos — Complete Application Description

## 1. Overview

Map of Chaos (MOC) is a personal knowledge-capture and context-mapping Progressive Web Application (PWA) designed to accept unstructured thoughts, observations, ideas, activities, references, and other fragments without requiring the user to organize, tag, or classify them beforehand.

### Core Premise
> "The user should be able to dump information first. Map of Chaos should gradually discover what that information is about, recognize when new information refers to something that already exists, accumulate context around persistent entities, and make the resulting context visible as a map."

Traditional personal knowledge management systems impose immediate cognitive overhead: creating folders, choosing categories, tagging hierarchies, or connecting nodes manually before an idea is even captured. Map of Chaos removes this friction entirely. It accepts raw, unorganized human dumps and progressively derives an evidence-grounded semantic context.

Crucially, MOC favors **useful semantic continuity over maximum automation**. It does not guess wildly or synthesize false connections. It treats the user's raw statement as foundational ground truth, maintains strict conservative boundaries around identity, and projects accumulated context onto a spatial canvas.

---

## 2. Product Purpose

Human thought is fragmented, nonlinear, and continuous. A person does not experience ideas as normalized database records; they experience a flow of fleeting thoughts: an Instagram handle created, a business line initiated, a coffee roast recipe adjusted, an intention stated for the future, or an observation noted in passing.

Individually, these fragments appear disconnected. But useful structure inevitably emerges when those fragments are accumulated and understood together over time.

### Intended Capabilities
- **Low-Friction Capture**: Dump thoughts in seconds without forms, required fields, or forced classification.
- **Preservation of Original Wording**: The exact raw text span is preserved forever as immutable evidence.
- **Entity Identification**: Surface semantic mentions in text and recognize candidate identity representations.
- **Entity Resolution**: Distinguish new entities from existing ones without collapsing distinct entities merely because their names look alike.
- **Context Accumulation**: Attach new claims, attributes, and associations to existing entities over multiple distinct dumps.
- **Epistemic Distinction**: Rigorously separate human-stated facts from machine-inferred suggestions.
- **Preservation of Uncertainty**: Represent tentative, unverified, or ambiguous knowledge without prematurely forcing binary certainty.
- **Claim & Relationship Grounding**: Model facts as qualified claims linked directly to text evidence spans.
- **Semantic Visualization**: Project persistent entities and verified relational claims onto an interactive spatial map.
- **Exploration**: Provide spatial and reflective surfaces (Map, Inbox, Wander) to inspect and wander through accumulated context.

---

## 3. Core Interaction Model

The primary and authoritative human interaction with Map of Chaos is **Dump**.

The user writes naturally in their own language and terminology. For example:
- *"Saya punya 5 akun Instagram: freshbeda, yudhan.sebastian, nalakara.id, rampainusa, matatua."*
- *"Nalakara adalah salah satu lini usaha saya, yang bergerak dalam bidang technologi dan kecerdasan buatan."*
- *"Freshbeda adalah lini usaha lain yang berhubungan dengan visual design."*
- *"nalakara.id adalah akun Instagram untuk Nalakara."*

The user is never forced to declare upfront whether something is a project, a company, a person, or an account. The runtime pipeline takes this raw evidence and moves it sequentially through semantic processing:

```
RAW DUMP
   │
   ▼
SEMANTIC EXTRACTION
   │
   ▼
ENTITY RESOLUTION
   │
   ▼
CONTEXT ACCUMULATION
   │
   ▼
CLAIMS / RELATIONSHIPS
   │
   ▼
PROJECTION
   │
   ▼
MAP
```

---

## 4. Current Application Architecture

The application pipeline is strictly sequential, local-first, and event-free:

```
┌────────────────────────────────────────────────────────────────────────┐
│ 1. Raw Input                                                           │
│    Immutable human dump text captured with timestamp and source.       │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 2. Evidence Grounding                                                  │
│    Character-exact byte offsets (startOffset, endOffset, textSpan).     │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 3. Semantic Extraction Core                                            │
│    Discovers Mentions and raw candidate Claims grounded in evidence.   │
│    Answers: "What things and statements are present in this text?"     │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 4. Entity Resolution Gate                                              │
│    Evaluates candidate matches against persistent ContextStore.        │
│    Answers: "Does this mention refer to an entity that already exists?" │
│    Enforces: Similarity is NOT authoritative for identity.             │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 5. Context Accumulator                                                 │
│    Mints new entities, updates associated handles, binds subject/object│
│    claims to resolved entities, and maintains idempotent audit logs.   │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 6. Context Store                                                       │
│    Central semantic memory holding persistent Entities and Claims.     │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 7. Context Projector                                                   │
│    Deterministic transformation:                                       │
│    - Entity ────────► ThingProjection                                  │
│    - Relational Claim (with resolved endpoints) ──► EdgeProjection     │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 8. MapCanvas                                                           │
│    D3 force simulation rendering projected nodes and verified edges.   │
└────────────────────────────────────────────────────────────────────────┘
```

### Extraction vs. Resolution Distinction
- **Extraction** (`src/pipeline/extraction/`): Asks *"What mentions and propositional claims exist within this single evidence span?"* It parses surface forms, candidate type hints, quantities, temporal modifiers, and predicates without deciding persistent identity.
- **Resolution** (`src/pipeline/resolution/`): Asks *"Does this surface mention refer to a known persistent Entity in storage, should it mint a new Entity, or is it an ambiguous reference requiring human review?"*

### Similarity Is Not Identity
A core invariant of the architecture is that lexical or string similarity **never** authorizes an automatic entity merge. If an existing company entity is named `Freshbeda`, and a mention arrives for a social handle `freshbeda`, lexical matching generates a candidate, but type compatibility and semantic constraints reject an automatic collapse. They remain separate persistent entities until explicit evidence declares an association.

---

## 5. Current UI

The user interface is built as a single-screen desktop/mobile Progressive Web App with dedicated interaction views:

1. **Map (Primary View)**:
   - Interactive spatial canvas powered by `d3-force` simulation.
   - Renders projected **Things** (graph nodes) with organic repulsion, degree-based radii, uncertainty badges, and root origin anchoring.
   - Renders projected **Edges** (links) strictly derived from verified relational claims (solid lines for confirmed, dashed for provisional).
   - Allows zooming, panning, and direct node dragging (preserving spatial coordinates across re-projections).

2. **Dump Capture Dock (Persistent Floating Bar)**:
   - Positioned prominently at the bottom of the Map view.
   - Provides a clean, distraction-free multiline input area.
   - Submitting triggers the immediate pipeline: extraction → resolution → storage accumulation → projection update on the map.

3. **Inbox View**:
   - Lists entities and items that are pending review, unverified, or ambiguous.
   - Provides a focused workflow for epistemic clarification without cluttering the spatial canvas.

4. **Wander View**:
   - An unstructured reflection space where the user can free-write spontaneous thoughts.
   - Surfaces keyword echoes from existing Things to prompt associative memory without altering graph topology.

5. **Erased View**:
   - Reversible removal shelf for Things marked `status: 'erased'`.
   - Allows soft-deleted entities to be restored to active map projection or permanently removed.

6. **Thing Detail Drawer**:
   - Slide-out inspection panel triggered upon selecting any node on the canvas.
   - Displays the entity's canonical title, types, uncertainty state, original dump text, AI summary/context questions, connected relational claims, and options to confirm or erase.

---

## 6. Data and Persistence

### Semantic Storage Layer
Map of Chaos implements an explicit repository architecture (`src/storage/`) managed by a unified `ContextStore` facade over the universal `IStorageDriver` interface (supporting native browser IndexedDB and in-memory test drivers):

| Store Name | Primary Entity / Record | Purpose |
| :--- | :--- | :--- |
| `dumps` | `Dump` | Raw captured human input with timestamp and status. |
| `evidence` | `Evidence` | Character-exact text spans grounding mentions and claims. |
| `mentions` | `Mention` | Extracted surface forms with candidate type hints and offsets. |
| `entities` | `Entity` | Persistent semantic identities (`canonicalName`, `aliases`, `associatedHandles`). |
| `claims` | `Claim` | Atomic semantic assertions with subject entity ID, predicate, object value, qualifiers, and temporal scope. |
| `entity_resolutions` | `EntityResolution` | Machine and human resolution decisions with audit provenance and supersession tracking. |
| `human_overrides` | `HumanOverride` | Immutable audit records of human user decisions overriding machine resolutions. |
| `claim_audits` | `ClaimBindingAudit` | History of subject- and object-side entity rebinding events. |
| `projection_cache` | `ProjectionCache` | Cached projected view models for responsive map rendering. |

### Transmit & Legacy Transition
The application is currently transitioning from prototype localStorage keys (`map_of_chaos_things_v1`, `map_of_chaos_dumps_v1`) to the robust IndexedDB ContextStore. In Phase 3, active dump capture feeds the semantic pipeline directly into IndexedDB, and the resulting projection hydrates the UI state.

---

## 7. Important Semantic Rules

The runtime and domain models enforce ten strict semantic invariants:

1. **Raw Input Is Preserved Forever**: The user's exact words are never edited, overwritten, or summarized away. All extracted knowledge links back to this immutable evidence.
2. **Extraction Is Not Interpretation**: Extractors capture only what the text explicitly states. They do not guess unstated intentions, manufacture unmentioned entities, or infer hierarchical taxonomies.
3. **Similarity Is Not Identity**: Identical or similar strings are never merged into a single entity without explicit evidence or type compatibility authorization.
4. **Entities Persist Across Dumps**: When explicit or strong evidence resolves a mention to an existing entity, new claims accumulate onto that entity rather than spawning duplicate nodes.
5. **Quantities Are Not Individual Entities**: Statements like *"I have 5 accounts"* produce an inventory claim with qualifier `quantity: 5`, not five empty ghost entities.
6. **Activities Are Not Object Identities**: Statements like *"I receive orders"* produce activity claims on the user, not artificial `Order` or `OrderManager` entity nodes.
7. **Intentions Have Temporal Meaning**: Future intentions (*"eventually I will sell yoghurt"*) are scoped temporally to `'future'` and must not pollute present commercial status.
8. **Pronouns Resolve to User Context**: First-person references (*"saya"*, *"aku"*, *"me"*) anchor to the singleton `USER_SELF_ENTITY_ID` (`'ent-user-self'`).
9. **Ambiguity Can Survive**: When evidence is insufficient to distinguish between multiple candidates, the system marks the resolution `'ambiguous'` rather than guessing. Ambiguity is a valid, persistent state.
10. **Human Decisions Have Absolute Authority**: When a user overrides an entity resolution or claim review, that human decision is permanently locked. Subsequent machine reprocessing will never overwrite or supersede human decisions.

---

## 8. Canonical Example

The canonical four-dump benchmark demonstrates context accumulation and conservative identity preservation:

### DUMP A
> *"Saya punya 5 akun Instagram: freshbeda, yudhan.sebastian, nalakara.id, rampainusa, matatua."*

- **Extracted**: 5 social handle mentions and 1 user self reference.
- **Resolved**: Mints 5 distinct social handle entities (`ent-freshbeda-social_handle`, `ent-nalakara.id-social_handle`, etc.) and anchors user self to `ent-user-self`.
- **Accumulated**: 5 relational claims (`User Self` ── `owns_social_account` ──► handle entities) plus 1 aggregate quantity claim (`quantity: 5`).
- **Projected**: 6 map nodes (User origin + 5 handle nodes) with 5 solid edges originating from User Self.

### DUMP B
> *"Nalakara adalah salah satu lini usaha saya, bergerak dalam bidang teknologi dan kecerdasan buatan."*

- **Extracted**: Company mention `Nalakara`, sector tokens `teknologi` and `kecerdasan buatan`.
- **Resolved**: Mints new persistent business entity `Nalakara` (`typeHint: 'company'`).
- **Accumulated**: Business line claims and domain sector claims attached to `Nalakara`.
- **Projected**: `Nalakara` appears as a distinct company node on the canvas.

### DUMP C
> *"Freshbeda adalah lini usaha lain yang berhubungan dengan visual design."*

- **Extracted**: Company mention `Freshbeda`, domain focus `visual design`.
- **Resolved**: Mints new persistent business entity `Freshbeda` (`typeHint: 'company'`).
- **Critical Distinction**: Even though lowercase `freshbeda` matches the social handle from Dump A, type incompatibility (company vs. handle) and the absence of relational evidence **strictly prohibits merging**. Both exist as separate entities:
  - `Freshbeda` (business entity)
  - `freshbeda` (social handle entity)
- **Projected**: Two distinct nodes exist on the map with **zero connecting edges**.

### DUMP D
> *"nalakara.id adalah akun Instagram untuk Nalakara."*

- **Extracted**: Explicit relational declaration linking handle `nalakara.id` to company `Nalakara`.
- **Resolved**: `Nalakara` matches existing company entity; `nalakara.id` resolves as `associated_handle`.
- **Accumulated**: Relational claim: `Nalakara` ── `has_social_account` ──► `nalakara.id`.
- **Projected**: An explicit visual edge appears between `Nalakara` and `nalakara.id`.

**Key Takeaway**: Context accumulated seamlessly across four distinct dumps while identity remained completely conservative.

---

## 9. Current Development State

As of the completion of Phase 3, the project development status is:

- **Phase 1 — Semantic Domain and Storage**: **COMPLETED**
  - Fully typed domain schema (`Entity`, `Claim`, `Mention`, `Evidence`, `Resolution`).
  - IndexedDB storage driver with multi-store transactional boundaries.
  - Qualifier-safe claim deduplication and entity rebinding state machines.
- **Phase 2.1 — Semantic Extraction Core**: **COMPLETED**
  - Deterministic/offline extraction engine with character-exact evidence spans.
  - Local clause scoping for modality and temporal validity.
- **Phase 2.2 — Entity Resolution**: **COMPLETED**
  - Candidate generator and decision gate implementing 6 resolution outcomes.
  - Reverse-order handle separation and intra-batch type compatibility.
  - Idempotent resolution processing preserving human override authority.
- **Phase 3 — Semantic Projection into the Map**: **COMPLETED**
  - Pure deterministic `ContextProjector` mapping context to `ThingProjection` and `EdgeProjection`.
  - Strict endpoint verification preventing phantom nodes or ungrounded edges.
  - Seamless integration into `App.tsx` and `MapCanvas.tsx`.

---

## 10. Known Boundaries

To maintain rigorous development discipline, Map of Chaos explicitly does **NOT** claim:

- **Universal NLP / Free-Form Text Understanding**: Current extraction uses high-precision deterministic regexes and pattern analyzers tailored to target human formulations.
- **Autonomous Truth Verification**: MOC does not verify whether user statements are objectively true in the real world; it verifies only what the user stated.
- **Automatic Graph Completion**: The system never guesses missing links to create a visually denser graph.
- **Vector Embeddings / Semantic Vector Search**: No external vector databases (Qdrant, Pinecone, Chroma, Mem0) are used.
- **Intelligent LLM-Driven Wander**: The Wander view currently uses localized keyword echoing, not deep semantic traversal.
- **Cloud Synchronization & Multi-User Collaboration**: The application is strictly local-first and single-user.
- **Graph Analytics / Centrality Clustering**: No network topology analytics are performed on the canvas.

---

## 11. Product Philosophy

Map of Chaos is governed by seven core philosophical tenets:

1. **Low-Friction Capture**: Recording must be effortless. Never interrupt the user's flow with forms or taxonomy requests.
2. **Evidence Before Sophistication**: Every assertion must link to verifiable human words. Grounding precedes intelligence.
3. **Conservative Identity**: Two things are distinct until proven identical. False separation is easily reconciled; false merging corrupts data irreversibly.
4. **Accumulation Over Fragmentation**: Small, disjointed fragments coalesce over time into a rich semantic picture.
5. **Human Authority**: The user is the final arbiter of truth. Machine resolutions are provisional; human decisions are immutable.
6. **Projection, Not Duplication**: The map is a view of context, not the database itself. Graph nodes reflect semantic context rather than storing it.
7. **Simple Enough, But Fully Functional**: Deliver working vertical slices that do real work, avoiding premature architectural abstractions.

---

## 12. What Makes Map of Chaos Different

| Architecture | Paradigm | Core Primitive | Failure Mode |
| :--- | :--- | :--- | :--- |
| **Legacy Prototype** | `Dump → Thing → Graph` | Visual Graph Node | Visual clutter, duplicate nodes, brittle string matching, lost context. |
| **Current MOC** | `Dump → Evidence → Mentions → Entities → Resolution → Claims → ContextStore → Projection → Map` | Grounded Semantic Claim | Conservative identity, rich accumulation, human auditability, resilient knowledge model. |

In Map of Chaos:
> *"The important object is no longer the visual node. The important object is the persistent semantic context behind the node."*

---

## 13. Future Direction

Development proceeds under a strict evolutionary rule:
> **"Observe what fails. Understand why it fails. Then add only the minimum architecture required to make that failure disappear."**
>
> **"Evidence first. Architecture second."**

We do not build speculative infrastructure for hypothetical scale. Future phases will address:
- Rich contextual catalog views for non-projected claims.
- Epistemic review and resolution override workflows in the UI.
- Reflective exploration loops in Wander grounded in accumulated claims.
- Offline-first local LLM integration acting strictly as an epistemic assistant, not an ungrounded authority.

Map of Chaos does not need to become maximally intelligent. It needs to become intelligent enough to be genuinely useful.
