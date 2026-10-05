/**
 * Pipeline Types for Map of Chaos
 * Defines interfaces for Semantic Extraction, Invariant Gating, and Grounding.
 */

import {
  Dump,
  Evidence,
  ExtractedClaimCandidate,
  ExtractedMentionCandidate,
  ExtractionResult,
  Mention,
} from '../domain/types';

export interface ISemanticExtractor {
  readonly version: string;
  extract(dump: Dump): Promise<ExtractionResult>;
}

export interface GroundedExtraction {
  dump: Dump;
  evidence: Evidence[];
  mentions: Mention[];
  claims: ExtractedClaimCandidate[];
  rawObservations: string[];
}

export interface ExtractionOptions {
  strictGrounding?: boolean;
  minConfidenceThreshold?: number;
}
