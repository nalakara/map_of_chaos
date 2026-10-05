/**
 * Deterministic Entity Resolver
 * Implements IEntityResolver coordinating Candidate Generation and Decision Gating.
 */

import { Mention } from '../../domain/types';
import { CandidateGenerator } from './candidateGen';
import { DecisionGate } from './decisionGate';
import {
  IEntityResolver,
  ResolutionContext,
  ResolutionDecision,
} from './types';

export class DeterministicEntityResolver implements IEntityResolver {
  readonly version = 'resolver-deterministic-v1.0.0';

  /**
   * Resolves a single mention against existing context.
   */
  async resolveMention(
    mention: Mention,
    context: ResolutionContext
  ): Promise<ResolutionDecision> {
    const candidates = CandidateGenerator.generateCandidates(mention, context);
    return DecisionGate.decide(mention, candidates, context);
  }

  /**
   * Resolves a collection of mentions from a dump in order.
   */
  async resolveAll(
    mentions: Mention[],
    context: ResolutionContext
  ): Promise<Map<string, ResolutionDecision>> {
    const decisionMap = new Map<string, ResolutionDecision>();

    // Copy context to allow incremental entity tracking within the batch
    const dynamicContext: ResolutionContext = {
      ...context,
      existingEntities: [...context.existingEntities],
      existingResolutions: [...context.existingResolutions],
    };

    for (const mention of mentions) {
      const decision = await this.resolveMention(mention, dynamicContext);
      decisionMap.set(mention.id, decision);

      // If a new entity or handle is proposed, simulate its availability in context
      if (
        (decision.outcome === 'new_entity' || decision.outcome === 'associated_handle') &&
        decision.proposedEntity
      ) {
        const tempEntityId = decision.targetEntityId || `ent-${decision.proposedEntity.canonicalName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
        const simulatedEntity = {
          id: tempEntityId,
          canonicalName: decision.proposedEntity.canonicalName,
          aliases: decision.proposedEntity.aliases,
          associatedHandles: decision.proposedEntity.associatedHandles,
          typeHint: decision.proposedEntity.typeHint,
          epistemicStatus: 'unverified' as const,
          resolutionStatus: 'resolved' as const,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        if (!dynamicContext.existingEntities.some((e) => e.id === tempEntityId)) {
          dynamicContext.existingEntities.push(simulatedEntity);
        }
      }
    }

    return decisionMap;
  }
}
