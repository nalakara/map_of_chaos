import { Thing, Relationship, ThingType } from '../types';

export interface DumpAnalysisResult {
  suggestedThings: Array<{
    title: string;
    description: string;
    types: ThingType[];
    uncertaintyState: 'unverified' | 'unknown' | 'possible' | 'suggested';
    contextQuestion?: string;
    summary?: string;
    suggestedRelationships?: Array<{
      targetThingId: string;
      targetTitle: string;
      reason: string;
      certainty: 'possible' | 'suggested';
    }>;
  }>;
}

export interface WanderEchoResult {
  detectedKeywords: string[];
  surfacedThingIds: string[];
  neutralObservation: string;
}

// Fallback intelligent semantic analyzer (handles Indonesian & English effortlessly)
export function analyzeDumpLocally(
  rawText: string,
  existingThings: Thing[]
): DumpAnalysisResult {
  const text = rawText.trim();
  const lower = text.toLowerCase();

  // If very short or single phrase, like "Borga" or "catatan lama"
  if (text.split(/\s+/).length <= 2 && text.length < 25) {
    return {
      suggestedThings: [
        {
          title: text,
          description: text,
          types: ['unknown'],
          uncertaintyState: 'unknown',
          contextQuestion: `What is "${text}"? (A project, idea, person, place, or physical thing?)`,
          summary: 'Context unknown. Preserved exactly as dumped.',
          suggestedRelationships: [],
        },
      ],
    };
  }

  // Multi-entity detection for rich dump like coffee calculator
  const things: DumpAnalysisResult['suggestedThings'] = [];

  // Check if multiple tools/environments are contrasted (e.g. github, antigravity, AI studio, notion, etc.)
  const hasMultipleVersions =
    (lower.includes('github') || lower.includes('ai studio') || lower.includes('antigravity')) &&
    (lower.includes('versi') || lower.includes('version') || lower.includes('lama') || lower.includes('baru') || lower.includes('old') || lower.includes('new'));

  if (hasMultipleVersions) {
    // Primary Thing
    let mainTitle = 'New Capture';
    if (lower.includes('coffee calculator')) mainTitle = 'Coffee Calculator';
    else if (lower.includes('calculator')) mainTitle = 'Calculator project';
    else {
      const words = text.split(/\s+/).slice(0, 4).join(' ');
      mainTitle = words.length > 25 ? words.slice(0, 25) + '...' : words;
    }

    const mainThing = {
      title: mainTitle,
      description: text,
      types: ['project', 'application'] as ThingType[],
      uncertaintyState: 'unverified' as const,
      contextQuestion: 'Multiple codebases mentioned. Which one is currently active or desired?',
      summary: 'Project with overlapping branches or repositories across environments.',
      suggestedRelationships: [] as Array<{
        targetThingId: string;
        targetTitle: string;
        reason: string;
        certainty: 'possible' | 'suggested';
      }>,
    };

    // Find any matches in existing things
    existingThings
      .filter((t) => t.status === 'active' && !t.isRoot)
      .forEach((existing) => {
        const existLower = (existing.title + ' ' + existing.description).toLowerCase();
        if (
          (lower.includes('coffee') && existLower.includes('coffee')) ||
          (lower.includes('antigravity') && existLower.includes('antigravity')) ||
          (lower.includes('ai') && existLower.includes('ai'))
        ) {
          mainThing.suggestedRelationships.push({
            targetThingId: existing.id,
            targetTitle: existing.title || existing.description.slice(0, 20),
            reason: `Shares topical keywords with existing node "${existing.title || 'Thing'}".`,
            certainty: 'suggested',
          });
        }
      });

    things.push(mainThing);
    return { suggestedThings: things };
  }

  // General single or compound statement
  const detectedTypes: ThingType[] = [];
  if (lower.includes('bikin') || lower.includes('build') || lower.includes('project') || lower.includes('proyek') || lower.includes('app') || lower.includes('aplikasi')) {
    detectedTypes.push('project', 'application');
  }
  if (lower.includes('ide') || lower.includes('idea') || lower.includes('gimana kalau') || lower.includes('what if')) {
    detectedTypes.push('idea', 'thought');
  }
  if (lower.includes('takut') || lower.includes('khawatir') || lower.includes('concern') || lower.includes('problem') || lower.includes('bingung')) {
    detectedTypes.push('concern', 'question');
  }
  if (lower.includes('orang') || lower.includes('person') || lower.includes('teman') || lower.includes('friend')) {
    detectedTypes.push('person');
  }
  if (lower.includes('tempat') || lower.includes('place') || lower.includes('kota') || lower.includes('di ')) {
    detectedTypes.push('place');
  }
  if (detectedTypes.length === 0) {
    detectedTypes.push('thought');
  }

  // Derive readable title
  const cleanTitle = text.length > 40 ? text.slice(0, 38).trim() + '...' : text;

  // Potential relationships to existing nodes
  const suggestedRels: Array<{
    targetThingId: string;
    targetTitle: string;
    reason: string;
    certainty: 'possible' | 'suggested';
  }> = [];

  const textTokens = new Set(lower.replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter((w) => w.length > 3));

  for (const existing of existingThings) {
    if (existing.isRoot || existing.status !== 'active') continue;
    const existingTokens = (existing.title + ' ' + existing.description)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 3);

    const overlap = existingTokens.filter((t) => textTokens.has(t));
    if (overlap.length >= 1) {
      suggestedRels.push({
        targetThingId: existing.id,
        targetTitle: existing.title || existing.description.slice(0, 20),
        reason: `Shares related context: "${overlap.slice(0, 2).join(', ')}"`,
        certainty: 'possible',
      });
    }
  }

  things.push({
    title: cleanTitle,
    description: text,
    types: detectedTypes,
    uncertaintyState: 'unverified',
    summary: 'Captured directly from dump. Categorization is tentative.',
    contextQuestion: detectedTypes.includes('concern')
      ? 'Is this an immediate worry or an overarching theme?'
      : 'Does this relate to an existing project, or stand on its own?',
    suggestedRelationships: suggestedRels.slice(0, 2),
  });

  return { suggestedThings: things };
}

// Wandering Reflection: strictly neutral, surfaces evidence from Map without behavioral judgment
export function reflectOnWander(
  wanderText: string,
  activeThings: Thing[]
): WanderEchoResult {
  const lower = wanderText.toLowerCase();
  const words = lower.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 3);

  // Common stop words to exclude
  const stopWords = new Set([
    'this', 'that', 'with', 'from', 'have', 'what', 'when', 'where', 'which',
    'yang', 'untuk', 'dengan', 'saya', 'kamu', 'mereka', 'karena', 'tentang',
    'just', 'make', 'doing', 'being', 'keep', 'instead', 'would', 'could'
  ]);

  const keywords = Array.from(new Set(words.filter((w) => !stopWords.has(w)))).slice(0, 5);

  const matchedThings: Thing[] = [];
  const keywordHits: Record<string, number> = {};

  activeThings
    .filter((t) => !t.isRoot && t.status === 'active')
    .forEach((thing) => {
      const content = (thing.title + ' ' + thing.description + ' ' + (thing.types || []).join(' ')).toLowerCase();
      let matchCount = 0;
      keywords.forEach((kw) => {
        if (content.includes(kw)) {
          matchCount++;
          keywordHits[kw] = (keywordHits[kw] || 0) + 1;
        }
      });
      if (matchCount > 0) {
        matchedThings.push(thing);
      }
    });

  // Sort by matches or pick top matches
  const surfacedIds = matchedThings.slice(0, 5).map((t) => t.id);

  let neutralObservation = '';
  if (surfacedIds.length === 0) {
    neutralObservation = 'No existing nodes on the Map directly match these words yet. This thought explores uncharted space.';
  } else {
    const topicSummary = keywords.filter((k) => keywordHits[k] > 0).slice(0, 3).join(', ');
    neutralObservation = `I found ${surfacedIds.length} Thing${surfacedIds.length > 1 ? 's' : ''} on your Map with overlapping references (${topicSummary || 'related themes'}).`;
  }

  return {
    detectedKeywords: keywords.slice(0, 4),
    surfacedThingIds: surfacedIds,
    neutralObservation,
  };
}
