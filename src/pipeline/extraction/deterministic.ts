/**
 * Deterministic Semantic Extractor for Map of Chaos
 * Implements ISemanticExtractor using rigorous linguistic patterns (Indonesian & English).
 * Extracts grounded mentions and claims without requiring an external cloud LLM.
 */

import {
  Dump,
  ExtractedClaimCandidate,
  ExtractedMentionCandidate,
  ExtractionResult,
} from '../../domain/types';
import { ISemanticExtractor } from '../types';
import {
  findExactSpan,
  getEnclosingClause,
  isUserSelfReference,
  parseNumberWord,
} from './normalizer';

export class DeterministicSemanticExtractor implements ISemanticExtractor {
  readonly version = 'deterministic-v1.0.0';

  async extract(dump: Dump): Promise<ExtractionResult> {
    const mentions: ExtractedMentionCandidate[] = [];
    const claims: ExtractedClaimCandidate[] = [];
    const rawObservations: string[] = [];

    const text = dump.rawText;

    // 1. Check for 1st-person User reference ("Saya", "Aku", "I")
    const userMatch = text.match(/\b(saya|aku|gue|gw|i)\b/i);
    if (userMatch && userMatch.index !== undefined) {
      const surface = userMatch[0];
      mentions.push({
        surfaceForm: surface,
        textSpan: surface,
        startOffset: userMatch.index,
        endOffset: userMatch.index + surface.length,
        typeHint: 'person',
        referenceTarget: 'user_self',
      });
    }

    // 2. Multi-Account Pattern (e.g. "Saya punya 5 akun Instagram: freshbeda, yudhan.sebastian, ...")
    const multiAccountRegex =
      /\b(?:saya\s+)?punya\s+(\d+|[a-zA-Z]+)\s+akun\s+(instagram|twitter|tiktok|x)[\s:]+([^\n]+)/i;
    const multiMatch = text.match(multiAccountRegex);
    if (multiMatch && multiMatch.index !== undefined) {
      const fullMatchSpan = multiMatch[0].trim();
      const countStr = multiMatch[1];
      const platform = multiMatch[2].toLowerCase();
      const accountsStr = multiMatch[3].trim().replace(/\.$/, '');
      const count = parseNumberWord(countStr) || 1;

      // Extract each account handle
      const rawAccounts = accountsStr
        .split(/[,;\s]+/)
        .map((a) => a.trim().replace(/^@/, ''))
        .filter((a) => a.length > 0 && !['dan', 'and', '&'].includes(a.toLowerCase()));

      for (const account of rawAccounts) {
        const spanMatch = findExactSpan(text, account, multiMatch.index);
        if (spanMatch) {
          mentions.push({
            surfaceForm: account,
            textSpan: spanMatch.textSpan,
            startOffset: spanMatch.startOffset,
            endOffset: spanMatch.endOffset,
            typeHint: 'social_handle',
          });

          // Individual account claim candidate
          claims.push({
            subjectMentionSurface: userMatch ? userMatch[0] : 'saya',
            objectMentionSurface: account,
            predicate: 'owns_social_account',
            objectValue: {
              type: 'mention_surface',
              value: account,
            },
            qualifiers: { platform },
            temporalScope: 'present',
            textSpan: spanMatch.textSpan,
            startOffset: spanMatch.startOffset,
            endOffset: spanMatch.endOffset,
            extractionConfidence: 0.95,
          });
        }
      }

      // Aggregate cardinality claim
      const aggSpan = findExactSpan(text, fullMatchSpan) || {
        startOffset: multiMatch.index,
        endOffset: multiMatch.index + fullMatchSpan.length,
        textSpan: fullMatchSpan,
      };

      claims.push({
        subjectMentionSurface: userMatch ? userMatch[0] : 'saya',
        predicate: 'owns_social_account',
        objectValue: {
          type: 'concept',
          value: `${platform}_account`,
        },
        qualifiers: {
          quantity: count,
          platform,
        },
        temporalScope: 'present',
        textSpan: aggSpan.textSpan,
        startOffset: aggSpan.startOffset,
        endOffset: aggSpan.endOffset,
        extractionConfidence: 0.95,
      });

      rawObservations.push(`Extracted ${rawAccounts.length} ${platform} accounts with count ${count}`);
    }

    // 3. Relational or Individual Account Declaration (e.g. "nalakara.id adalah akun Instagram untuk Nalakara." or "freshbeda adalah akun Instagram saya.")
    const accountDeclarationRegex =
      /([a-zA-Z0-9\._]+)\s+adalah\s+akun\s+(instagram|twitter|tiktok|x)(?:\s+(?:untuk\s+([A-Z][a-zA-Z0-9\._\s]+)|(?:milik\s+)?(saya|aku|gue|gw)))?/i;
    const accountDeclMatch = text.match(accountDeclarationRegex);
    if (accountDeclMatch && accountDeclMatch.index !== undefined && !multiMatch) {
      const handle = accountDeclMatch[1].trim();
      const platform = accountDeclMatch[2].toLowerCase();
      const targetEntitySurface = accountDeclMatch[3]?.trim().replace(/[\.\,\s]+$/, '');
      const isForUser = Boolean(accountDeclMatch[4]);
      const fullSpanText = accountDeclMatch[0];

      const handleSpan = findExactSpan(text, handle);
      if (handleSpan && !mentions.some((m) => m.surfaceForm === handle)) {
        mentions.push({
          surfaceForm: handle,
          textSpan: handleSpan.textSpan,
          startOffset: handleSpan.startOffset,
          endOffset: handleSpan.endOffset,
          typeHint: 'social_handle',
        });
      }

      const claimSpan = findExactSpan(text, fullSpanText) || {
        startOffset: accountDeclMatch.index,
        endOffset: accountDeclMatch.index + fullSpanText.length,
        textSpan: fullSpanText,
      };

      if (targetEntitySurface) {
        // Relational claim to target company/entity
        const targetSpan = findExactSpan(text, targetEntitySurface);
        if (targetSpan && !mentions.some((m) => m.surfaceForm === targetEntitySurface)) {
          mentions.push({
            surfaceForm: targetEntitySurface,
            textSpan: targetSpan.textSpan,
            startOffset: targetSpan.startOffset,
            endOffset: targetSpan.endOffset,
            typeHint: 'company',
          });
        }

        claims.push({
          subjectMentionSurface: targetEntitySurface,
          objectMentionSurface: handle,
          predicate: 'has_social_account',
          objectValue: {
            type: 'mention_surface',
            value: handle,
          },
          qualifiers: { platform },
          temporalScope: 'present',
          textSpan: claimSpan.textSpan,
          startOffset: claimSpan.startOffset,
          endOffset: claimSpan.endOffset,
          extractionConfidence: 0.95,
        });

        rawObservations.push(`Extracted relational link: ${targetEntitySurface} -> ${handle}`);
      } else {
        // Individual account of user
        claims.push({
          subjectMentionSurface: userMatch ? userMatch[0] : 'saya',
          objectMentionSurface: handle,
          predicate: 'owns_social_account',
          objectValue: {
            type: 'mention_surface',
            value: handle,
          },
          qualifiers: { platform },
          temporalScope: 'present',
          textSpan: claimSpan.textSpan,
          startOffset: claimSpan.startOffset,
          endOffset: claimSpan.endOffset,
          extractionConfidence: 0.95,
        });

        rawObservations.push(`Extracted user account: ${handle}`);
      }
    }

    // 4. Business Line Patterns (e.g. "Nalakara adalah salah satu lini usaha saya, bergerak di bidang teknologi dan AI.")
    const businessLineRegex =
      /([A-Z][a-zA-Z0-9\s]+?)\s+adalah\s+(?:(salah\s+satu\s+|lain\s+)?lini\s+usaha(?:\s+saya)?)(?:,\s*bergerak\s+(?:di|dalam)\s+bidang\s+([^\n\.]+)|(?:\s+yang)?\s+berhubungan\s+dengan\s+([^\n\.]+))?/i;
    const bizMatch = text.match(businessLineRegex);
    if (bizMatch && bizMatch.index !== undefined) {
      const entityName = bizMatch[1].trim();
      const isOneOf = Boolean(bizMatch[2] && bizMatch[2].includes('salah satu'));
      const sectorsStr = (bizMatch[3] || bizMatch[4] || '').trim();
      const fullSpanText = bizMatch[0];

      const entitySpan = findExactSpan(text, entityName);
      if (entitySpan && !mentions.some((m) => m.surfaceForm === entityName)) {
        mentions.push({
          surfaceForm: entityName,
          textSpan: entitySpan.textSpan,
          startOffset: entitySpan.startOffset,
          endOffset: entitySpan.endOffset,
          typeHint: 'company',
        });
      }

      const bizClaimSpan = findExactSpan(text, fullSpanText) || {
        startOffset: bizMatch.index,
        endOffset: bizMatch.index + fullSpanText.length,
        textSpan: fullSpanText,
      };

      // Claim 1: User operates business with partitivity
      claims.push({
        subjectMentionSurface: userMatch ? userMatch[0] : 'saya',
        objectMentionSurface: entityName,
        predicate: 'operates_business',
        objectValue: {
          type: 'mention_surface',
          value: entityName,
        },
        qualifiers: {
          category: 'business_line',
          ...(isOneOf ? { partitivity: 'one_of_several_business_lines' } : {}),
        },
        temporalScope: 'present',
        textSpan: bizClaimSpan.textSpan,
        startOffset: bizClaimSpan.startOffset,
        endOffset: bizClaimSpan.endOffset,
        extractionConfidence: 0.95,
      });

      // Claim 2+: Sector/Domain claims
      if (sectorsStr) {
        const sectorTokens = sectorsStr
          .split(/\s*(?:,|dan|and|&)\s*/)
          .map((s) => s.trim())
          .filter((s) => s.length > 0);

        for (const token of sectorTokens) {
          const tokenSpan = findExactSpan(text, token, bizMatch.index) || bizClaimSpan;
          claims.push({
            subjectMentionSurface: entityName,
            predicate: bizMatch[4] ? 'focuses_on_domain' : 'operates_in_sector',
            objectValue: {
              type: 'concept',
              value: token,
            },
            temporalScope: 'present',
            textSpan: tokenSpan.textSpan,
            startOffset: tokenSpan.startOffset,
            endOffset: tokenSpan.endOffset,
            extractionConfidence: 0.9,
          });
        }
      }
    }

    // 4b. Direct Business Operation / Status Patterns
    // e.g. "Saya mungkin punya bisnis A.", "Saya dulu punya bisnis A.", "Sekarang saya menjalankan bisnis B.", "Bisnis B saya sudah berjalan."
    const directBizRegexes = [
      /\b(?:saya\s+)?(?:dulu\s+|mungkin\s+|sekarang\s+)?(?:punya|memiliki|menjalankan)\s+(?:bisnis|usaha)\s+([A-Za-z0-9\._]+)/gi,
      /\b(?:bisnis|usaha)\s+([A-Za-z0-9\._]+)\s+saya\s+(?:sudah\s+berjalan|berjalan|aktif)/gi,
    ];

    for (const regex of directBizRegexes) {
      let m: RegExpExecArray | null;
      while ((m = regex.exec(text)) !== null) {
        const fullSpanText = m[0].trim();
        const bizName = m[1].trim().replace(/[\.\,\;]+$/, '');
        const startOffset = m.index;
        const endOffset = startOffset + fullSpanText.length;

        const nameSpan = findExactSpan(text, bizName, startOffset);
        if (nameSpan && !mentions.some((men) => men.surfaceForm === bizName)) {
          mentions.push({
            surfaceForm: bizName,
            textSpan: nameSpan.textSpan,
            startOffset: nameSpan.startOffset,
            endOffset: nameSpan.endOffset,
            typeHint: 'company',
          });
        }

        claims.push({
          subjectMentionSurface: userMatch ? userMatch[0] : 'saya',
          objectMentionSurface: bizName,
          predicate: 'operates_business',
          objectValue: {
            type: 'mention_surface',
            value: bizName,
          },
          qualifiers: { category: 'business_line' },
          temporalScope: 'present',
          textSpan: fullSpanText,
          startOffset,
          endOffset,
          extractionConfidence: 0.9,
        });

        rawObservations.push(`Extracted business assertion: ${bizName}`);
      }
    }

    // 5. Quantity / Cardinality without Individual Identities (e.g. "Saya punya 2 mesin kopi, 1 mesin roasting...")
    // Only parse if not matched by multi-account
    if (!multiMatch) {
      const itemsListRegex = /\b(?:saya\s+)?(?:punya|memiliki)\s+([^:\n\.]+)/i;
      const listMatch = text.match(itemsListRegex);
      if (listMatch && listMatch.index !== undefined && !text.includes('lini usaha')) {
        const itemsSegment = listMatch[1];
        // Split by comma
        const items = itemsSegment.split(/,\s*/);
        for (const item of items) {
          const itemRegex = /(\d+|[a-zA-Z]+)\s+([a-zA-Z0-9\s]+)/;
          const matchItem = item.match(itemRegex);
          if (matchItem) {
            const count = parseNumberWord(matchItem[1]);
            const conceptName = matchItem[2].trim();
            if (count !== undefined && conceptName.length > 0) {
              const spanMatch = findExactSpan(text, item.trim(), listMatch.index);
              if (spanMatch) {
                claims.push({
                  subjectMentionSurface: userMatch ? userMatch[0] : 'saya',
                  predicate: 'owns_asset',
                  objectValue: {
                    type: 'concept',
                    value: conceptName,
                  },
                  qualifiers: { quantity: count },
                  temporalScope: 'present',
                  textSpan: spanMatch.textSpan,
                  startOffset: spanMatch.startOffset,
                  endOffset: spanMatch.endOffset,
                  extractionConfidence: 0.9,
                });
              }
            }
          }
        }
      }
    }

    // 6. Present Activity vs Future Intention (e.g. "Saya membuat yoghurt untuk saya sendiri dan nantinya saya jual juga.")
    const presentFutureRegex =
      /saya\s+(membuat|menulis|merancang)\s+([a-zA-Z0-9\s]+?)\s+untuk\s+saya\s+sendiri(?:\s+dan\s+nantinya\s+saya\s+(jual|kembangkan|rilis))?/i;
    const pfMatch = text.match(presentFutureRegex);
    if (pfMatch && pfMatch.index !== undefined) {
      const verb = pfMatch[1];
      const targetObj = pfMatch[2].trim();
      const futureVerb = pfMatch[3];

      const presentSpan = findExactSpan(
        text,
        `saya ${verb} ${targetObj} untuk saya sendiri`,
        pfMatch.index
      ) || {
        startOffset: pfMatch.index,
        endOffset: pfMatch.index + pfMatch[0].length,
        textSpan: pfMatch[0],
      };

      // Claim 1: Present activity
      claims.push({
        subjectMentionSurface: userMatch ? userMatch[0] : 'saya',
        predicate: 'engages_in_activity',
        objectValue: {
          type: 'concept',
          value: `${verb} ${targetObj}`,
        },
        qualifiers: { purpose: 'self_consumption' },
        temporalScope: 'present',
        textSpan: presentSpan.textSpan,
        startOffset: presentSpan.startOffset,
        endOffset: presentSpan.endOffset,
        extractionConfidence: 0.9,
      });

      // Claim 2: Future commercial intention
      if (futureVerb) {
        const futureSpanText = `nantinya saya ${futureVerb}`;
        const futureSpan = findExactSpan(text, futureSpanText, pfMatch.index) || presentSpan;

        claims.push({
          subjectMentionSurface: userMatch ? userMatch[0] : 'saya',
          predicate: 'intends_activity',
          objectValue: {
            type: 'concept',
            value: `${futureVerb} ${targetObj}`,
          },
          qualifiers: { modality: 'commercial_intention' },
          temporalScope: 'future',
          textSpan: futureSpan.textSpan,
          startOffset: futureSpan.startOffset,
          endOffset: futureSpan.endOffset,
          extractionConfidence: 0.9,
        });
      }
    }

    // 6b. Standalone Future Commercial Intention
    // e.g. "Saya mungkin akan menjual yoghurt.", "Nantinya saya jual produk X."
    const standaloneFutureRegex =
      /\b(?:saya\s+)?(?:mungkin\s+)?(?:akan\s+|nantinya\s+|mau\s+|berencana\s+)(?:menjual|jual|kembangkan|rilis)\s+([a-zA-Z0-9\s]+?)(?=[.;,\n]|$)/gi;
    let sfMatch: RegExpExecArray | null;
    while ((sfMatch = standaloneFutureRegex.exec(text)) !== null) {
      const fullSpanText = sfMatch[0].trim();
      const targetObj = sfMatch[1].trim();
      const startOffset = sfMatch.index;
      const endOffset = startOffset + fullSpanText.length;

      const alreadyExtracted = claims.some(
        (c) => c.predicate === 'intends_activity' && c.startOffset === startOffset
      );

      if (!alreadyExtracted) {
        claims.push({
          subjectMentionSurface: userMatch ? userMatch[0] : 'saya',
          predicate: 'intends_activity',
          objectValue: {
            type: 'concept',
            value: `menjual ${targetObj}`,
          },
          qualifiers: { modality: 'commercial_intention' },
          temporalScope: 'future',
          textSpan: fullSpanText,
          startOffset,
          endOffset,
          extractionConfidence: 0.9,
        });

        rawObservations.push(`Extracted future commercial intention: menjual ${targetObj}`);
      }
    }

    // 7. Exploratory Activity (e.g. "Saya sedang research tentang membuat video YouTube faceless.")
    const exploreRegex = /saya\s+sedang\s+(?:research|riset|mencari\s+tahu)\s+tentang\s+([^\n\.]+)/i;
    const exploreMatch = text.match(exploreRegex);
    if (exploreMatch && exploreMatch.index !== undefined) {
      const topic = exploreMatch[1].trim();
      const fullSpanText = exploreMatch[0];
      const spanMatch = findExactSpan(text, fullSpanText) || {
        startOffset: exploreMatch.index,
        endOffset: exploreMatch.index + fullSpanText.length,
        textSpan: fullSpanText,
      };

      claims.push({
        subjectMentionSurface: userMatch ? userMatch[0] : 'saya',
        predicate: 'researches_topic',
        objectValue: {
          type: 'concept',
          value: topic,
        },
        qualifiers: { modality: 'exploratory' },
        temporalScope: 'present',
        textSpan: spanMatch.textSpan,
        startOffset: spanMatch.startOffset,
        endOffset: spanMatch.endOffset,
        extractionConfidence: 0.95,
      });
    }

    // 8. Recurring Activity without Artificial Entity (e.g. "Saya menerima pesanan blend kopi.")
    const recurringRegex = /saya\s+menerima\s+pesanan\s+([^\n\.]+)/i;
    const recurringMatch = text.match(recurringRegex);
    if (recurringMatch && recurringMatch.index !== undefined) {
      const orderType = recurringMatch[1].trim();
      const fullSpanText = recurringMatch[0];
      const spanMatch = findExactSpan(text, fullSpanText) || {
        startOffset: recurringMatch.index,
        endOffset: recurringMatch.index + fullSpanText.length,
        textSpan: fullSpanText,
      };

      claims.push({
        subjectMentionSurface: userMatch ? userMatch[0] : 'saya',
        predicate: 'engages_in_activity',
        objectValue: {
          type: 'concept',
          value: `menerima pesanan ${orderType}`,
        },
        temporalScope: 'recurring',
        textSpan: spanMatch.textSpan,
        startOffset: spanMatch.startOffset,
        endOffset: spanMatch.endOffset,
        extractionConfidence: 0.9,
      });
    }

    // 9. Negation & Explicit Uncertainty Modifiers
    // Check for "tidak punya" / "don't have"
    const negationRegex = /\b(?:saya\s+)?(?:tidak\s+punya|don't\s+have)\s+([^\n\.]+)/i;
    const negMatch = text.match(negationRegex);
    if (negMatch && negMatch.index !== undefined) {
      const item = negMatch[1].trim();
      const spanMatch = findExactSpan(text, negMatch[0]) || {
        startOffset: negMatch.index,
        endOffset: negMatch.index + negMatch[0].length,
        textSpan: negMatch[0],
      };

      claims.push({
        subjectMentionSurface: userMatch ? userMatch[0] : 'saya',
        predicate: 'owns_asset',
        objectValue: {
          type: 'concept',
          value: item,
        },
        qualifiers: { modality: 'negated' },
        temporalScope: 'present',
        textSpan: spanMatch.textSpan,
        startOffset: spanMatch.startOffset,
        endOffset: spanMatch.endOffset,
        extractionConfidence: 0.9,
      });
    }

    // 10. Local Modality & Temporal Scope Resolution (Clause-Scoped, Zero Dump-Level Bleed)
    for (const claim of claims) {
      const clause = getEnclosingClause(text, claim.startOffset, claim.endOffset);
      const clauseText = clause.text;

      // Local uncertainty (e.g. "mungkin", "barangkali", "maybe", "i think")
      if (/\b(mungkin|barangkali|maybe|i think)\b/i.test(clauseText)) {
        claim.qualifiers = { ...claim.qualifiers, modality: 'uncertain' };
        claim.extractionConfidence = Math.min(claim.extractionConfidence, 0.6);
      }

      // Local past temporal scope (e.g. "dulu", "used to", "sebelumnya")
      if (/\b(dulu|used to|sebelumnya)\b/i.test(clauseText)) {
        claim.temporalScope = 'past';
      }

      // Local present scope reinforcement (e.g. "sekarang", "saat ini", "sudah berjalan")
      if (/\b(sekarang|saat ini|sudah\s+berjalan)\b/i.test(clauseText)) {
        if (claim.temporalScope !== 'future') {
          claim.temporalScope = 'present';
        }
      }

      // Local future scope reinforcement (e.g. "akan", "nanti", "nantinya")
      if (/\b(akan|nanti|nantinya|bakal)\b/i.test(clauseText)) {
        if (claim.temporalScope !== 'past' && claim.predicate !== 'engages_in_activity') {
          claim.temporalScope = 'future';
        }
      }
    }

    return {
      dumpId: dump.id,
      extractorVersion: this.version,
      mentions,
      claims,
      rawObservations,
      executedAt: new Date().toISOString(),
    };
  }
}
