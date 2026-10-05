/**
 * Decision Gate for Entity Resolution
 * Implements the Strict Authority Matrix:
 * - Human overrides take precedence over machine decisions
 * - Lexical similarity has ZERO authority to merge
 * - Ambiguity is a first-class outcome (prefer ambiguous over false merge)
 * - Associated handles retain identifier identity
 */

import { Mention } from '../../domain/types';
import { CandidateGenerator } from './candidateGen';
import {
  CandidateMatch,
  ResolutionContext,
  ResolutionDecision,
  USER_SELF_ENTITY_ID,
} from './types';

export class DecisionGate {
  /**
   * Evaluates candidates and context to reach a definitive ResolutionDecision.
   */
  static decide(
    mention: Mention,
    candidates: CandidateMatch[],
    context: ResolutionContext
  ): ResolutionDecision {
    // 1. Human Override Check
    const activeResolution = context.existingResolutions.find(
      (r) => r.mentionId === mention.id && r.status === 'active'
    );
    if (activeResolution && activeResolution.createdBy === 'human_override') {
      return {
        mentionId: mention.id,
        surfaceForm: mention.surfaceForm,
        outcome: activeResolution.outcome,
        targetEntityId: activeResolution.targetEntityId,
        confidence: 1.0,
        rationale: `Preserving active human override: ${activeResolution.overrideReason || 'User decision'}`,
      };
    }

    // 2. User Self Anchoring
    const userCandidate = candidates.find((c) => c.matchType === 'user_self');
    if (userCandidate) {
      return {
        mentionId: mention.id,
        surfaceForm: mention.surfaceForm,
        outcome: 'matched_existing',
        targetEntityId: USER_SELF_ENTITY_ID,
        confidence: 1.0,
        rationale: 'First-person user reference resolved to singleton user context',
      };
    }

    // 3. Check for Explicit Relational Link (Associated Handle)
    const relationalCandidate = candidates.find(
      (c) => c.signals.includes('explicit_relational_link')
    );
    if (relationalCandidate) {
      // Find existing handle entity for this handle, or propose a new handle entity representation
      const existingHandleEntity = context.existingEntities.find(
        (e) =>
          e.canonicalName.toLowerCase() === mention.normalizedForm ||
          e.associatedHandles.map((h) => h.toLowerCase()).includes(mention.normalizedForm)
      );

      const targetHandleEntityId = existingHandleEntity?.id;

      return {
        mentionId: mention.id,
        surfaceForm: mention.surfaceForm,
        outcome: 'associated_handle',
        targetEntityId: targetHandleEntityId,
        confidence: 0.95,
        rationale: `Explicit relational assertion associates handle ${mention.surfaceForm} with entity ${relationalCandidate.entity.canonicalName} while retaining handle identity`,
        associatedHandle: {
          handle: mention.surfaceForm,
          parentEntityId: relationalCandidate.entity.id,
        },
        proposedEntity: !existingHandleEntity
          ? {
              canonicalName: mention.surfaceForm,
              aliases: [],
              associatedHandles: [mention.surfaceForm],
              typeHint: 'social_handle',
            }
          : undefined,
      };
    }

    // 4. Ambiguity Evaluation (Homonyms or Multiple Plausible Candidates)
    const strongMatches = candidates.filter(
      (c) =>
        (c.matchType === 'exact_canonical' || c.matchType === 'exact_alias' || c.matchType === 'exact_handle') &&
        c.typeCompatibility !== 'mismatch'
    );

    if (strongMatches.length > 1) {
      // Multiple candidates share the same canonical name or alias (Homonyms, e.g. "Mercury" company vs planet)
      return {
        mentionId: mention.id,
        surfaceForm: mention.surfaceForm,
        outcome: 'ambiguous',
        confidence: 0.5,
        candidateEntityIds: strongMatches.map((c) => c.entity.id),
        rationale: `Multiple existing entities (${strongMatches.map((c) => c.entity.id).join(', ')}) share name '${mention.surfaceForm}' without discriminating context`,
      };
    }

    // 5. Handle / Identifier Candidate Handling
    if (mention.candidateTypeHint === 'social_handle') {
      // Check if an existing entity represents this exact handle
      // An entity represents this handle if it explicitly contains it in associatedHandles
      // OR its canonicalName matches AND it does NOT have an ontological type mismatch (e.g. company).
      const exactHandleEntity = context.existingEntities.find((e) => {
        const matchesHandle =
          e.associatedHandles.map((h) => h.toLowerCase()).includes(mention.normalizedForm) ||
          e.canonicalName.toLowerCase() === mention.normalizedForm;
        if (!matchesHandle) return false;

        const candidate = candidates.find((c) => c.entity.id === e.id);
        if (candidate && candidate.typeCompatibility === 'mismatch') return false;

        const typeCompat = CandidateGenerator.checkTypeCompatibility(mention, e, context);
        return typeCompat !== 'mismatch';
      });

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

      // If no exact handle entity exists, instantiate a distinct handle representation
      // MUST NOT merge with any business entity with similar name
      return {
        mentionId: mention.id,
        surfaceForm: mention.surfaceForm,
        outcome: 'new_entity',
        confidence: 0.95,
        rationale: `Minting distinct social handle representation for ${mention.surfaceForm}`,
        proposedEntity: {
          canonicalName: mention.surfaceForm,
          aliases: [],
          associatedHandles: [mention.surfaceForm],
          typeHint: 'social_handle',
        },
      };
    }

    // 6. Single Strong Match Evaluation
    if (strongMatches.length === 1) {
      const best = strongMatches[0];

      // Check if there is a type mismatch (e.g. social_handle vs company)
      if (best.typeCompatibility === 'mismatch') {
        return {
          mentionId: mention.id,
          surfaceForm: mention.surfaceForm,
          outcome: 'new_entity',
          confidence: 0.9,
          rationale: `Surface form matches existing entity ${best.entity.id} but ontological category differs (channel vs company); kept separate`,
          proposedEntity: {
            canonicalName: mention.surfaceForm,
            aliases: [],
            associatedHandles: [],
            typeHint: mention.candidateTypeHint,
          },
        };
      }

      // Legitimate match
      return {
        mentionId: mention.id,
        surfaceForm: mention.surfaceForm,
        outcome: 'matched_existing',
        targetEntityId: best.entity.id,
        confidence: best.score,
        rationale: `Exact ${best.matchType === 'exact_alias' ? 'alias' : 'canonical'} match with entity ${best.entity.id}`,
      };
    }

    // 6b. Mismatched Type Evaluation (Explicit Separation)
    const mismatchedCandidates = candidates.filter(
      (c) =>
        (c.matchType === 'exact_canonical' ||
          c.matchType === 'exact_alias' ||
          c.matchType === 'exact_handle') &&
        c.typeCompatibility === 'mismatch'
    );
    if (mismatchedCandidates.length > 0 && strongMatches.length === 0) {
      return {
        mentionId: mention.id,
        surfaceForm: mention.surfaceForm,
        outcome: 'new_entity',
        confidence: 0.9,
        candidateEntityIds: mismatchedCandidates.map((c) => c.entity.id),
        rationale: `Surface form matches existing entity (${mismatchedCandidates.map((c) => c.entity.id).join(', ')}), but ontological category differs; kept separate`,
        proposedEntity: {
          canonicalName: mention.surfaceForm,
          aliases: [],
          associatedHandles: [],
          typeHint: mention.candidateTypeHint,
        },
      };
    }

    // 7. Lexical Similarity Alone (Strict Non-Merge Invariant)
    const lexicalMatches = candidates.filter(
      (c) => c.matchType === 'lexical_similarity'
    );
    if (lexicalMatches.length > 0) {
      return {
        mentionId: mention.id,
        surfaceForm: mention.surfaceForm,
        outcome: 'new_entity',
        confidence: 0.9,
        candidateEntityIds: lexicalMatches.map((c) => c.entity.id),
        rationale: `Lexical similarity detected with entities (${lexicalMatches.map((c) => c.entity.canonicalName).join(', ')}), but lexical overlap has zero authority to merge`,
        proposedEntity: {
          canonicalName: mention.surfaceForm,
          aliases: [],
          associatedHandles: [],
          typeHint: mention.candidateTypeHint,
        },
      };
    }

    // 8. No Match -> New Entity
    return {
      mentionId: mention.id,
      surfaceForm: mention.surfaceForm,
      outcome: 'new_entity',
      confidence: 0.9,
      rationale: `No existing entity matches '${mention.surfaceForm}'; minting new entity`,
      proposedEntity: {
        canonicalName: mention.surfaceForm,
        aliases: [],
        associatedHandles: [],
        typeHint: mention.candidateTypeHint,
      },
    };
  }
}
