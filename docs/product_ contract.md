# Map of Chaos — Product Contract

Status: V0 / Prototype
Purpose: Define what Map of Chaos is, what it is not, and what must remain true while the product evolves.

---

## 1. Product Definition

Map of Chaos is a personal external context system.

Its purpose is to give a person a place to capture and visually explore the things that exist in their world before those things are organized, prioritized, interpreted, or turned into action.

The system is intentionally permissive.

A user may enter:

- things they own
- things they want
- things they are building
- projects
- unfinished projects
- ideas
- concerns
- questions
- people
- places
- accounts
- commitments
- observations
- random thoughts
- things they do not understand yet
- contradictory or incomplete information
- anything else that feels relevant to their current context

The system does not require the user to know what an item is before capturing it.

---

## 2. Core Principle

The primary operation of Map of Chaos is:

> Capture first. Understand later.

The system should reduce the cognitive burden of deciding what something is at the moment it is captured.

A user should be able to say:

> "I have this thing."

without also having to say:

> "This is a project."

> "This belongs to category X."

> "This should become a task."

> "This is important."

> "This is related to Y."

Those interpretations may be proposed later, but they should not be required for capture.

---

## 3. What Map of Chaos Is

Map of Chaos is:

- a container for personal context
- a visual map of Things
- a place for unresolved information
- a record of raw human input
- a space where relationships can be discovered
- a system that preserves uncertainty
- a way to externalize mental clutter
- an environment for wandering through one's own context

---

## 4. What Map of Chaos Is Not

Map of Chaos is not primarily:

- a task manager
- a project manager
- a note-taking application
- a conventional knowledge base
- a calendar
- a CRM
- a productivity scoring system
- a life coach
- an AI assistant that tells the user what to do
- an automatic categorization system
- a system that attempts to turn everything into actionable tasks

The product may eventually integrate with some of these systems, but they are not its core identity.

---

## 5. Capture Philosophy

The capture interface should be extremely low-friction.

The preferred interaction is:

> Write → Save

The user should not be required to classify, organize, tag, or structure the input before saving it.

A dump may be:

- one word
- one sentence
- several paragraphs
- a list
- a question
- an observation
- contradictory information
- an incomplete thought

All are valid.

---

## 6. Thing Philosophy

A Thing is an entity that the system believes may deserve to exist independently on the Map.

A Thing does not need to be fully understood.

A Thing may have:

- a title
- a description
- one or more types
- context
- uncertainty
- relationships
- provenance
- timestamps

However, absence of information must not prevent the Thing from existing.

Example:

Input:

> Borga

Valid result:

> Thing: Borga
> State: Unknown

The system should not invent what Borga means.

---

## 7. Human Input vs AI Interpretation

This is a critical product invariant.

Human input and AI interpretation must remain distinguishable.

The original human input is evidence.

AI interpretation is a hypothesis.

The system must never silently transform an AI interpretation into a human-authored fact.

Preferred conceptual structure:

Human input:

> "Coffee Calculator exists in GitHub and Antigravity and I don't know which one is current."

AI interpretation:

> "Possible project with multiple codebases."

The interpretation may be useful, but it must remain identifiable as interpretation.

---

## 8. Uncertainty Is a First-Class State

Uncertainty is not an error state.

The system should explicitly support things that are:

- verified
- unverified
- possible
- suggested
- unknown

The exact vocabulary may evolve, but the underlying principle must remain:

> The system is allowed to not know.

It should be possible for a Thing to remain unresolved indefinitely.

---

## 9. The Map

The Map represents the user's current known context.

It should not attempt to create a perfect ontology of the user's life.

The visual graph is an exploratory representation.

The Map should allow:

- Things to coexist
- Things to remain isolated
- Things to have uncertain relationships
- Things to be connected by human-confirmed relationships
- Things to have AI-suggested relationships
- Things to be erased without necessarily destroying their historical context

An isolated Thing is valid.

The system should not create artificial relationships merely to make the graph look connected.

---

## 10. Relationships

Relationships are hypotheses about how Things may relate.

A relationship is more consequential than a Thing.

A false Thing is usually visible as an uncertain item.

A false relationship can change how the user interprets their entire Map.

Therefore:

> Relationship suggestions must have evidence.

Shared words alone are not sufficient evidence for a meaningful relationship.

---

## 11. Wander

Wander is intended to provide contextual reflection from the Map.

The user may enter a thought or situation such as:

> "I don't know what I should work on."

The system should surface potentially relevant existing Things when there is evidence for relevance.

Wander should not automatically become a life coach.

Preferred behavior:

> "These Things from your Map may be related to what you are thinking about."

Not:

> "You should work on X."

The user remains responsible for interpreting the surfaced context.

---

## 12. AI Behavior

AI should act primarily as:

- interpreter
- hypothesis generator
- relationship suggester
- context retriever
- reflection surface

AI should not act as:

- authority
- owner of the user's data
- automatic decision maker
- silent organizer
- source of invented facts

The system should prefer:

> "Possible"

over:

> "This is"

when evidence is incomplete.

---

## 13. Local-First Direction

Map of Chaos is intended to remain compatible with a local-first architecture.

The product should not become dependent on a cloud AI provider merely because a cloud model makes the prototype easier.

Future AI components may include:

- local LLMs
- local embeddings
- vector search
- semantic retrieval
- optional cloud models

However, product semantics must be defined before choosing the AI infrastructure.

Technology must serve the product model, not define it.

---

## 14. V0 Success Criteria

V0 is successful if the user can:

1. Capture arbitrary context quickly.
2. Preserve the original input.
3. Allow Things to remain uncertain.
4. See Things spatially on a Map.
5. Inspect a Thing and understand where it came from.
6. Distinguish human input from AI interpretation.
7. See relationship suggestions without mistaking them for facts.
8. Remove and restore Things.
9. Wander through existing context without being forced into a productivity workflow.

V0 does not need:

- perfect AI
- semantic understanding of everything
- multi-user support
- cloud synchronization
- sophisticated authentication
- autonomous agents
- automatic task management
- perfect ontology
- complete knowledge graph functionality

---

## 15. Core Product Invariants

The following must remain true unless the product definition is deliberately changed:

### Invariant 1
Capture must remain low-friction.

### Invariant 2
Original human input must remain recoverable.

### Invariant 3
AI interpretation must remain distinguishable from human-authored information.

### Invariant 4
Uncertainty must be allowed.

### Invariant 5
The system must not invent relationships merely to make the Map more connected.

### Invariant 6
The system must not silently convert suggestions into facts.

### Invariant 7
The Map should represent context, not enforce organization.

### Invariant 8
The user remains the final authority over meaning.

---

## 16. Design Direction

When choosing between two implementations, prefer the one that:

- preserves ambiguity when appropriate
- preserves provenance
- produces fewer false claims
- makes AI reasoning inspectable
- minimizes capture friction
- keeps human control explicit
- avoids unnecessary automation

The product should optimize for trustworthy context rather than apparent intelligence.