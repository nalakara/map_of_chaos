# Map of Chaos — Thing Contract

**Status:** Accepted Domain Contract v0.2  
**Project:** Map of Chaos  
**Purpose:** Define what a Thing means in the Map interface, and its exact relationship to the underlying Context Model.

---

## 1. Architectural Distinction: Entity vs. Thing

The domain model explicitly separates the underlying semantic context from its visual projection:

| Concept | Layer | Definition | Responsibility |
|---|---|---|---|
| **Entity** | **Context Model** | Persistent semantic identity | Ground truth in the context store; accumulates Claims, Evidence, and Temporal history over time. |
| **Thing** | **Map Projection / View** | Spatial visual representation | The interactive node rendered on the user's Map canvas. **A Thing is a projection, not the source of truth.** |

### Legacy Note (V0 Transition):
In the initial prototype (V0), the "Thing" was conflated with the database entity and treated as the sole unit of capture. Under Contract v0.2, the Context Model is authoritative, and a Thing is the visual lens through which an Entity (or Entity cluster) is experienced spatially.

---

## 2. What a Thing Represents

A Thing on the Map projects an underlying **Entity** and its associated **Claims**:

- **Title / Label:** Derived from the Entity's primary name claim, an alias, or a verbatim excerpt.
- **Visual Types:** Derived from active classification Claims (e.g., `is_a: project`, `operates_as: business_line`).
- **Context & Attributes:** Rendered in the Thing detail drawer from attached Claims (qualifiers, equipment quantities, handles, temporal notes).
- **Uncertainty State:** Reflects the epistemic and resolution state of the underlying Entity (`verified`, `unverified`, `unknown`).
- **Spatial Position $(x, y)$:** View-layer state for human exploration, independent of semantic truth.

---

## 3. Projection Rules: When Does an Entity Become a Thing?

The Context Model preserves everything; the Map projects what is useful for spatial memory.

1. **Explicit Entities:** High-salience entities (projects, named business lines, core concepts, distinct people, places) project as independent **Things** (nodes).
2. **Sub-Entities and Assets:** Secondary assets (e.g., specific inventory items like *2 coffee machines*, or individual social handles like `@nalakara.id`) may project as:
   - Attributes inside a primary Thing's detail panel; OR
   - Independent Things on the canvas if the user explores or unbundles them.
3. **Isolated Entities:** An Entity with no relational claims projects as an **Isolated Thing**. An isolated node is completely valid; the system never invents connections to make the map look tidy.

---

## 4. Thing Creation & Provenance

A Thing is never an orphan. It projects an Entity whose lineage is grounded in Evidence:

```text
USER DUMP (Verbatim Input + Timestamp)
   │
   ▼
SEMANTIC EXTRACTION (Mention Span + Claims)
   │
   ▼
ENTITY RESOLUTION (Binds to Persistent Entity)
   │
   ▼
MAP PROJECTION (Renders as a Thing Node)
```

### Provenance Guarantee:
Whenever a user inspects a Thing on the Map, the system must make the **originating Dumps and supporting Evidence spans immediately accessible**. AI may generate summaries or suggested titles for the Thing, but the original human words remain the immutable anchor.

---

## 5. Unknown Things Are First-Class Citizens

An Entity does not need to be understood to exist on the Map.

### Example:
Input:
> *"Borga"*

Projection:
```text
Thing: Borga
Underlying Entity: entity-borga
Claims: none
Epistemic State: unknown
Map Representation: Unknown Thing (unconnected, distinct visual styling)
```

The system does not invent what Borga is. It does not force Borga to become a task, a project, or a note. It is preserved on the Map as an unresolved presence.

Similarly, an input like *"Tungku"* projects as an unknown Thing until future dumps provide additional claims.

---

## 6. Multiple Types as Multiple Claims

A Thing may display multiple types (e.g., `#project`, `#application`).

In the underlying model:
- These are not conflicting identities.
- They are separate Claims attached to the same Entity:
  - `Claim(Coffee Calculator, is_a, project)`
  - `Claim(Coffee Calculator, is_a, application)`
- The visual Thing simply renders these claims as multi-tag facets in its header.

---

## 7. Lifecycle: Active vs. Erased

- **Active:** The underlying Entity is projected on the primary Map canvas.
- **Erased:** The Entity remains in the Context Model with state `erased`. It is removed from the active Map canvas to reduce visual clutter, but its historical Dumps, Evidence, and Claims remain completely preserved and reversible at any time.
- **Permanent Deletion:** An explicit user action that purges the Entity and its exclusive claims from the Context Model.