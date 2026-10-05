# Context Model Contract

**Status:** Accepted Domain Contract v0.2  
**Project:** Map of Chaos  
**Purpose:** Define the semantic context model that sits between raw human dumps and graph/retrieval projections.

---

## 1. Purpose

Map of Chaos accumulates **context**, not merely visual nodes.

The system captures fragmented, unstructured human context over time and progressively builds a cumulative semantic representation as new information arrives.

A new dump may:
- introduce one or more new entities;
- contribute new evidence to an existing entity;
- introduce a new claim;
- strengthen, qualify, or contradict an existing claim;
- connect previously separate entities;
- introduce temporal or intentional context;
- introduce ambiguity or unresolved questions;
- or provide context without requiring new graph elements.

Context is **cumulative, temporal, and multi-to-multi**:
- One Dump may produce many Entities and Claims.
- Many Dumps across days, months, or years may contribute evidence to one persistent Entity.

---

## 2. Core Architectural Principles

### 2.1 Human Evidence Is Authoritative
The system must faithfully preserve what the user explicitly said.
- Original human input is immutable evidence.
- AI may infer, extract, or hypothesize, but it must never rewrite or discard human evidence to make the context model appear tidier or more connected.

### 2.2 Entity ≠ Thing (Context Model vs. Graph Projection)
- **Entity:** A persistent semantic identity in the Context Model.
- **Thing:** A visual projection and interaction representation used by the Map interface.
- The Graph is a **projection** of the context model, not the semantic source of truth.
- Not every Entity needs to become a visual Thing (node), and not every connection needs to become a visual edge.

### 2.3 Identity vs. Information About Identity (Entity vs. Claim)
An Entity is a persistent identity. Everything asserted about that Entity is represented through **Claims**.
- Example: `"Nalakara"` is an Entity reference.
- `"Nalakara is one of my business lines"` is a Claim about that Entity.

### 2.4 Claim Is the Primary Semantic Assertion Primitive
The system does not maintain fragmented, separate architectures for properties, states, tags, and connections.
All assertions about context are modeled as **Claims**.
- **Attribute:** A Claim whose object is a literal, category, or value.
- **Relationship:** A specialized Claim where both the subject and the object are Entities.

### 2.5 Hypothesis Is an Epistemic Status, Not an Object Type
There is no separate data entity called a "Hypothesis".
A hypothesis is simply the **epistemic status** of a Claim that was inferred by the system rather than explicitly stated by the user.

---

## 3. Semantic Context Primitives

The core Context Model is composed of the following primitives:

```text
RAW DUMP (Immutable Capture Event)
   │
   ▼
SEMANTIC EXTRACTION (Mentions, Evidence Spans, Explicit Claims)
   │
   ├── ENTITY (Persistent Semantic Identity)
   │
   └── CLAIM (Primary Semantic Assertion Primitive)
         ├── Subject (Entity)
         ├── Predicate (Relation, Property, State, Activity, Intention)
         ├── Object / Value (Entity, Literal, Quantity, Concept)
         ├── Provenance / Evidence (Dump Reference + Verbatim Text Span)
         ├── Epistemic Status (Confirmed | Inferred / Hypothesis | Uncertain)
         ├── Temporal Scope (Observation Time vs. Validity / State Time)
         └── Qualifiers (Quantity, Scope, Purpose, Conditionality, Modality)
               │
               ▼
        CONTEXT ACCUMULATION (Enrichment, Resolution, Multi-Dump Synthesis)
               │
               ▼
        GRAPH / VIEW PROJECTION (Things, Edges, Overlays, Drawers)
```

### 3.1 Dump
An immutable record of a user capture event. Contains the raw verbatim text, capture timestamp, and metadata.

### 3.2 Evidence
The grounding and provenance of an assertion. Answers:
> *"Where did this assertion come from?"*

Evidence binds directly to a Dump, capturing the exact text span or statement that justifies an extracted Entity or Claim.

### 3.3 Entity
A persistent semantic identity in the user's world.
- Entities are identified across time through Entity Resolution.
- An Entity may have multiple names, aliases, or handles across different contexts.
- An Entity holds no truth on its own; all facts, categories, and associations exist as Claims attached to the Entity.

### 3.4 Claim
The universal assertion primitive. Answers:
> *"What is being asserted about context?"*

Every Claim adheres to the canonical structure:
1. **Subject:** The Entity about which the assertion is made.
2. **Predicate:** The semantic verb, relationship, property, or state (e.g., `is_a`, `operates_in`, `owns`, `has_channel`, `focuses_on`, `researches`, `intends_to_sell`).
3. **Object / Value:** Either another Entity (forming a Relationship) or a concrete value/literal/concept (forming an Attribute).
4. **Provenance / Evidence:** Direct link to the originating Dump ID and exact supporting text excerpt.
5. **Epistemic Status:**
   - `human_confirmed`: Directly and explicitly asserted by the human.
   - `ai_inferred` (Hypothesis): Proposed by the system based on context or semantic reasoning.
   - `unresolved` / `uncertain`: Conflicting, ambiguous, or intentionally left open.
6. **Temporal Scope:** The time frame during which the assertion is valid (see Section 4).
7. **Qualifiers:** Context modifiers that preserve human meaning and nuance (see Section 5).

---

## 4. Temporal Context: Observation Time vs. Validity Scope

The Context Model explicitly separates when information was **observed** from when it is **valid in reality**:

### 4.1 Observation Time
The immutable timestamp when the Dump was created and recorded by the user.

### 4.2 Validity Scope (Temporal Applicability)
The temporal context of the claim itself:
- `past` / `historical`: The claim was true previously (e.g., *"I used to focus Nalakara on visual design"*).
- `present` / `current`: The claim describes the current reality (e.g., *"now I use it more for AI"*).
- `future` / `intended`: The claim represents an aspiration, plan, or upcoming state (e.g., *"eventually I will sell it too"*).
- `recurring` / `habitual`: Ongoing activity (e.g., *"I receive orders for coffee blends"*).
- `unspecified` / `timeless`: Static facts or generic context.

This separation prevents historical shifts from being flattened into contradictory or co-equal static tags.

---

## 5. Qualifiers & Context Modifiers

Human thought is rarely a flat binary triple. The Context Model uses **Qualifiers** on Claims to preserve essential semantic nuance:

- **Quantity / Cardinality:** `"5 Instagram accounts"`, `"2 coffee machines"`, `"1 roasting machine"`.
- **Scope / Partitivity:** `"one of my business lines"`, `"another business line"`, `"main focus"`.
- **Purpose / Beneficiary:** `"for myself"`, `"for client work"`.
- **Modality & Intent:** `"researching how to"`, `"eventually will"`, `"planning to"`, `"maybe"`.
- **Exclusivity / Limitation:** `"only"`, `"partially"`, `"more"`, `"primary"`.

Without qualifiers, a claim like *"I make yoghurt for myself and eventually I will sell it"* degrades into a false assertion that the user currently runs a commercial dairy business.

---

## 6. Graph Projection: From Context Model to Map

The visual Map is a **projection layer** designed for human spatial exploration:
- **Projection Filter:** The system projects certain Entities as **Things** (graph nodes) based on user focus, salience, or explicit pinning.
- **Visual Edges:** Relationships (inter-entity Claims) may project as visual edges between Things. Human-confirmed claims project as solid lines; AI-inferred claims project as provisional/dashed lines or drawer suggestions.
- **Non-Projected Claims:** Attributes, quantities, historical claims, and secondary handles can live inside the Entity's contextual inspection panel rather than spawning visual clutter on the canvas.
- **Isolated Entities:** An Entity with no relational claims naturally projects as an isolated Thing. The system never manufactures artificial claims to force visual connectivity.

---

## 7. Canonical Validation

The Context Model cleanly handles all nine benchmark cases:

- **Case 1 (Instagram Accounts List):** Dump generates 1 ownership Claim with qualifier `quantity: 5` and 5 account Entities (`freshbeda`, `yudhan.sebastian`, etc.) linked via `has_handle` claims with direct evidence.
- **Case 2 (Business Line Definition):** Entity `Nalakara` receives Claims: `is_a: business line` (qualifier: `"one of"`), `operates_in: technology`, `operates_in: AI`.
- **Case 3 (Second Business Line):** Entity `Freshbeda` receives Claims: `is_a: business line` (qualifier: `"another"`), `related_to: visual design`. Distinct from handle `freshbeda` unless explicitly linked.
- **Case 4 (Explicit Account Linkage):** Specialized Claim (Relationship): Subject `nalakara.id`, Predicate `is_instagram_account_of`, Object `Nalakara`. Status: `human_confirmed`.
- **Case 5 (Temporal Shift):** Entity `Nalakara` receives two Claims:
  - Claim A: `focus: visual design`, Temporal Scope: `past` (`"used to"`).
  - Claim B: `focus: AI`, Temporal Scope: `present` (`"now"`), Qualifier: `"more"`.
- **Case 6 (Quantified Assets):** 4 inventory Claims with subjects, predicates `has_asset`, and explicit quantity qualifiers (`2`, `1`, `1`, `2`).
- **Case 7 (Ongoing Activity):** Claim: Subject `User`, Predicate `receives_orders_for`, Object `coffee blends`. Temporal Scope: `current / recurring`.
- **Case 8 (Personal vs. Future Commercial Intent):**
  - Claim A: Predicate `makes`, Object `yoghurt`, Qualifier: `purpose: "for myself"`, Temporal: `present`.
  - Claim B: Predicate `intends_to_sell`, Object `yoghurt`, Qualifier: `temporal_modifier: "eventually"`, Temporal: `future`.
- **Case 9 (Exploratory / Research Intention):** Claim: Subject `User`, Predicate `researching`, Object `how to make faceless YouTube videos`. Epistemic: `human_confirmed`, Predicate preserves exploratory intent without prematurely creating an active project entity.