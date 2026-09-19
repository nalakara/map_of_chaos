export type ThingType =
  | 'project'
  | 'idea'
  | 'desire'
  | 'concern'
  | 'problem'
  | 'question'
  | 'person'
  | 'place'
  | 'physical object'
  | 'application'
  | 'file'
  | 'information'
  | 'thought'
  | 'unfinished thought'
  | 'vague observation'
  | 'collection'
  | 'unknown'
  | string;

export type UncertaintyState = 'verified' | 'unverified' | 'possible' | 'suggested' | 'unknown';

export interface ContextInfo {
  whatIsThis?: string;
  possibleType?: string;
  notes?: string;
  isUnknown?: boolean;
}

export interface Thing {
  id: string;
  title?: string;
  description: string; // The minimum valid Thing is simply a description
  types: ThingType[];
  isRoot?: boolean; // True only for the 'Yudhan' root node
  originalDumpId?: string;
  originalDumpText?: string;
  aiInterpretation?: {
    summary?: string;
    detectedTypes?: ThingType[];
    suggestedRelationships?: Array<{
      targetThingId: string;
      targetTitle?: string;
      reason?: string;
      certainty: 'possible' | 'suggested';
    }>;
    contextQuestion?: string;
  };
  context?: ContextInfo;
  uncertaintyState: UncertaintyState;
  status: 'active' | 'erased';
  createdAt: string;
  updatedAt: string;
  // Canvas / Physics properties
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface Relationship {
  id: string;
  source: string; // Thing ID
  target: string; // Thing ID
  label?: string;
  type: 'user_confirmed' | 'ai_suggested';
  certainty: 'confirmed' | 'suggested' | 'possible' | 'unknown';
  createdAt: string;
}

export interface Dump {
  id: string;
  rawText: string;
  timestamp: string;
  extractedThingIds: string[];
}

export interface WanderReflection {
  detectedKeywords: string[];
  surfacedThingIds: string[];
  neutralObservation: string;
}

export interface WanderEntry {
  id: string;
  content: string;
  timestamp: string;
  reflection?: WanderReflection;
}

export type ViewMode = 'map' | 'inbox' | 'wander' | 'erased';
