
---

# 4. `PROTOTYPE_AUDIT.md`

Yang ini adalah snapshot dari apa yang baru saja kita lakukan.

```md
# Map of Chaos — Prototype Audit

Status: V0 Abuse Test
Date: 2026-09-19
Repository: nalakara/map_of_chaos
Deployment: mapofchaos.vercel.app

---

## 1. Purpose

This document records observations from using the Map of Chaos prototype in a deliberately unstructured and adversarial way.

The purpose of the exercise was not to verify whether the application is technically polished.

The purpose was to discover:

- what happens when real messy information is entered
- where the product model holds up
- where AI interpretation becomes misleading
- where relationships become noisy
- where the Map becomes useful
- where the current architecture creates false confidence
- which behaviors should be preserved before further engineering

---

## 2. Prototype Baseline

The current prototype is a Vite/React/TypeScript PWA.

It provides:

- Dump / capture
- Map
- Inbox
- Wander
- Erased
- Thing detail
- AI interpretation
- relationship suggestions
- local persistence
- graph visualization

The current AI service is heuristic and deterministic.

It does not currently use Gemini for the actual dump interpretation or Wander reasoning.

The installed Google GenAI dependency and environment configuration therefore do not mean that the current AI behavior is Gemini-powered.

---

## 3. Abuse Test Philosophy

The prototype was intentionally used with messy real-world inputs rather than clean demo data.

Examples included:

- multiple Google accounts
- multiple Instagram accounts
- personal concerns
- uncertainty about work
- project/application references
- fragmented context
- random thoughts
- unresolved questions

This is important because Map of Chaos is specifically intended to handle context before it is organized.

---

## 4. Observed Strengths

### 4.1 Low-friction capture works

The system accepts arbitrary text without requiring the user to classify it first.

This is aligned with the product principle:

> Capture first. Understand later.

---

### 4.2 Heterogeneous Things can coexist

The Map can contain Things representing very different kinds of information.

Examples:

- accounts
- projects
- thoughts
- concerns
- ideas
- unknown items

The prototype does not require everything to become a task or project.

This is aligned with the product concept.

---

### 4.3 Unknown and uncertain Things are possible

The system allows information to remain unresolved.

This is important.

A system that attempts to understand everything immediately would violate the intended philosophy of Map of Chaos.

---

### 4.4 Original input is preserved

The prototype exposes the original human input separately from AI interpretation.

This is one of the strongest architectural decisions currently present.

The distinction:

> ORIGINAL HUMAN INPUT

versus:

> AI INTERPRETATION

helps prevent AI-generated assumptions from being mistaken for user-authored facts.

This should be preserved.

---

### 4.5 AI interpretation is explicitly presented as provisional

The UI communicates that AI interpretation is a suggestion rather than a fact.

This is consistent with the product contract.

---

### 4.6 Graph behavior is already useful as a prototype

The graph is not merely decorative.

It supports:

- nodes
- relationships
- node selection
- neighbor highlighting
- drag
- zoom
- pan
- degree-based sizing
- different relationship strengths

The underlying graph behavior is sufficient for continued product experimentation.

---

## 5. Major Finding: Relationship Suggestions Are Too Weak

This is the clearest issue discovered during abuse testing.

Current relationship generation relies heavily on token overlap.

Conceptually:

```text
new Thing
    ↓
extract words
    ↓
compare words with existing Things
    ↓
one or more overlaps
    ↓
suggest relationship