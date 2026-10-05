/**
 * Invariant Verification Gate for Semantic Extraction
 * Enforces Zero-Fabrication Invariant:
 * Every extracted mention and claim candidate must be provably grounded in dump.rawText.
 */

import {
  Dump,
  ExtractedClaimCandidate,
  ExtractedMentionCandidate,
  ExtractionResult,
} from '../../domain/types';
import { findExactSpan } from './normalizer';

export class InvariantGate {
  /**
   * Verifies and sanitizes an ExtractionResult against the source Dump rawText.
   * Discards candidates that cannot be grounded in raw text slices.
   */
  static verify(dump: Dump, result: ExtractionResult): ExtractionResult {
    const verifiedMentions: ExtractedMentionCandidate[] = [];
    const verifiedClaims: ExtractedClaimCandidate[] = [];

    // 1. Verify Mentions
    for (const mention of result.mentions) {
      let start = mention.startOffset;
      let end = mention.endOffset;
      let span = mention.textSpan;

      // Verify slice
      const actualSlice = dump.rawText.slice(start, end);
      if (actualSlice !== span) {
        // Attempt recovery via exact substring search
        const recovered = findExactSpan(dump.rawText, span);
        if (recovered) {
          start = recovered.startOffset;
          end = recovered.endOffset;
          span = recovered.textSpan;
        } else {
          // Span cannot be grounded in dump raw text -> discard
          continue;
        }
      }

      // Verify that surfaceForm is grounded in textSpan
      if (!span.toLowerCase().includes(mention.surfaceForm.toLowerCase())) {
        continue;
      }

      verifiedMentions.push({
        ...mention,
        startOffset: start,
        endOffset: end,
        textSpan: span,
      });
    }

    // 2. Verify Claims
    for (const claim of result.claims) {
      let start = claim.startOffset;
      let end = claim.endOffset;
      let span = claim.textSpan;

      const actualSlice = dump.rawText.slice(start, end);
      if (actualSlice !== span) {
        const recovered = findExactSpan(dump.rawText, span);
        if (recovered) {
          start = recovered.startOffset;
          end = recovered.endOffset;
          span = recovered.textSpan;
        } else {
          continue;
        }
      }

      verifiedClaims.push({
        ...claim,
        startOffset: start,
        endOffset: end,
        textSpan: span,
      });
    }

    return {
      dumpId: dump.id,
      extractorVersion: result.extractorVersion,
      mentions: verifiedMentions,
      claims: verifiedClaims,
      rawObservations: result.rawObservations || [],
      executedAt: result.executedAt || new Date().toISOString(),
    };
  }
}
