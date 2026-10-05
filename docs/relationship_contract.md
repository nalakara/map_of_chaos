# Map of Chaos — Relationship Contract

**Status:** Accepted Domain Contract v0.2  
**Project:** Map of Chaos  
**Purpose:** Define when the system may assert or suggest that two Entities are meaningfully connected.

---

## 1. Definition

In the Context Model:
> **A Relationship is a specialized form of Claim where both the subject and the object are Entities.**

```text
Claim (Inter-Entity Relation)
├── Subject: Entity A
├── Predicate: relationship type (e.g., is_part_of, created_by, operates_channel, references)
├── Object: Entity B
├── Provenance / Evidence: Supporting text span from Dump
├── Epistemic Status: human_confirmed | ai_inferred (Hypothesis) | uncertain
├── Temporal Scope: past | present | recurring | timeless
└── Qualifiers: purpose, role, degree, modality
```

When projected onto the visual Map:
- A Relationship between two projected Entities may appear as a **visual edge between Things**.
- Human-confirmed relationship claims project as solid edges.
- AI-inferred relationship claims project as dashed, provisional links or drawer proposals.
- Not every relationship claim must become a visual edge; visual projection is selective.

---

## 2. Core Principle: Lexical Overlap ≠ Meaningful Connection

The system must rigorously distinguish:

> *"These two descriptions share common words."*

from:

> *"These two Entities have a genuine, meaningful relationship in the user's world."*

Lexical overlap may be used by search indices to retrieve candidates for evaluation.  
**Lexical overlap alone must NEVER be sufficient evidence to generate a relationship claim.**

---

## 3. High Evidence Threshold for Relationships

An isolated Entity on the Map is safe and normal. It represents a piece of context waiting to be understood.

A false relationship, however, is **toxic to the mental model**:
- It distorts the user's spatial layout.
- It clusters unrelated parts of the user's life together.
- It creates false narrative connections that the user never intended.

Therefore:

> **False-positive relationships are far more harmful than missing weak relationships.**

The system must always prefer:
> **Zero relationship suggested.**

over:
> **A weak, speculative relationship presented as meaningful.**

---

## 4. Relationship Provenance & Rationale

Every AI-inferred relationship claim (`epistemic_status: 'ai_inferred'`) must carry an explicit, inspectable rationale grounded in evidence.

- **Prohibited (Invalid Rationale):**
  > *"Shares related context: 'saya, punya'"*  
  *(Flagged: Matches stop words / common grammatical verbs).*
- **Prohibited (Invalid Rationale):**
  > *"Both Things mention 'project'."*  
  *(Flagged: Matches generic category noun).*
- **Valid (Evidence-Backed Rationale):**
  > *"Explicit Reference: Dump 1 explicitly states 'nalakara.id is the Instagram account for Nalakara'."*
- **Valid (Evidence-Backed Rationale):**
  > *"Shared Identifier: Both entities explicitly refer to the identical GitHub repository URL."*

---

## 5. Relationship Evidence Categories

Inter-entity claims must be classified by their evidence grounding:

### 5.1 Explicit Reference (Strongest Evidence)
Entity A explicitly names Entity B in its source dump.
- *Example (Case 4):* User states: *"nalakara.id is the Instagram account for Nalakara."*
- *Result:* Direct claim `Claim(nalakara.id, is_instagram_account_of, Nalakara)`. Epistemic status: `human_confirmed`.

### 5.2 Shared Identifiable Entity / Asset
Two entities explicitly refer to the same concrete third entity, codebase, or registered account.
- *Example:* Two project notes referencing the exact same deployment domain or contract ID.

### 5.3 Shared Project / Person / Place
Two entities explicitly reference an identical, specific person, physical location, or named project.

### 5.4 Contextual & Functional Relation
One entity directly provides operational or environmental context for another.
- *Example:* An equipment asset (*"roasting machine"*) and a product activity (*"orders for coffee blends"*). The relationship is plausible, but if inferred by AI, it must remain `epistemic_status: 'ai_inferred'` until confirmed.

### 5.5 Conceptual / Semantic Relation (Weakest Permissible)
Two entities share domain semantics without sharing exact tokens.
- *Example:* *"I have been unemployed for 4 months"* and *"I don't know what I should work on"*.
- *Rule:* May be suggested quietly in the reflection drawer or during Wander, but must never automatically inject a physical spring edge on the Map.

---

## 6. Prohibited Weak Signals

The following signals must never independently trigger a relationship suggestion:

- Pronouns and common function words (e.g., *saya, punya, aku, kita, ini, itu, yang, dan, I, my, the, this, with*).
- Generic verbs of possession or desire (e.g., *punya, mau, ingin, bikin, have, make, want*).
- Generic category nouns (e.g., *project, app, account, thing, note, idea, work*).
- Superficial sentence structure or formatting similarities.

---

## 7. Relationship Lifecycle

```text
EVIDENCE EXTRACTED FROM DUMP
            │
            ├── Explicit user statement?
            │     ├── YES ──► Claim created with epistemic status: 'human_confirmed'
            │     │           (Projects as solid visual edge on Map if relevant)
            │     │
            │     └── NO  ──► Strong evidence category satisfied?
            │                   ├── YES ──► Inferred Claim ('ai_inferred' / Hypothesis)
            │                   │           (Provisional, visible in drawer/overlay, NO physical pull)
            │                   │           User may Confirm ──► becomes 'human_confirmed'
            │                   │           User may Dismiss ──► Claim purged
            │                   │
            │                   └── NO  ──► ZERO relationship created.
            │                               (Entity remains cleanly isolated).
```