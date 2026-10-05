/**
 * Domain types for Map of Chaos Context Model
 * Based on docs/domain_data_schema_and_state_spec.md
 */

// ==========================================
// 1. Core Primitives
// ==========================================

export interface Dump {
  readonly id: string;
  readonly rawText: string;
  readonly createdAt: string; // ISO-8601
  readonly source: 'web_dock' | 'pwa' | 'api' | 'import';
  processingStatus: 'captured' | 'processing' | 'processed' | 'failed';
  processorVersion?: string;
  errorMessage?: string;
}

export interface Evidence {
  readonly id: string;
  readonly dumpId: string;
  readonly textSpan: string;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly createdAt: string; // ISO-8601
}

export interface Mention {
  readonly id: string;
  readonly evidenceId: string;
  readonly dumpId: string;
  readonly surfaceForm: string;
  readonly normalizedForm: string;
  candidateTypeHint?: string;
  readonly createdAt: string; // ISO-8601
}

// ==========================================
// 2. Entity & Resolution
// ==========================================

export type ResolutionOutcome =
  | 'matched_existing'
  | 'new_entity'
  | 'ambiguous'
  | 'associated_handle';

export interface EntityResolution {
  readonly id: string;
  readonly mentionId: string;
  readonly targetEntityId?: string;
  readonly outcome: ResolutionOutcome;
  readonly confidence: number;
  readonly rationale: string;
  readonly createdBy: 'machine' | 'human_override';
  status: 'active' | 'superseded';
  candidateEntityIds?: string[];
  overrideReason?: string;
  readonly createdAt: string; // ISO-8601
}

export interface Entity {
  readonly id: string;
  canonicalName: string;
  aliases: string[];
  associatedHandles: string[];
  epistemicStatus: 'verified' | 'unverified' | 'unknown';
  resolutionStatus: 'resolved' | 'ambiguous' | 'provisional';
  readonly createdAt: string; // ISO-8601
  updatedAt: string; // ISO-8601
}

// ==========================================
// 3. Claim Model
// ==========================================

export type TemporalScope =
  | 'past'
  | 'present'
  | 'future'
  | 'recurring'
  | 'timeless';

export interface ClaimQualifiers {
  quantity?: number;
  partitivity?: string;
  purpose?: string;
  modality?: string;
  degree?: string;
  condition?: string;
  category?: string;
  platform?: string;
}

export interface ClaimObjectValue {
  type: 'entity_id' | 'literal' | 'concept';
  value: string;
}

export interface Claim {
  readonly id: string;
  subjectEntityId: string;
  predicate: string;
  objectValue: ClaimObjectValue;
  qualifiers?: ClaimQualifiers;

  // Temporal separation
  readonly observationTime: string; // ISO-8601
  temporalScope: TemporalScope;
  validityDetails?: string;

  // Dual Epistemic Framework
  sourceOrigin: 'human_stated' | 'ai_inferred';
  reviewState: 'extracted' | 'needs_review' | 'human_confirmed' | 'rejected';

  // Grounding & Provenance
  readonly dumpId: string;
  readonly mentionId?: string; // Legacy / subject mention shorthand
  readonly subjectMentionId?: string;
  readonly objectMentionId?: string;
  readonly evidenceId: string;
  supportingEvidenceIds: string[];

  // Conflict & Lifecycle
  conflictState?: 'none' | 'temporal_shift' | 'direct_contradiction';
  conflictingClaimIds?: string[];
  status: 'active' | 'superseded' | 'retracted';
  readonly createdAt: string; // ISO-8601
  updatedAt: string; // ISO-8601
}

export interface ClaimBindingAudit {
  readonly id: string;
  readonly claimId: string;
  readonly role?: 'subject' | 'object';
  readonly previousEntityId: string;
  readonly newEntityId: string;
  readonly resolutionId: string;
  readonly timestamp: string; // ISO-8601
}

// ==========================================
// 4. Extraction & Machine Output
// ==========================================

export interface ExtractedMentionCandidate {
  surfaceForm: string;
  textSpan: string;
  startOffset: number;
  endOffset: number;
  typeHint?: string;
  referenceTarget?: 'user_self' | 'unresolved_pronoun' | 'context_referent';
}

export interface ExtractedClaimCandidate {
  subjectMentionSurface: string;
  objectMentionSurface?: string;
  predicate: string;
  objectValue: {
    type: 'mention_surface' | 'literal' | 'concept';
    value: string;
  };
  qualifiers?: ClaimQualifiers;
  temporalScope: TemporalScope;
  textSpan: string;
  startOffset: number;
  endOffset: number;
  extractionConfidence: number;
  evidenceId?: string;
}

export interface ExtractionResult {
  readonly dumpId: string;
  readonly extractorVersion: string;
  mentions: ExtractedMentionCandidate[];
  claims: ExtractedClaimCandidate[];
  rawObservations: string[];
  readonly executedAt: string; // ISO-8601
}

// ==========================================
// 5. Human Overrides & Decisions
// ==========================================

export interface HumanOverride {
  readonly id: string;
  readonly targetType:
    | 'entity_resolution'
    | 'claim_review'
    | 'entity_merge'
    | 'entity_split';
  readonly targetId: string;
  readonly action:
    | 'bind_to_entity'
    | 'confirm_claim'
    | 'reject_claim'
    | 'merge_entities'
    | 'split_entity';
  readonly payload: Record<string, unknown>;
  readonly userNotes?: string;
  readonly createdAt: string; // ISO-8601
}

// ==========================================
// 6. Projections (View Models)
// ==========================================

export interface ThingProjection {
  readonly id: string;
  readonly entityId: string;
  title: string;
  summary?: string;
  displayTypes: string[];
  uncertaintyBadge: 'verified' | 'unverified' | 'unknown' | 'ambiguous';
  isProjected: boolean;
  projectionReason:
    | 'user_pinned'
    | 'high_salience'
    | 'explicit_focus'
    | 'isolated_presence';
  x?: number;
  y?: number;
  radius: number;
  degree: number;
  readonly projectedAt: string; // ISO-8601
}

export interface EdgeProjection {
  readonly id: string;
  readonly claimId: string;
  readonly sourceThingId: string;
  readonly targetThingId: string;
  readonly label: string;
  readonly style: 'solid' | 'dashed';
  readonly isVisible: boolean;
}
