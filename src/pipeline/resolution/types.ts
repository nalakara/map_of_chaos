/**
 * Entity Resolution & Context Accumulation Types
 * Defines interfaces for candidate generation, decision gating, and resolution orchestration.
 */

import {
  Claim,
  Dump,
  Entity,
  EntityResolution,
  Mention,
  ResolutionOutcome,
} from '../../domain/types';
import { GroundedExtraction } from '../types';

export const USER_SELF_ENTITY_ID = 'ent-user-self';

export type CandidateMatchType =
  | 'user_self'
  | 'exact_canonical'
  | 'exact_alias'
  | 'exact_handle'
  | 'lexical_similarity';

export interface CandidateMatch {
  entity: Entity;
  matchType: CandidateMatchType;
  score: number; // 0.0 to 1.0
  signals: string[];
  typeCompatibility: 'compatible' | 'mismatch' | 'unknown';
}

export interface ResolutionContext {
  existingEntities: Entity[];
  existingClaims: Claim[];
  existingResolutions: EntityResolution[];
  dump: Dump;
  currentExtraction?: GroundedExtraction;
}

export interface ResolutionDecision {
  mentionId: string;
  surfaceForm: string;
  outcome: ResolutionOutcome;
  targetEntityId?: string;
  confidence: number;
  rationale: string;
  candidateEntityIds?: string[];
  proposedEntity?: {
    canonicalName: string;
    aliases: string[];
    associatedHandles: string[];
    typeHint?: string;
  };
  associatedHandle?: {
    handle: string;
    parentEntityId?: string;
  };
}

export interface IEntityResolver {
  readonly version: string;
  resolveMention(mention: Mention, context: ResolutionContext): Promise<ResolutionDecision>;
  resolveAll(
    mentions: Mention[],
    context: ResolutionContext
  ): Promise<Map<string, ResolutionDecision>>;
}

export interface AccumulationResult {
  dumpId: string;
  decisions: ResolutionDecision[];
  createdEntities: Entity[];
  updatedEntities: Entity[];
  accumulatedClaims: Claim[];
}
