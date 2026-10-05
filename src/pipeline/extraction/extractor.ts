/**
 * Semantic Extraction Orchestrator
 * Coordinates extraction engines, invariant gating, and grounding into Evidence & Mention stores.
 */

import {
  Dump,
  Evidence,
  ExtractedClaimCandidate,
  ExtractionResult,
  Mention,
} from '../../domain/types';
import { DumpRepository } from '../../storage/dumpRepo';
import { EntityRepository } from '../../storage/entityRepo';
import { GroundedExtraction, ISemanticExtractor } from '../types';
import { DeterministicSemanticExtractor } from './deterministic';
import { InvariantGate } from './invariantGate';

export class SemanticExtractionOrchestrator implements ISemanticExtractor {
  readonly version: string;

  constructor(private engine: ISemanticExtractor = new DeterministicSemanticExtractor()) {
    this.version = `orchestrator-[${engine.version}]`;
  }

  /**
   * Extracts raw semantic candidates and gates them against Dump invariants.
   */
  async extract(dump: Dump): Promise<ExtractionResult> {
    const rawResult = await this.engine.extract(dump);
    return InvariantGate.verify(dump, rawResult);
  }

  /**
   * Extracts candidates and grounds them into persistent Evidence and Mention records.
   * Ensures idempotency: will not recreate duplicates if dump has already been grounded.
   */
  async extractAndGround(
    dump: Dump,
    dumpRepo: DumpRepository,
    entityRepo: EntityRepository
  ): Promise<GroundedExtraction> {
    const verifiedResult = await this.extract(dump);

    // 1. Check existing Evidence for idempotency
    const existingEvidence = await dumpRepo.getEvidenceByDumpId(dump.id);
    const existingMentions = await entityRepo.getMentionsByDumpId(dump.id);

    // Helper to get or save Evidence with idempotency
    const evidenceKey = (start: number, end: number, span: string) => `${start}:${end}:${span}`;
    const evidenceMap = new Map<string, Evidence>();
    existingEvidence.forEach((ev) => {
      evidenceMap.set(evidenceKey(ev.startOffset, ev.endOffset, ev.textSpan), ev);
      evidenceMap.set(ev.textSpan, ev);
    });

    const groundedEvidenceList: Evidence[] = [...existingEvidence];
    const groundedMentionList: Mention[] = [...existingMentions];
    const now = new Date().toISOString();

    const ensureEvidence = async (
      startOffset: number,
      endOffset: number,
      textSpan: string
    ): Promise<Evidence> => {
      const key = evidenceKey(startOffset, endOffset, textSpan);
      let ev = evidenceMap.get(key) || evidenceMap.get(textSpan);
      if (!ev) {
        ev = {
          id: `ev-${dump.id}-${startOffset}-${endOffset}`,
          dumpId: dump.id,
          textSpan,
          startOffset,
          endOffset,
          createdAt: now,
        };
        await dumpRepo.saveEvidence(ev);
        evidenceMap.set(key, ev);
        evidenceMap.set(textSpan, ev);
        groundedEvidenceList.push(ev);
      }
      return ev;
    };

    // 2. Persist Evidence spans for Mentions
    for (const mention of verifiedResult.mentions) {
      await ensureEvidence(mention.startOffset, mention.endOffset, mention.textSpan);
    }

    // 3. Persist Mentions
    for (const mCandidate of verifiedResult.mentions) {
      const ev = await ensureEvidence(
        mCandidate.startOffset,
        mCandidate.endOffset,
        mCandidate.textSpan
      );

      const alreadyExists = groundedMentionList.some(
        (m) =>
          m.surfaceForm === mCandidate.surfaceForm &&
          m.evidenceId === ev.id
      );

      if (!alreadyExists) {
        const mention: Mention = {
          id: `men-${dump.id}-${mCandidate.startOffset}-${mCandidate.endOffset}`,
          dumpId: dump.id,
          evidenceId: ev.id,
          surfaceForm: mCandidate.surfaceForm,
          normalizedForm: mCandidate.surfaceForm.toLowerCase(),
          candidateTypeHint: mCandidate.typeHint,
          createdAt: now,
        };
        await entityRepo.saveMention(mention);
        groundedMentionList.push(mention);
      }
    }

    // 4. Persist Evidence spans for Claims & bind evidenceId
    const groundedClaimsList: ExtractedClaimCandidate[] = [];
    for (const claim of verifiedResult.claims) {
      const ev = await ensureEvidence(
        claim.startOffset,
        claim.endOffset,
        claim.textSpan
      );
      groundedClaimsList.push({
        ...claim,
        evidenceId: ev.id,
      });
    }

    return {
      dump,
      evidence: groundedEvidenceList,
      mentions: groundedMentionList,
      claims: groundedClaimsList,
      rawObservations: verifiedResult.rawObservations,
    };
  }
}
