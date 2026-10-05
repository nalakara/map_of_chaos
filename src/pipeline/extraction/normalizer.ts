/**
 * Linguistic Normalization & Exact Span Matching Utilities
 * Supports Indonesian and English linguistic patterns and guarantees character offset slicing.
 */

export interface TextSpanMatch {
  startOffset: number;
  endOffset: number;
  textSpan: string;
}

/**
 * Finds the first exact occurrence of substring in fullText, returning character offsets
 */
export function findExactSpan(
  fullText: string,
  searchSubstring: string,
  fromIndex = 0
): TextSpanMatch | null {
  let index = fullText.indexOf(searchSubstring, fromIndex);
  if (index === -1) {
    const lowerFull = fullText.toLowerCase();
    const lowerSub = searchSubstring.toLowerCase();
    index = lowerFull.indexOf(lowerSub, fromIndex);
    if (index === -1) return null;
    return {
      startOffset: index,
      endOffset: index + searchSubstring.length,
      textSpan: fullText.slice(index, index + searchSubstring.length),
    };
  }
  return {
    startOffset: index,
    endOffset: index + searchSubstring.length,
    textSpan: searchSubstring,
  };
}

/**
 * Finds all exact occurrences of searchSubstring in fullText
 */
export function findAllExactSpans(
  fullText: string,
  searchSubstring: string
): TextSpanMatch[] {
  const results: TextSpanMatch[] = [];
  let fromIndex = 0;

  while (fromIndex < fullText.length) {
    const match = findExactSpan(fullText, searchSubstring, fromIndex);
    if (!match) break;
    results.push(match);
    fromIndex = match.endOffset;
  }

  return results;
}

/**
 * Determines whether a surface form is a 1st person user reference (Indonesian or English)
 */
export function isUserSelfReference(surface: string): boolean {
  const normalized = surface.trim().toLowerCase();
  return ['saya', 'aku', 'gue', 'gw', 'ku', 'i', 'me', 'my', 'myself'].includes(
    normalized
  );
}

/**
 * Normalizes a surface string for case-insensitive matching
 */
export function normalizeSurface(surface: string): string {
  return surface.trim().toLowerCase();
}

/**
 * Parses a count or number word in Indonesian or English
 */
export function parseNumberWord(text: string): number | undefined {
  const trimmed = text.trim().toLowerCase();
  const directInt = parseInt(trimmed, 10);
  if (!isNaN(directInt)) return directInt;

  const wordMap: Record<string, number> = {
    satu: 1,
    se: 1,
    dua: 2,
    tiga: 3,
    empat: 4,
    lima: 5,
    enam: 6,
    tujuh: 7,
    delapan: 8,
    sembilan: 9,
    sepuluh: 10,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
  };

  return wordMap[trimmed];
}

export interface EnclosingClause {
  text: string;
  startOffset: number;
  endOffset: number;
}

/**
 * Resolves the enclosing sentence or clause region for a character span in fullText.
 * Delimited by sentence terminators (., ;, \n, !, ?) or clause conjunctions.
 */
export function getEnclosingClause(
  fullText: string,
  startOffset: number,
  endOffset: number
): EnclosingClause {
  const isSentencePunctuation = (char: string): boolean =>
    ['.', ';', '\n', '!', '?'].includes(char);

  let start = startOffset;
  while (start > 0 && !isSentencePunctuation(fullText[start - 1])) {
    const preceding = fullText.slice(Math.max(0, start - 15), start);
    if (/\b(?:dan\s+nantinya|dan\s+kemudian)\s*$/i.test(preceding)) {
      break;
    }
    start--;
  }

  // 2. Find end of clause (search forward from startOffset)
  let end = startOffset;
  while (end < fullText.length && !isSentencePunctuation(fullText[end])) {
    const following = fullText.slice(end, Math.min(fullText.length, end + 15));
    if (end > startOffset && /^\s*(?:dan\s+nantinya|dan\s+kemudian)\b/i.test(following)) {
      break;
    }
    end++;
  }

  return {
    text: fullText.slice(start, end).trim(),
    startOffset: start,
    endOffset: end,
  };
}
