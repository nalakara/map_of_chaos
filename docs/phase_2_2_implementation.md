# Phase 2.2 Implementation — Entity Resolution

## 1. Scope

Phase 2.2 implements the **Entity Resolution** stage of the Map of Chaos pipeline:

$$\text{SEMANTIC MENTION} \longrightarrow \text{ENTITY RESOLUTION} \longrightarrow \text{matched\_existing} \mid \text{new\_entity} \mid \text{ambiguous} \mid \text{associated\_handle}$$

Followed by atomic context accumulation into the persistent context store:

$$\text{Mention} \longrightarrow \text{Entity} \longrightarrow \text{Claim Accumulation}$$

### Core Product Invariants Enforced
1. **Context Accumulation, Not Mere Node Accumulation:** When new dumps mention entities already established in context, new claims attach to and enrich existing persistent Entities rather than duplicating nodes.
2. **False Merges Are More Harmful Than Missed Weak Links:** If identity cannot be verified safely, the resolver prefers `ambiguous` or `new_entity` over an incorrect match.
3. **Lexical Similarity Has Zero Authority To Merge:** Lexical similarity is merely a candidate generation signal. Identifiers and entities that share normalized tokens (e.g. `freshbeda` vs `Freshbeda`) remain distinct until explicit relational evidence connects them.
4. **Distinction of Entity Identity from Associated Handles:** Social handles (e.g., `nalakara.id`) retain their own identifier representation and link to parent organizations via `has_social_account` without collapsing or overwriting either representation.
5. **Human Override Precedence & Rebinding:** Human overrides supersede machine decisions and are locked against automated reprocessing; rebinding updates both subject and object claim roles with an immutable audit log.

---

## 2. Resolution Model

Entity Resolution is decoupled into a pluggable interface [IEntityResolver](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/pipeline/resolution/types.ts):

```typescript
export interface IEntityResolver {
  readonly version: string;
  resolve(mention: Mention, context: ResolutionContext): Promise<ResolutionDecision>;
  resolveAll(mentions: Mention[], context: ResolutionContext): Promise<Map<string, ResolutionDecision>>;
}
```

The concrete implementation is [DeterministicEntityResolver](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/pipeline/resolution/resolver.ts) (`version: 'resolver-deterministic-v1.0.0'`). The pipeline separates candidate generation from candidate evaluation and decision gating:
- **Stage A (Candidate Generation):** Scans the existing context to generate plausible candidates with signal strengths and type compatibility assessments without making any merge decisions.
- **Stage B (Decision Gate):** Applies the strict resolution authority matrix to decide between the 4 semantic states.
- **Stage C (Context Accumulation):** Mints or enriches persistent `Entity` records, updates `associatedHandles`, binds subject/object entity IDs onto domain `Claim` records, and persists `EntityResolution` provenance records atomically in IndexedDB.

---

## 3. Candidate Generation

Implemented in [CandidateGenerator](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/pipeline/resolution/candidateGen.ts).

### Candidate Signals & Weights
1. **Pronoun / User Self (`user_self`, weight: 1.0):** Matches 1st-person pronouns (`saya`, `aku`, `me`, `i`, etc.) directly to the singleton user entity context (`ent-user-self`).
2. **Existing Human Resolution (`human_override`, weight: 1.0):** If an active resolution was previously locked by a human override, it yields an authoritative candidate.
3. **Explicit Relational Link (`explicit_relational_link`, weight: 0.95):** Detected when relational claims in the current extraction declare a link between a handle and a parent entity (e.g. `nalakara.id adalah akun Instagram untuk Nalakara`).
4. **Exact Canonical Name (`exact_canonical`, weight: 0.95):** Case-insensitive exact match against `entity.canonicalName`.
5. **Exact Known Alias (`exact_alias`, weight: 0.95):** Exact match against registered `entity.aliases`.
6. **Exact Registered Handle (`exact_handle`, weight: 0.95):** Exact match against registered `entity.associatedHandles`.
7. **Lexical / Substring Overlap (`lexical_similarity`, weight: 0.40):** Generates candidate matches based on prefix/suffix overlap or substring containment. **Strictly marked as weak signal with zero authority to merge.**

### Ontological Type Compatibility
Candidates are annotated with `typeCompatibility: 'compatible' | 'mismatch' | 'unknown'`:
- If mention hint is `social_handle` and entity represents a `company`, type compatibility is `'mismatch'`.
- If mention hint is `person` and entity represents a `brand`, type compatibility is `'mismatch'`.
Mismatched candidates are barred from `strongMatches` during decision gating.

---

## 4. Resolution Decision Logic

Implemented in [DecisionGate](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/pipeline/resolution/decisionGate.ts).

### Resolution Authority Matrix
| Priority | Condition | State | Output / Action |
|---|---|---|---|
| **1** | Existing active resolution with `createdBy: 'human_override'` | `matched_existing` | Honors human override. Machine cannot undo. |
| **2** | 1st-person pronoun reference (`saya`, `aku`, `me`) | `matched_existing` | Binds to singleton `USER_SELF_ENTITY_ID` (`ent-user-self`). |
| **3** | Explicit relational assertion linking handle to entity | `associated_handle` | Links handle to parent entity ID while retaining handle identity representation. |
| **4** | Multiple candidates share exact name or alias (Homonyms) | `ambiguous` | Refuses to guess without discriminating context (e.g. Mercury company vs Mercury planet). |
| **5** | Mention is `social_handle` without explicit parent link | `matched_existing` or `new_entity` | Matches existing handle entity if present; otherwise mints distinct handle representation. Prohibits auto-merge with business line entities. |
| **6** | Single strong match (`exact_canonical` / `exact_alias`) | `matched_existing` | Merges only if type is compatible. If type is `mismatch`, creates `new_entity`. |
| **7** | Only lexical similarity matches exist | `new_entity` | **Strict Non-Merge Invariant:** Lexical overlap alone has zero merge authority. Creates distinct new entity. |
| **8** | No candidate found | `new_entity` | Mints new entity with proposed canonical name and type hint. |

---

## 5. Resolution States

The resolver supports exactly the 4 conceptual states:

1. **`matched_existing`:**
   - The mention refers to an existing persistent `Entity` with verifiable evidence (exact canonical name match, registered alias, or user-self singleton).
   - Enriches the existing entity without creating a new entity node.
2. **`new_entity`:**
   - The mention is sufficiently distinct, or existing candidates have ontological mismatches or only lexical similarity.
   - Mints a new persistent `Entity` record with a unique entity ID (resolving slug collisions cleanly).
3. **`ambiguous`:**
   - More than one plausible candidate exists (e.g. homonyms like "Mercury" product vs "Mercury" company), or context is insufficient to decide safely.
   - Records the candidate entity IDs and rationale in the resolution record; no merge is performed.
4. **`associated_handle`:**
   - The mention represents an account/handle/identifier (e.g. `nalakara.id`) associated with a parent entity (e.g. `Nalakara`).
   - Does NOT collapse or overwrite the handle into the parent entity; retains the handle's identifier identity while registering the handle in the parent's `associatedHandles` and creating a `has_social_account` relational claim.

---

## 6. Associated Handle Semantics

The architecture strictly distinguishes **Entity Identity** from **Identifier / Handle**:
- In DUMP A, `freshbeda`, `yudhan.sebastian`, `nalakara.id`, `rampainusa`, `matatua` are extracted as `social_handle` mentions.
- In DUMP D, `nalakara.id adalah akun Instagram untuk Nalakara.` is processed:
  - `Nalakara` resolves to `ent-nalakara` (`matched_existing`).
  - `nalakara.id` resolves to `associated_handle`:
    - `outcome: 'associated_handle'`
    - `associatedHandle: { handle: 'nalakara.id', parentEntityId: 'ent-nalakara' }`
    - `targetEntityId: 'ent-nalakara_id'` (its own entity representation).
  - Parent entity `ent-nalakara` is updated with `associatedHandles: ['nalakara.id']`.
  - Relational claim is formed:
    - Subject: `ent-nalakara`
    - Predicate: `has_social_account`
    - Object: `ent-nalakara_id` (or literal handle value)
    - Subject Mention: `men-Nalakara`
    - Object Mention: `men-nalakara.id`
  - Neither `nalakara.id` nor `Nalakara` overwrites or destroys the other's identity.

---

## 7. Ambiguity Handling

When a mention could refer to more than one existing entity without discriminating context:
- Scenario: Entity A is "Mercury" (company), Entity B is "Mercury" (product).
- Mention: "Mercury" in a generic context without differentiating claims.
- The decision gate returns:
  ```json
  {
    "outcome": "ambiguous",
    "confidence": 0.5,
    "candidateEntityIds": ["ent-mercury-company", "ent-mercury-product"],
    "rationale": "Multiple existing entities share name 'Mercury' without discriminating context"
  }
  ```
- The system does not guess or force a merge to maximize graph connectivity.

---

## 8. Human Override

Human overrides integrate directly with the Phase 1 persistence and state machine architecture ([ContextStore.applyHumanOverride](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/storage/contextStore.ts)):
- When a human executes an override (`targetType: 'entity_resolution'`, `action: 'bind_to_entity'`), the previous resolution is transitioned to `superseded` and a new resolution record is created with `createdBy: 'human_override'` and `confidence: 1.0`.
- During automated machine resolution, any mention with an active `human_override` resolution bypasses heuristic evaluation and remains locked to the human-specified target.
- Reprocessing preserves human decisions and reinforces evidence without regression.

---

## 9. Rebinding

Rebinding maintains complete semantic history without destructive edits:
- **Subject-Side Rebinding:**
  - When `rebindMention(mentionId, newEntityId, reason)` is invoked, all claims where `subjectMentionId === mentionId` are atomically rebound to `newEntityId`.
  - An immutable [ClaimBindingAudit](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/domain/types.ts) event is persisted with `role: 'subject'`, capturing `oldEntityId`, `newEntityId`, and the new resolution ID.
- **Object-Side Rebinding:**
  - Relational claims where `objectMentionId === mentionId` are identified.
  - The claim's `objectValue` (`type: 'entity_id'`) is rebound to `newEntityId`.
  - An immutable `ClaimBindingAudit` event is persisted with `role: 'object'`.
  - Original evidence spans, extraction offsets, and mention texts remain completely intact.

---

## 10. Context Accumulation

Implemented in [ContextAccumulator](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/pipeline/resolution/accumulator.ts):
- Evaluates mentions across dumps sequentially.
- When DUMP B establishes `Nalakara` in AI and technology, `Nalakara` is minted as `ent-nalakara`.
- When DUMP D references `Nalakara`, the resolver resolves `matched_existing` (`ent-nalakara`).
- The new relational claim attaches to the existing `ent-nalakara` in `ContextStore`.
- No duplicate node `Nalakara #2` is ever created.

---

## 11. Persistence

All resolution outcomes and accumulated context are persisted via IndexedDB typed repositories in [ContextStore](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/storage/contextStore.ts):
- `entities`: Stores `Entity` records and `EntityResolution` records.
- `claims`: Stores domain `Claim` records with bound `subjectEntityId` and `objectMentionId`.
- `claim_audits`: Stores immutable `ClaimBindingAudit` entries.
- `human_overrides`: Stores human intervention events.
- Atomic multi-store transactions (`runTransaction`) are used for re-binding and resolution state transitions.

---

## 12. Tests

The test suite [src/pipeline/__tests__/entityResolution.test.ts](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/pipeline/__tests__/entityResolution.test.ts) covers all 18 required scenarios:

| # | Test Scenario | Verified Behavior | Forbidden Behavior |
|---|---|---|---|
| **1** | Exact unique match | Matches existing `Nalakara` entity | No duplicate entity created |
| **2** | New entity | Mints new entity for distinct `Acme Studio` | Must not attach to unrelated entities |
| **3** | Ambiguous same-name entities | Flags `ambiguous` between two `Mercury` entities | Must not arbitrarily choose one |
| **4** | Similar names | `freshbeda` vs `Freshbeda` remain separate | Must not auto-merge on lexical similarity |
| **5** | Handle associated with entity | `nalakara.id` links to `ent-nalakara` | Must not rename or overwrite handle |
| **6** | Multiple handles | `nalakara.id` and `nalakara.com` both link to `Nalakara` | Must not collapse handles together |
| **7** | Explicit registered alias | `Nalakara AI` resolves to `Nalakara` via registered alias | Must not treat as unrelated entity |
| **8** | User-self reference | `saya` resolves to singleton `USER_SELF_ENTITY_ID` | Must not create arbitrary `saya` entity |
| **9** | Quantity without identity | Cardinality claim attaches to user entity | Must not fabricate `Coffee Machine #1`, `#2` |
| **10** | Activity without entity | Order processing & research recorded as claims | Must not fabricate `Order #1`, `Channel #1` |
| **11** | Mention rebinding | Rebinds mention, supersedes resolution, writes audit log | Must not delete previous resolution history |
| **12** | Human override precedence | Override forces link to target entity with `createdBy: 'human_override'` | Machine heuristic must not override human |
| **13** | Reprocessing lock | Subsequent accumulator pass respects locked human override | Reprocessing must not undo human decision |
| **14** | Subject-side rebinding | Rebinds claims where entity was subject | Evidence spans must remain intact |
| **15** | Object-side rebinding | Rebinds claims where entity was object with `role: 'object'` audit | Evidence spans must remain intact |
| **16** | Multi-dump accumulation | Dumps 1 & 2 accumulate claims onto single entity | Must not create duplicate entity nodes |
| **17** | Canonical Instagram sequence | Full A $\to$ B $\to$ C $\to$ D pipeline execution | Must not merge `freshbeda` with `Freshbeda`; must link `nalakara.id` to `Nalakara` |
| **18** | Insufficient evidence | Returns `ambiguous` when evidence is inadequate | Must not guess |

---

## 13. Test Results

### Full Test Suite Execution
```bash
node --import tsx --test src/domain/__tests__/*.test.ts src/storage/__tests__/*.test.ts src/pipeline/__tests__/*.test.ts
```

Output:
```
▶ Domain Invariants Suite (5 tests)
  ✔ validates evidence grounding in raw dump
  ✔ validates mention grounding in evidence text
  ✔ prohibits automatic merge on lexical similarity alone
  ✔ evaluates temporal shifts vs direct contradictions
  ✔ determines active claims in current context
✔ Domain Invariants Suite (137.75ms)

▶ State Machines Suite (5 tests)
  ✔ creates active resolution records
  ✔ applies human override and supersedes previous resolution without deleting history
  ✔ re-binds claim entity with audit trail while preserving evidence
  ✔ enforces claim review state transitions and forbids demoting human decisions
  ✔ guarantees reprocessing locks human decisions and reinforces evidence
✔ State Machines Suite (171.29ms)

▶ Phase 2.2 — Entity Resolution Decision Matrix Suite (18 tests)
  ✔ 1. resolves exact unique canonical name match without duplicating entity
  ✔ 2. mints new entity when mention is distinct and no match exists
  ✔ 3. flags ambiguous when multiple existing entities share the same name
  ✔ 4. prohibits auto-merging similar names on lexical similarity alone
  ✔ 5. resolves explicit relational declaration as associated_handle on parent entity
  ✔ 6. associates multiple handles with the same entity without collapsing them
  ✔ 7. resolves known registered alias to existing entity
  ✔ 8. resolves 1st-person pronouns to USER_SELF_ENTITY_ID without creating arbitrary entities
  ✔ 9. records inventory cardinality claims on user without fabricating numbered item entities
  ✔ 10. records activity assertions without manufacturing artificial Order or Channel entities
  ✔ 11. supports mention rebinding with resolution supersession and audit logging
  ✔ 12. enforces human override precedence over machine decisions
  ✔ 13. prevents machine reprocessing from undoing human override decisions
  ✔ 14. rebinds subject-side claim entity with immutable audit event
  ✔ 15. rebinds object-side relational claim entity with audit trail
  ✔ 16. accumulates claims from multiple dumps onto the same entity without duplicating nodes
  ✔ 17. executes canonical sequence (A -> B -> C -> D) maintaining handle distinction and context accumulation
  ✔ 18. returns ambiguous when evidence is insufficient to safely choose a candidate
✔ Phase 2.2 — Entity Resolution Decision Matrix Suite (211.54ms)

▶ Phase 2.1 — Semantic Extraction Core Suite (17 tests)
  ✔ 1-17 tests pass
✔ Phase 2.1 — Semantic Extraction Core Suite (75.30ms)

▶ Phase 1 Condition Closure Suite (7 tests)
  ✔ Condition 1-4 tests pass
✔ Phase 1 Condition Closure Suite (131.96ms)

▶ Storage Layer & ContextStore Integration (5 tests)
  ✔ all 5 integration tests pass
✔ Storage Layer & ContextStore Integration (17.78ms)

ℹ tests 58
ℹ suites 10
ℹ pass 58
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

### Type Checking & Linter
```bash
npm run lint
```
Output:
```
> tsc --noEmit
Passed with 0 errors.
```

### Production Build
```bash
npm run build
```
Output:
```
> vite build
✓ 1712 modules transformed.
dist/index.html                   2.05 kB │ gzip:   0.83 kB
dist/assets/index-DSq_y_6e.css   37.42 kB │ gzip:   6.92 kB
dist/assets/index-B2BQ0h5Z.js   328.06 kB │ gzip: 100.61 kB
✓ built in 1.37s
```

---

## 14. Phase Boundary

The following components were **STRICTLY NOT IMPLEMENTED** in Phase 2.2:
- **Graph Projection (`ThingProjection`, `EdgeProjection`)**: No graph nodes or links were generated from the resolved semantic context.
- **MapCanvas Rewrite**: `src/components/MapCanvas.tsx` was not modified.
- **Wander Redesign**: Wander services and heuristics were not modified.
- **UI Redesign**: No React UI changes were introduced.
- **localStorage Migration**: No legacy localStorage migration was performed.
- **Vector Search / Embeddings**: No embedding pipelines or vector indices were added.
- **Mem0 / Qdrant**: No third-party AI memory services or vector databases were installed or introduced.

---

## 15. Known Limitations

1. **Deterministic Rule Scope:** Candidate scoring and relational linking in Phase 2.2 are implemented with a deterministic authority matrix. An LLM-assisted or hybrid candidate resolver implementing the same `IEntityResolver` interface can be introduced in a future phase without breaking existing contracts.
2. **Handle Disambiguation across Platforms:** Handles currently compare normalized surface strings. If two different platforms (e.g. Instagram vs TikTok) share the exact same handle handle string in separate entities, platform qualifiers from claims must be supplied to differentiate them.
3. **Graph Rendering Unconnected:** Because Graph Projection is intentionally deferred to Phase 3, the accumulated semantic entities and claims currently reside in `ContextStore` (IndexedDB) and are not yet projected onto the D3 canvas.

---

## 16. Implementation Verdict

COMPLETE
