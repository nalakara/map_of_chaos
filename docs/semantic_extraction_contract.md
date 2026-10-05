# Semantic Extraction Contract

**Status:** Accepted Domain Contract v0.2  
**Project:** Map of Chaos  
**Purpose:** Define how Map of Chaos converts raw human Dumps into structured, evidence-backed semantic information.

---

## 1. Purpose

Semantic Extraction converts unstructured human Dumps into structured semantic context while maintaining a strict boundary between:
- what the user **explicitly stated**;
- what is **structurally extracted** from that statement;
- and what is **inferred or hypothesized**.

The operational principle is:

> **Extract what is present. Infer only what is not explicitly present.**

Semantic Extraction is not interpretation or coaching. It is the faithful syntactic and semantic decomposition of raw human input into verifiable context primitives.

---

## 2. Cardinality: Beyond the Single-Thing Fallacy

A Dump frequently contains substantially more structure than a single entity or visual node.

### Anti-Pattern (V0 Primitive Approach):
```text
Dump: "Saya punya 5 akun Instagram: freshbeda, yudhan.sebastian, nalakara.id, rampainusa, matatua."
  └── Creates 1 monolithic Thing with description "Saya punya 5 akun..."
```

### Context Model Approach:
```text
Dump (Capture Event: Raw Text + Timestamp)
  │
  ├── Claim: Subject(User) ──[owns]──► Object(Instagram Accounts)
  │     └── Qualifier: quantity = 5
  │
  ├── Entity Mention: freshbeda (Type: account / handle)
  ├── Entity Mention: yudhan.sebastian (Type: account / handle)
  ├── Entity Mention: nalakara.id (Type: account / handle)
  ├── Entity Mention: rampainusa (Type: account / handle)
  └── Entity Mention: matatua (Type: account / handle)
```

Each extracted element retains a direct pointer to the exact substring in the dump that produced it.

---

## 3. Extraction Components

Semantic Extraction identifies five distinct facets from raw text:

```text
RAW DUMP
   │
   ▼
SEMANTIC EXTRACTION ENGINE
   │
   ├── 1. Entity Mentions (Proper nouns, entities, roles, assets)
   ├── 2. Explicit Predicates (is_a, owns, works_in, focuses_on, researches)
   ├── 3. Quantifiers & Qualifiers (Numbers, scopes, degree, purpose)
   ├── 4. Temporal Markers (Observation time vs. validity: "used to", "now", "eventually")
   └── 5. Evidence Spans (Character offsets / exact text grounding)
```

### 3.1 Entity Mentions
Identifies candidate entities referenced in the text, preserving their raw surface form (e.g., `"Nalakara"`, `"freshbeda"`, `"coffee calculator"`).

### 3.2 Explicit Claims
Constructs structured Claims where the relationship or attribute is directly stated:
- `"Nalakara is one of my business lines"` $\rightarrow$ `Claim(Nalakara, is_a, business_line)`.
- `"working in technology and AI"` $\rightarrow$ `Claim(Nalakara, operates_in, technology)`, `Claim(Nalakara, operates_in, AI)`.

### 3.3 Qualifiers & Context Modifiers
Extraction must preserve modifying expressions that dictate scope and intent:
- **Quantity:** `"2 coffee machines"`, `"1 roasting machine"`, `"1 freezer"`, `"2 refrigerators"`.
- **Partitivity / Scope:** `"one of my business lines"`, `"another business line"`.
- **Purpose / Beneficiary:** `"for myself"`, `"for client use"`.
- **Modality:** `"eventually"`, `"planning to"`, `"maybe"`, `"exploring"`.

### 3.4 Temporal Context Markers
Extraction flags linguistic indicators of time to set the Claim's **Validity Scope**:
- `"used to focus on visual design"` $\rightarrow$ Temporal Scope: `past`.
- `"now I use it more for AI"` $\rightarrow$ Temporal Scope: `present`.
- `"eventually I will sell it too"` $\rightarrow$ Temporal Scope: `future / intention`.
- `"I receive orders for coffee blends"` $\rightarrow$ Temporal Scope: `current / recurring`.

### 3.5 Evidence Grounding
Every extracted Claim and Entity Mention must record its **supporting text span**:
- `evidence_text`: The exact phrase from the Dump.
- `dump_id`: The ID of the originating Dump.

---

## 4. Nuanced Extraction Patterns

### 4.1 Asset Inventories with Quantities (Case 6)
Dump: *"I have 2 coffee machines, 1 roasting machine, 1 freezer, and 2 refrigerators."*
- **Subject:** User
- **Predicate:** `owns_asset` / `has_equipment`
- **Objects & Qualifiers:**
  - Object: `coffee machine`, Qualifier: `quantity: 2`
  - Object: `roasting machine`, Qualifier: `quantity: 1`
  - Object: `freezer`, Qualifier: `quantity: 1`
  - Object: `refrigerator`, Qualifier: `quantity: 2`
- **Output:** Structured claims preserving equipment counts without prematurely creating 6 separate visual map nodes.

### 4.2 Present Action vs. Future Intention (Case 8)
Dump: *"I make yoghurt for myself and eventually I will sell it too."*
- **Claim 1:** `Claim(User, makes, yoghurt)`
  - Qualifier: `purpose: "for myself"`
  - Temporal Scope: `present`
  - Epistemic Status: `human_confirmed`
- **Claim 2:** `Claim(User, intends_to_sell, yoghurt)`
  - Qualifier: `temporal_modifier: "eventually"`, `addition: "too"`
  - Temporal Scope: `future`
  - Epistemic Status: `human_confirmed`
- **Protection:** Prevents the AI from categorizing the user as currently running a commercial yoghurt company while faithfully recording their future commercial aspiration.

### 4.3 Exploratory Context vs. Formal Commitment (Case 9)
Dump: *"I am researching how to make faceless YouTube videos."*
- **Claim:** `Claim(User, researching, "how to make faceless YouTube videos")`
  - Epistemic Status: `human_confirmed`
  - Temporal Scope: `present / exploratory`
- **Protection:** Records genuine creative exploration without turning an open question into an overdue project ticket.

---

## 5. Invariants

1. **No Phantom Claims:** Extraction must never generate claims that cannot be traced to an explicit word or syntactic structure in the human input.
2. **Preserve Linguistic Ambiguity:** If the user writes `"Tungku"` with no predicate, extraction yields an Entity Mention with zero claims and state `unknown`. It must not invent a predicate.
3. **Qualifiers Are Mandatory When Present:** Numbers, restrictive words (`"one of"`, `"only"`), and temporal markers (`"used to"`, `"eventually"`) must not be discarded during extraction.