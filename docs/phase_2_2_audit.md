# Phase 2.2 — Entity Resolution Audit

## 1. Audit Scope

This audit evaluates the Phase 2.2 implementation of **Entity Resolution** in Map of Chaos. The inspection is strictly read-only and evaluates the codebase against the authoritative product, context model, and entity resolution contracts.

The audit evaluates:
- Pluggable resolver interface and deterministic resolution pipeline (`src/pipeline/resolution/`).
- Separation of candidate generation from resolution decision authority.
- Handling of the 4 required resolution states: `matched_existing`, `new_entity`, `ambiguous`, `associated_handle`.
- Strict non-merge rule on lexical similarity alone.
- Associated handle semantics and identifier identity preservation.
- User-self singleton referencing.
- Multi-dump context accumulation and canonical sequence (A $\to$ B $\to$ C $\to$ D).
- Interaction with human overrides, mention rebinding, and claim binding audits.
- Idempotency, order-independence, and test suite rigor.

---

## 2. Authoritative Contracts Reviewed

1. [docs/product_contract.md](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/docs/product_contract.md)
2. [docs/context_model_contract.md](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/docs/context_model_contract.md)
3. [docs/entity_resolution_contract.md](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/docs/entity_resolution_contract.md)
4. [docs/semantic_extraction_contract.md](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/docs/semantic_extraction_contract.md)
5. [docs/runtime_pipeline_design.md](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/docs/runtime_pipeline_design.md)
6. [docs/domain_data_schema_and_state_spec.md](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/docs/domain_data_schema_and_state_spec.md)
7. [docs/implementation_architecture.md](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/docs/implementation_architecture.md)
8. [docs/phase_2_design.md](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/docs/phase_2_design.md)
9. [docs/phase_2_1_implementation.md](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/docs/phase_2_1_implementation.md)
10. [docs/phase_2_1_audit.md](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/docs/phase_2_1_audit.md)
11. [docs/phase_2_1_condition_closure.md](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/docs/phase_2_1_condition_closure.md)
12. [docs/phase_2_2_implementation.md](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/docs/phase_2_2_implementation.md)

---

## 3. Implementation Reviewed

- [src/pipeline/resolution/types.ts](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/pipeline/resolution/types.ts)
- [src/pipeline/resolution/candidateGen.ts](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/pipeline/resolution/candidateGen.ts)
- [src/pipeline/resolution/decisionGate.ts](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/pipeline/resolution/decisionGate.ts)
- [src/pipeline/resolution/resolver.ts](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/pipeline/resolution/resolver.ts)
- [src/pipeline/resolution/accumulator.ts](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/pipeline/resolution/accumulator.ts)
- [src/pipeline/resolution/index.ts](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/pipeline/resolution/index.ts)
- [src/pipeline/__tests__/entityResolution.test.ts](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/pipeline/__tests__/entityResolution.test.ts)
- [src/storage/contextStore.ts](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/storage/contextStore.ts)
- [src/storage/entityRepo.ts](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/storage/entityRepo.ts)
- [src/storage/claimRepo.ts](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/storage/claimRepo.ts)
- [src/domain/stateMachines.ts](file:///Users/yudhan/Documents/FRAMEWORKS/map_of_chaos/src/domain/stateMachines.ts)

---

## 4. Overall Assessment

**PASS WITH CONDITIONS**

The Phase 2.2 implementation successfully constructs a dedicated Entity Resolution subsystem that fulfills the core product requirement of context accumulation over node duplication. When processing the canonical A $\to$ B $\to$ C $\to$ D dump sequence, it preserves the distinction between social handles and businesses, links handles via relational assertions without destructive renaming, correctly maps 1st-person pronouns to the singleton user entity, and enforces human override precedence.

However, the read-only audit revealed two high-risk edge cases in type compatibility and ordering, one medium issue regarding dropped claims for ambiguous mentions, and one medium idempotency lifecycle defect during dump reprocessing.

---

## 5. Contract Compliance Matrix

| Area | Contract Requirement | Implementation Status | Notes |
|---|---|---|---|
| **Candidate Generation** | Surfaces candidates without making merge decisions; flags signal strength | **COMPLIANT** | `CandidateGenerator` separates matching from decision logic. |
| **Resolution Authority** | Lexical similarity alone has zero merge authority | **COMPLIANT** | `DecisionGate` step 7 routes lexical-only matches to `new_entity`. |
| **matched_existing** | Enriches existing entity when evidence is safe and unique | **COMPLIANT** | Reuses entity ID; avoids duplicating nodes. |
| **new_entity** | Mints new entity for distinct entities; disambiguates slug collisions | **COMPLIANT** | Collision loop prevents overwriting distinct entities. |
| **ambiguous** | First-class outcome when multiple candidates exist (homonyms) | **COMPLIANT** | Preserves candidate list; does not guess. |
| **associated_handle** | Retains handle identifier identity while linking to parent entity | **COMPLIANT** | Mints handle entity, enriches parent's `associatedHandles`, creates relational claim. |
| **Lexical Similarity Safety** | Never auto-merges similar strings (e.g. `freshbeda` vs `Freshbeda`) | **CONDITIONALLY COMPLIANT** | Compliant in forward sequence; breaks if Dump C precedes Dump A (Finding 1). |
| **User Self** | `saya`, `aku`, `me` resolve to singleton `USER_SELF_ENTITY_ID` | **COMPLIANT** | Anchored to persistent `ent-user-self` entity in `ContextStore`. |
| **Identity vs Identifier** | Distinguishes entity identity from handle representations | **COMPLIANT** | Explicit relational claims link handles to organizations. |
| **Context Accumulation** | Sequential dumps enrich existing entities without node duplication | **COMPLIANT** | Verified in canonical sequence tests. |
| **Human Override** | Human decisions supersede machine decisions and are locked | **COMPLIANT** | `DecisionGate` priority 1 honors active human override records. |
| **Rebinding** | Rebinds subject/object claims with immutable audit log | **COMPLIANT** | `ContextStore.rebindMention` records `ClaimBindingAudit`. |
| **Provenance** | Every decision preserves rationale, candidates, and source | **COMPLIANT** | `EntityResolution` persisted with rationale and confidence. |
| **Claim Binding** | Extracted claims bind to resolved entities | **CONDITIONALLY COMPLIANT** | Claims with ambiguous subject mentions are currently dropped (Finding 3). |
| **Idempotency** | Reprocessing a dump does not duplicate entities or claims | **CONDITIONALLY COMPLIANT** | Claims are reinforced, but duplicate active `EntityResolution` records are created (Finding 4). |
| **Reprocessing** | Reprocessing respects human overrides | **COMPLIANT** | Verified in Test 13. |
| **Storage** | Uses IndexedDB typed repositories; no localStorage | **COMPLIANT** | Uses `ContextStore` and typed repositories. |
| **Architectural Boundary** | No Graph Projection, MapCanvas, Wander, or AI memory services | **COMPLIANT** | Completely clean domain/pipeline boundary. |

---

## 6. Canonical Instagram Audit

The canonical sequence was traced through the implementation:

### Dump A:
`"Saya punya 5 akun Instagram: freshbeda, yudhan.sebastian, nalakara.id, rampainusa, matatua."`
- **Extracted:** 5 mentions with `candidateTypeHint: 'social_handle'`, 1 user mention (`saya`), 5 account ownership claims, 1 cardinality claim (quantity: 5).
- **Resolution:** All 5 handles resolve to `new_entity` with `associatedHandles: [handle]`. `saya` resolves to `ent-user-self`.
- **Accumulated Entities:** `ent-user-self`, `ent-freshbeda`, `ent-yudhan_sebastian`, `ent-nalakara_id`, `ent-rampainusa`, `ent-matatua`.
- **Accumulated Claims:** 5 `owns_social_account` claims on `ent-user-self`, 1 `owns_asset` cardinality claim on `ent-user-self`.

### Dump B:
`"Nalakara adalah salah satu lini usaha saya, bergerak di bidang teknologi dan AI."`
- **Extracted:** `Nalakara` (company), `saya` (person), 3 business claims.
- **Resolution:** `Nalakara` candidate scan detects lexical overlap with `ent-nalakara_id` (score: 0.6). `DecisionGate` rejects lexical overlap and creates `new_entity` (`ent-nalakara`).
- **Accumulated Entities:** `ent-nalakara`.
- **Accumulated Claims:** `operates_business: 'Nalakara'`, `operates_in_sector: 'teknologi'`, `focuses_on_domain: 'AI'` attached to `ent-nalakara`.

### Dump C:
`"Freshbeda adalah lini usaha saya yang berhubungan dengan visual design."`
- **Extracted:** `Freshbeda` (company), `saya` (person), domain claim.
- **Resolution:** `CandidateGenerator` detects exact handle match with `ent-freshbeda`. However, `checkTypeCompatibility` detects that `ent-freshbeda` is a social handle (from Dump A claims) whereas `Freshbeda` is a company (`typeCompatibility: 'mismatch'`).
- **Decision:** `DecisionGate` step 6b isolates the candidate due to ontological mismatch and issues `new_entity`.
- **Accumulation:** `accumulator.ts` detects slug collision on `ent-freshbeda` and disambiguates the ID to `ent-freshbeda-company`.
- **Invariant Preserved:** `freshbeda` (handle) and `Freshbeda` (company) remain separate persistent entities.

### Dump D:
`"nalakara.id adalah akun Instagram untuk Nalakara."`
- **Extracted:** `nalakara.id` (handle), `Nalakara` (company), relational claim `has_social_account`.
- **Resolution:**
  - `Nalakara` resolves as `matched_existing` to `ent-nalakara`.
  - `nalakara.id` matches explicit relational link in extraction. Resolves as `associated_handle`:
    - `targetEntityId`: `ent-nalakara_id` (preserves handle identity)
    - `associatedHandle.parentEntityId`: `ent-nalakara`
- **Accumulation:**
  - `ent-nalakara` receives `'nalakara.id'` in `associatedHandles`.
  - Relational claim `has_social_account` connects `subjectEntityId: 'ent-nalakara'` to `objectValue: { type: 'entity_id', value: 'ent-nalakara_id' }`.
  - No duplicate `Nalakara` entity is created.

---

## 7. Findings

### F-2.2-01 — Order-Dependent False Merge of Handle into Existing Company (HIGH)

**Observation:**
In `src/pipeline/resolution/decisionGate.ts` lines 111–128:
```typescript
    // 5. Handle / Identifier Candidate Handling
    if (mention.candidateTypeHint === 'social_handle') {
      // Check if an existing entity represents this exact handle
      const exactHandleEntity = context.existingEntities.find(
        (e) =>
          e.canonicalName.toLowerCase() === mention.normalizedForm ||
          e.associatedHandles.map((h) => h.toLowerCase()).includes(mention.normalizedForm)
      );

      if (exactHandleEntity) {
        return {
          mentionId: mention.id,
          surfaceForm: mention.surfaceForm,
          outcome: 'matched_existing',
          targetEntityId: exactHandleEntity.id,
          confidence: 0.95,
          rationale: `Matches existing identifier representation ${exactHandleEntity.id}`,
        };
      }
```
If a business entity already exists (e.g. `Freshbeda` from Dump C), and a subsequent dump introduces the Instagram handle `freshbeda` without relational evidence (e.g. Dump A processed after Dump C):
`e.canonicalName.toLowerCase() === mention.normalizedForm` evaluates to `true` on the company entity `Freshbeda`. Step 5 unconditionally classifies the company entity as an "existing identifier representation" and merges `freshbeda` into `Freshbeda` as `matched_existing`.

**Evidence:**
Empirically verified by executing Dump C before Dump A in a test script:
```
Dump C created: [ { id: 'ent-freshbeda', name: 'Freshbeda', handles: [] } ]
Dump A decision for freshbeda: {
  outcome: 'matched_existing',
  targetEntityId: 'ent-freshbeda',
  rationale: 'Matches existing identifier representation ent-freshbeda'
}
```
`freshbeda` (Instagram handle) was falsely merged into `Freshbeda` (company) solely because Dump C preceded Dump A.

**Why it matters:**
Map of Chaos requires entity resolution to be robust to observation order. A social handle declared after a company must not be auto-merged into that company simply because their normalized names coincide.

**Contract affected:**
- `docs/entity_resolution_contract.md` (Authority Matrix & False Merge Invariant)
- Section 5 of Phase 2.2 Product Requirement

**Recommended action:**
In `DecisionGate` Step 5, ensure `exactHandleEntity` represents an identifier/handle (e.g., checks `typeCompatibility !== 'mismatch'`, or checks that `exactHandleEntity` has handle claims or `associatedHandles` matching the mention), rather than matching any entity whose `canonicalName` coincides.

---

### F-2.2-02 — Intra-Batch False Merge of Company into Social Handle (HIGH)

**Observation:**
In `src/pipeline/resolution/candidateGen.ts` lines 156–184:
`checkTypeCompatibility` evaluates whether an entity is a `social_handle` or `company` exclusively by filtering `context.existingClaims`.
When two mentions appear in the *same dump* (e.g., `"freshbeda adalah akun instagram. Freshbeda adalah perusahaan desain."`):
1. `freshbeda` resolves first to `new_entity`, adding a simulated entity to `dynamicContext.existingEntities` with `associatedHandles: ['freshbeda']`.
2. When `Freshbeda` resolves second, `checkTypeCompatibility` queries `context.existingClaims` for the simulated entity. Because claims are only persisted at the end of the accumulator pass, `existingClaims` contains 0 claims for the simulated entity.
3. Both `isEntitySocialHandle` and `isEntityCompany` evaluate to `false`, causing `checkTypeCompatibility` to return `'compatible'`.
4. `DecisionGate` Step 6 merges `Freshbeda` (company) into `ent-freshbeda` (handle) as `matched_existing`.

**Evidence:**
Verified in test execution:
```
m1 (freshbeda, social_handle) -> outcome: new_entity
m2 (Freshbeda, company)       -> outcome: matched_existing ent-freshbeda
```

**Why it matters:**
If a user mentions their handle and their company in the same dump, the system falsely merges the company into the handle instead of keeping them distinct.

**Contract affected:**
- `docs/entity_resolution_contract.md` (Authority Matrix)
- Section 5 of Phase 2.2 Product Requirement

**Recommended action:**
`CandidateGenerator.checkTypeCompatibility` should inspect type hints from the simulated entity / proposed entity and claims in `context.currentExtraction.claims`, rather than exclusively relying on already-persisted `context.existingClaims`.

---

### F-2.2-03 — Ambiguous Mention Claims Dropped from Context Store (MEDIUM)

**Observation:**
In `src/pipeline/resolution/accumulator.ts` lines 199–200:
```typescript
      // If subject entity cannot be determined, skip claim accumulation to prevent orphaned assertions
      if (!subjectEntityId) continue;
```
When a subject mention resolves to `ambiguous`, its `targetEntityId` is undefined. The accumulator silently drops the claim from persistence.
Furthermore, in `ContextStore.rebindMention`:
```typescript
        const oldEntityId = currentResolution?.targetEntityId;
        if (oldEntityId && oldEntityId !== newEntityId) {
          const subjectClaims = await txClaims.getClaimsBySubject(oldEntityId);
```
`rebindMention` only rebinds claims that were previously bound to `oldEntityId`. Because the claim for the ambiguous mention was never persisted, human rebinding of the ambiguous mention cannot bind the dropped claim.

**Why it matters:**
The user stated a fact, but because the subject was ambiguous, the assertion was discarded rather than retained in an ungrounded or pending state. Later human resolution cannot recover the assertion without re-extracting the original dump.

**Contract affected:**
- `docs/context_model_contract.md` (Claim Model & Grounding)
- `docs/domain_data_schema_and_state_spec.md`

**Recommended action:**
Allow ungrounded/ambiguous claims to be persisted with a provisional or pending subject reference, or record the mention-to-claim association in a pending store so `rebindMention` can bind them when the ambiguity is resolved.

---

### F-2.2-04 — Accumulator Idempotency: Duplicate Active Resolutions on Reprocessing (MEDIUM)

**Observation:**
In `src/pipeline/resolution/accumulator.ts` lines 166–175:
```typescript
      const resRecord = createEntityResolution({
        mentionId: decision.mentionId,
        outcome: decision.outcome,
        targetEntityId: decision.targetEntityId,
        confidence: decision.confidence,
        rationale: decision.rationale,
        createdBy: 'machine',
        candidateEntityIds: decision.candidateEntityIds,
      });
      await this.contextStore.entities.saveResolution(resRecord);
```
When a dump is accumulated a second time, `createEntityResolution` writes a new `resRecord` with `status: 'active'`. It does not check if an active resolution already exists for that `mentionId` nor mark the prior record as `superseded`.
This leaves multiple records with `status: 'active'` for a single mention in `STORES.ENTITY_RESOLUTIONS`. When `getActiveResolutionForMention` is called, it returns `resolutions[0]` (the oldest record), ignoring the reprocessed result.

**Why it matters:**
Violates the state transition model where each mention has at most one active resolution record.

**Contract affected:**
- `docs/runtime_pipeline_design.md` (Idempotency and Re-evaluation Invariant)
- `docs/domain_data_schema_and_state_spec.md` (Resolution lifecycle)

**Recommended action:**
Before persisting `resRecord`, query active resolutions for `decision.mentionId`. If an existing machine resolution exists, transition it to `superseded` before saving the new resolution.

---

### F-2.2-05 — Encapsulation Leak: Private Storage Driver Access in Accumulator (LOW)

**Observation:**
In `src/pipeline/resolution/accumulator.ts` line 51 & 53:
```typescript
    const existingResolutions = await this.contextStore.entities.getResolutionsForMention('');
    const allResolutions = await (this.contextStore as any).driver.getAll('entity_resolutions');
```
Line 51 queries IndexedDB index `'mentionId'` with an empty string, which is dead code. Line 53 casts `this.contextStore` to `any` to access its private `driver`.

**Why it matters:**
Bypasses the repository pattern and breaks encapsulation.

**Contract affected:**
- `docs/implementation_architecture.md` (Layer Boundaries)

**Recommended action:**
Expose a typed method `getAllResolutions()` on `EntityRepository` and `ContextStore`.

---

### F-2.2-06 — Claim Mention Binding Ignores Character Offsets (LOW)

**Observation:**
In `src/pipeline/resolution/accumulator.ts` lines 184–188:
```typescript
      const subjMention = grounded.mentions.find(
        (m) =>
          m.surfaceForm.toLowerCase() ===
          cCandidate.subjectMentionSurface?.toLowerCase()
      );
```
`grounded.mentions.find(...)` matches solely by string equality. If a dump contains multiple occurrences of the same surface form with different entity resolutions, the claim always attaches to the first occurrence regardless of token span or offset proximity.

**Why it matters:**
In dumps with homonyms or repeated words, claims may bind to the wrong mention instance.

**Contract affected:**
- `docs/semantic_extraction_contract.md` (Offset grounding)

**Recommended action:**
Correlate claims with mentions using span overlap (`startOffset` and `endOffset`) in addition to surface form.

---

## 8. Test Quality Assessment

The Phase 2.2 test suite contains 18 well-structured integration tests in `src/pipeline/__tests__/entityResolution.test.ts`.

### Tested Invariants (Strong):
- Canonical sequence context accumulation (A $\to$ B $\to$ C $\to$ D).
- Exact match node reuse without duplicating nodes (`Nalakara`).
- Strict non-merge on lexical overlap alone (`Apple` vs `Apple Indonesia`).
- Homonym ambiguity preservation (`Mercury`).
- Explicit relational handle linking (`has_social_account`).
- Multiple handles on a single entity (`nalakara.id`, `nalakara_tw`).
- User-self singleton resolution (`saya` $\to$ `USER_SELF_ENTITY_ID`).
- Quantity and activity claims without artificial entity generation.
- Rebinding of subject and object claims with `ClaimBindingAudit`.
- Human override precedence and machine lock.

### Untested Risks (Gaps Identified):
1. **Reverse Dump Order:** No test ran Dump C before Dump A to verify that `DecisionGate` Step 5 does not falsely merge `freshbeda` handle into `Freshbeda` company (Finding F-2.2-01).
2. **Intra-batch Handle + Company:** No test evaluated a single dump containing both the handle and company surface forms (Finding F-2.2-02).
3. **Reprocessing Idempotency:** Tests assert clean accumulation once, but do not execute `accumulator.accumulate` twice on the same dump to verify resolution lifecycle states (Finding F-2.2-04).
4. **Ambiguous Mention Rebinding:** Tests rebind entities that were already resolved, but do not test rebinding a mention that initially resolved as `ambiguous` (Finding F-2.2-03).

---

## 9. Deferred / Accepted Limitations

1. **Deterministic Rule Scope:** The deterministic authority matrix is intentionally rule-based (V0). An LLM-assisted candidate generator is intentionally deferred.
2. **Cross-Platform Handle Collisions:** Disambiguating two accounts on different platforms sharing identical handles is deferred to future qualifier enrichment.
3. **Graph Projection & Visualization:** Deferred to Phase 3.

---

## 10. Required Conditions Before Closure

The following conditions must be resolved before Phase 2.2 can be considered **CLOSED**:

### CONDITION 1 — Reverse-Order Handle Separation (Resolves F-2.2-01)
Update `DecisionGate` Step 5 to ensure that an incoming `social_handle` mention does NOT match an existing entity as an "identifier representation" if that entity is a company or has ontological type mismatch with social handles.

### CONDITION 2 — Intra-Batch Type Compatibility Scoping (Resolves F-2.2-02)
Enhance `CandidateGenerator.checkTypeCompatibility` to inspect the candidate type hint from `simulatedEntity` / `proposedEntity` and `context.currentExtraction.claims`, ensuring intra-batch handle and company mentions do not auto-merge.

### CONDITION 3 — Resolution Reprocessing Idempotency (Resolves F-2.2-04)
In `ContextAccumulator.accumulate`, before writing a new `EntityResolution`, query existing active resolutions for `decision.mentionId`. If a prior machine resolution exists, transition it to `superseded` so that exactly one active resolution exists per mention.

### CONDITION 4 — Encapsulation Cleanliness (Resolves F-2.2-05)
Expose a typed `getAllResolutions()` method on `EntityRepository` and `ContextStore`, eliminating `(this.contextStore as any).driver.getAll('entity_resolutions')`.

---

## 11. Verdict

**PASS WITH CONDITIONS**

Phase 2.2 represents a valid and functional Entity Resolution foundation. The four conditions above must be addressed in a focused Phase 2.2 Condition Closure pass before proceeding to Phase 3.
