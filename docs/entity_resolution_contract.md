# Entity Resolution Contract

**Status:** Accepted Domain Contract v0.2  
**Project:** Map of Chaos  
**Purpose:** Define how Map of Chaos determines whether a newly observed mention refers to an existing Entity, a new Entity, or an unresolved/ambiguous Entity.

---

## 1. Purpose

Entity Resolution answers one foundational question:

> *"Does this newly observed mention refer to an Entity that already exists in the Context Model?"*

Entity Resolution is distinct from Semantic Extraction:
- **Semantic Extraction** identifies *what was mentioned* and extracts claims from raw text.
- **Entity Resolution** determines *whether that mention binds to an existing persistent identity* in the Context Model.

The system must **prefer contextual correctness over reducing entity counts**. Merging two distinct entities causes irreversible contextual corruption, whereas keeping entities separate until evidence warrants linkage preserves fidelity.

---

## 2. Core Principles

### 2.1 Lexical Similarity ≠ Ontological Identity
> **Similar names do not necessarily mean the same Entity, and different names do not necessarily mean different Entities.**

- **Homonyms:** Two completely separate entities may share identical names (e.g., project *"Nalakara"* vs. organization *"Nalakara"*).
- **Handles & Channels:** A communication handle (e.g., `@freshbeda`) represents an asset or channel, not automatically the same entity as the business line (*"Freshbeda"*), unless an explicit claim links them.
- **Aliases:** Different mentions (e.g., *"Coffee Calculator"*, *"kalkulator kopi"*, *"the coffee recipe app"*) may refer to the same entity when contextual evidence supports it.

### 2.2 Enrichment, Not Replacement
When a mention resolves to an existing Entity:
- The system **enriches** the Entity by attaching new Claims grounded in the new Dump evidence.
- The system must **never overwrite, erase, or rewrite** historical claims or original human evidence.

### 2.3 Ambiguity Is a First-Class State
When a mention cannot be confidently resolved:
- The system is **allowed to not know**.
- The mention must remain in an `unresolved` / `ambiguous` resolution state rather than being forced into a false match.

---

## 3. Resolution Outcomes

Every candidate mention processed by Entity Resolution results in one of four explicit outcomes:

```text
MENTION EXTRACTED FROM DUMP
            │
            ▼
    ENTITY RESOLUTION
            │
   ┌────────┼─────────────────┬──────────────────┐
   ▼        ▼                 ▼                  ▼
MATCHED    NEW            AMBIGUOUS           HANDLE /
EXISTING   ENTITY         CANDIDATE           ALIAS
   │        │                 │                  │
Attaches   Instantiates   Preserves          Links as
new Claims new Entity in  epistemic          channel or alias
to Entity  Context Model  uncertainty        via Claim
```

### 3.1 Matched Existing (`matched_existing`)
High-confidence evidence demonstrates that the mention refers to a known Entity.
- **Action:** Attach the extracted Claims and Evidence to the existing Entity ID.
- **Example:** User mentions *"Coffee Calculator"* after earlier defining it. The new dump adds deployment claims to the existing Entity.

### 3.2 New Entity (`new_entity`)
No existing Entity matches the identity, or the mention explicitly introduces a new identity.
- **Action:** Mint a new persistent Entity ID in the Context Model.
- **Example:** User mentions *"Borga"* for the first time. A new Entity is created with state `unknown`.

### 3.3 Ambiguous / Polysemous (`ambiguous`)
The mention could refer to more than one existing Entity, or context is insufficient to discriminate between candidates.
- **Action:** The mention and its associated Claims are marked with epistemic status `uncertain` / `ambiguous`. Claims are quarantined from silently mutating existing entity facts until disambiguated by human confirmation or subsequent context.
- **Example:** User has a project called *"Nalakara"* and an organization called *"Nalakara"*. A new dump says: *"Nalakara needs website updates"*. The system does NOT guess; it records the claim as ambiguous between the two candidates.

### 3.4 Handle / Asset Association (`associated_handle`)
The mention represents a channel, handle, or digital presence that belongs to an entity rather than being the entity itself.
- **Action:** Treat the handle as an entity or value linked to the parent entity via an explicit `has_handle` or `operates_channel` Claim.
- **Example:** `@nalakara.id` is linked to `Nalakara` via an explicit Claim, preserving the distinction between the business and its social account.

---

## 4. Resolution Evidence Hierarchy

Automatic resolution requires rigorous evidence. String tokens alone are never sufficient.

1. **Explicit Identity Assertion (Highest Evidence):**
   - User explicitly declares identity: *"nalakara.id is the Instagram account for Nalakara"*.
2. **Deterministic Identifier Match:**
   - Exact unique IDs, URLs, repository links, or registered system handles.
3. **Contextual & Relational Triangulation:**
   - Overlapping co-occurring entities, shared specific domain predicates, and compatible temporal scopes.
4. **Lexical / String Similarity Alone (Zero Resolution Authority):**
   - Shared words (e.g., both mention *"coffee"*, or both mention *"project"*) provide zero authority to merge entities.

---

## 5. Invariants

1. **No Silent Merging:** The system must never merge two existing Entities without explicit user confirmation or definitive explicit evidence.
2. **Preserve Distinct Homonyms:** If the user declares two entities with the same label (Case 6), both must persist independently with unique system identities and differentiated contextual claims.
3. **No Retroactive Evidence Erasure:** If two entities are eventually linked or merged by user confirmation, the original historical Dumps and individual provenance trails must remain fully inspectable.