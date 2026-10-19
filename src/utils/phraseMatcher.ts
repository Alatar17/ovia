/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PoolNote, PhraseMatch } from '../types/pool';
import { FormMappingTarget } from '../types/customMatch';
import { generateStemCandidates } from './stemmer';

function capitalizeWord(w: string): string {
  if (!w) return '';
  return w.charAt(0).toUpperCase() + w.slice(1);
}

export interface PhraseParseResult {
  valid: boolean;
  reason?: string;
  patterns?: Array<{
    words: string[];
    patternString: string;
    firstWord: string;
    wordCount: number;
  }>;
  displayHeading?: string;
}

export interface PhraseCandidate {
  patternString: string;
  words: string[];
  firstWord: string;
  wordCount: number;
  displayHeading: string;
  notes: PoolNote[];
}

/**
 * Normalizes a text string the standard way:
 * - standardizes smart quotes (’ and ‘) to '
 * - lowercases
 * - trims
 */
export function normalizePhraseText(text: string): string {
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .trim()
    .toLowerCase();
}

// Words inside parentheses that stand for "any word" (placeholders), not optional words
const PLACEHOLDER_WORDS = new Set([
  'someone', 'somebody', 'something', 'sb', 'sth', "one's", 'oneself', 'your', 'my',
]);

const TRAILING_MARKER_REGEX = /\s*\([^)]*\)\s*$/;
const TRAILING_PUNCTUATION_REGEX = /[\s?!.,;:…]+$/;

/**
 * Parses a pool note's heading to determine if it can be turned into valid phrase pattern(s).
 * Rules:
 * - 2+ words after cleanup of trailing markers (e.g. (1), (2), (E2), (US), etc.)
 * - Trailing punctuation (? ! . , ; : …) is ignored; punctuation inside the heading is rejected
 * - A parenthesized single ordinary word is optional: "(be) cut out" -> "be cut out", "cut out"
 * - Placeholder words (someone, sth, one's...) or multi-word parentheses are rejected
 * - Slash variants expand word by word (e.g. "Might/may as well" -> "might as well", "may as well")
 * - Capped at 8 patterns per note
 */
export function parsePhraseHeading(rawHeading: string): PhraseParseResult {
  if (!rawHeading) {
    return { valid: false, reason: 'Başlık boş' };
  }

  // Normalize quotes
  let cleaned = rawHeading.replace(/[‘’]/g, "'").trim();

  // Strip trailing parentheticals: (1), (2), (E2), (US), (UK), (i), (f), (s), (z), etc.
  while (TRAILING_MARKER_REGEX.test(cleaned)) {
    cleaned = cleaned.replace(TRAILING_MARKER_REGEX, '').trim();
  }

  // Strip leading numbering: "1-", "2.", "1)"
  cleaned = cleaned.replace(/^\s*\d+[-.)]\s*/, '').trim();

  const displayHeading = cleaned.replace(TRAILING_PUNCTUATION_REGEX, '').trim();

  // Ignore trailing punctuation: "how come?" -> "how come", "what matters is…" -> "what matters is"
  // (markers may sit before the punctuation, so strip both until stable)
  let previous = '';
  while (previous !== cleaned) {
    previous = cleaned;
    cleaned = cleaned.replace(TRAILING_PUNCTUATION_REGEX, '').trim();
    cleaned = cleaned.replace(TRAILING_MARKER_REGEX, '').trim();
  }

  cleaned = cleaned.toLowerCase().trim();

  if (!cleaned || !/[a-z]/.test(cleaned)) {
    return { valid: false, reason: 'Başlıkta harf bulunamadı' };
  }

  // If there are brackets or braces
  if (/[\[\]\{\}<>]/.test(cleaned)) {
    return {
      valid: false,
      reason: 'Köşeli parantez veya etiket içeriyor',
    };
  }

  // Check for unsupported characters (allowed: a-z, 0-9, ', -, space, /, parentheses)
  if (/[^a-z0-9'\-\s\/()]/.test(cleaned)) {
    return {
      valid: false,
      reason: 'Desteklenmeyen noktalama veya özel karakter(ler) içeriyor',
    };
  }

  // Split into whitespace-separated tokens
  const rawTokens = cleaned.split(/\s+/).filter(Boolean);
  if (rawTokens.length === 0) {
    return { valid: false, reason: 'Başlık boş' };
  }

  // Each token becomes a list of variants; null = optional word left out
  const tokenVariants: Array<Array<string | null>> = [];

  for (const token of rawTokens) {
    if (/[()]/.test(token)) {
      const optionalMatch = token.match(/^\(([a-z][a-z'-]*)\)$/);
      if (!optionalMatch) {
        return {
          valid: false,
          reason: 'Parantez içinde birden çok kelime veya desteklenmeyen biçim var',
        };
      }
      if (PLACEHOLDER_WORDS.has(optionalMatch[1])) {
        return {
          valid: false,
          reason: 'Parantez içinde yer tutucu kelime var (someone, sth vb.)',
        };
      }
      tokenVariants.push([optionalMatch[1], null]);
      continue;
    }

    // Validate slash usage
    if (token === '/' || token.startsWith('/') || token.endsWith('/') || token.includes('//')) {
      return {
        valid: false,
        reason: 'Geçersiz eğik çizgi (/) formatı',
      };
    }
    const parts = token.split('/');
    for (const part of parts) {
      if (!part || !/^[a-z0-9'-]+$/.test(part)) {
        return {
          valid: false,
          reason: 'Geçersiz kelime veya eğik çizgi formatı',
        };
      }
    }
    tokenVariants.push(parts);
  }

  // Calculate combinations
  const combinations = tokenVariants.reduce((acc, v) => acc * v.length, 1);
  if (combinations > 8) {
    return {
      valid: false,
      reason: `8'den fazla kombinasyon oluşturuyor (${combinations} kombinasyon)`,
    };
  }

  // Cartesian expansion word by word
  let currentPatterns: string[][] = [[]];
  for (const variants of tokenVariants) {
    const nextPatterns: string[][] = [];
    for (const curr of currentPatterns) {
      for (const v of variants) {
        nextPatterns.push(v === null ? curr : [...curr, v]);
      }
    }
    currentPatterns = nextPatterns;
  }

  // Keep patterns with at least 2 words (an optional word may leave a single word), deduplicated
  const seenPatterns = new Set<string>();
  const finalPatterns = currentPatterns.filter((words) => {
    const key = words.join(' ');
    if (words.length < 2 || seenPatterns.has(key)) return false;
    seenPatterns.add(key);
    return true;
  });

  if (finalPatterns.length === 0) {
    return {
      valid: false,
      reason: "2'den az kelime içeriyor (tek kelimelik)",
    };
  }

  return {
    valid: true,
    patterns: finalPatterns.map((words) => ({
      words,
      patternString: words.join(' '),
      firstWord: words[0],
      wordCount: words.length,
    })),
    displayHeading,
  };
}

/**
 * Builds the active phrase index from the list of candidate phrase notes.
 * Keys in the map are the first word of the phrase pattern for O(1) candidate lookup.
 */
export function buildPhraseIndex(notes: PoolNote[]): {
  phraseIndex: Map<string, PhraseCandidate[]>;
  activePhraseNotesCount: number;
} {
  const index = new Map<string, PhraseCandidate[]>();
  const activeGuids = new Set<string>();

  for (const note of notes) {
    const rawHeading = note.headwords[0] || '';
    const parsed = parsePhraseHeading(rawHeading);
    if (!parsed.valid || !parsed.patterns) {
      continue;
    }

    activeGuids.add(note.guid);

    for (const p of parsed.patterns) {
      const firstWord = p.firstWord;
      const list = index.get(firstWord) || [];

      // Check if pattern already exists in list to group multiple notes
      const existing = list.find((c) => c.patternString === p.patternString);
      if (existing) {
        if (!existing.notes.some((n) => n.guid === note.guid)) {
          existing.notes.push(note);
        }
      } else {
        list.push({
          patternString: p.patternString,
          words: p.words,
          firstWord: p.firstWord,
          wordCount: p.wordCount,
          displayHeading: parsed.displayHeading || p.patternString,
          notes: [note],
        });
      }

      index.set(firstWord, list);
    }
  }

  return {
    phraseIndex: index,
    activePhraseNotesCount: activeGuids.size,
  };
}

/**
 * Compares a text word against a phrase's first word according to the existing matcher order:
 * 1. Exact match (birebir)
 * 2. Irregular / custom mappings (düzensiz / özel)
 * 3. Morphological stem derivations (ek kuralları)
 */
export function matchFirstWord(
  textWord: string,
  phraseFirstWord: string,
  irregularVerbMap: Map<string, Array<FormMappingTarget | string>>
): { matched: boolean; rule: string } {
  // 1. Exact match
  if (textWord === phraseFirstWord) {
    return { matched: true, rule: 'birebir' };
  }

  // 2. Irregular and custom mappings
  const bases = irregularVerbMap.get(textWord);
  if (bases && bases.length > 0) {
    for (const item of bases) {
      const root = typeof item === 'string' ? item : item.root;
      const isCustom = typeof item === 'string' ? false : item.isCustom;
      if (root === phraseFirstWord) {
        return { matched: true, rule: isCustom ? 'özel' : 'düzensiz' };
      }
    }
  }

  // 3. Morphological stem candidates
  const stemCandidates = generateStemCandidates(textWord);
  for (const { candidate, rule } of stemCandidates) {
    if (candidate === phraseFirstWord) {
      return { matched: true, rule };
    }
  }

  return { matched: false, rule: '' };
}

export interface RawSentenceToken {
  id: string;
  sentenceIndex: number;
  wordIndex: number;
  leading: string;
  coreWord: string;
  trailing: string;
  cleanWord: string;
}

/**
 * Finds all candidate phrase matches starting from each token in a sentence.
 */
export function findPhraseMatchesInSentence(
  tokens: RawSentenceToken[],
  sentenceIndex: number,
  phraseIndex: Map<string, PhraseCandidate[]>,
  irregularVerbMap: Map<string, Array<FormMappingTarget | string>>
): PhraseMatch[] {
  if (tokens.length < 2 || phraseIndex.size === 0) {
    return [];
  }

  const allFound: PhraseMatch[] = [];

  for (let j = 0; j < tokens.length; j++) {
    const firstToken = tokens[j];
    const textWord = firstToken.cleanWord;
    if (!textWord) continue;

    // Collect all candidate roots for this text word
    const candidateRoots = new Set<string>();
    candidateRoots.add(textWord);

    const irregularBases = irregularVerbMap.get(textWord);
    if (irregularBases) {
      for (const item of irregularBases) {
        const root = typeof item === 'string' ? item : item.root;
        candidateRoots.add(root);
      }
    }

    const stemList = generateStemCandidates(textWord);
    for (const s of stemList) {
      candidateRoots.add(s.candidate);
    }

    // Check all phrase candidates whose first word matches one of these roots
    for (const root of candidateRoots) {
      const candidates = phraseIndex.get(root);
      if (!candidates || candidates.length === 0) continue;

      for (const candidate of candidates) {
        const wordCount = candidate.wordCount;
        if (j + wordCount > tokens.length) {
          continue; // Phrase extends beyond sentence
        }

        // 1. Check first word match with priority order
        const firstMatch = matchFirstWord(textWord, candidate.firstWord, irregularVerbMap);
        if (!firstMatch.matched) {
          continue;
        }

        // 2. Check remaining words strictly and contiguity (no punctuation inside match)
        let matchesRemaining = true;
        for (let m = 1; m < wordCount; m++) {
          const prevTok = tokens[j + m - 1];
          const currTok = tokens[j + m];

          // Contiguous only: separated ONLY by spaces. No punctuation between words!
          if (prevTok.trailing !== '' || currTok.leading !== '') {
            matchesRemaining = false;
            break;
          }

          // Case-insensitive exact match for remaining words
          if (currTok.cleanWord !== candidate.words[m]) {
            matchesRemaining = false;
            break;
          }
        }

        if (matchesRemaining) {
          const matchedSlice = tokens.slice(j, j + wordCount);
          const matchedText = matchedSlice.map((t) => t.coreWord).join(' ');
          const displayHw = capitalizeWord(candidate.displayHeading || candidate.patternString);

          allFound.push({
            id: `phrase-s${sentenceIndex}-w${j}-w${j + wordCount - 1}`,
            sentenceIndex,
            startIndex: j,
            endIndex: j + wordCount - 1,
            length: wordCount,
            pattern: candidate.patternString,
            matchedText,
            displayHeadword: displayHw,
            rule: 'kalıp',
            firstWordRule: firstMatch.rule,
            notes: candidate.notes,
          });
        }
      }
    }
  }

  // Overlap resolution:
  // "Longest phrase wins. If two phrases overlap, the longer one wins; if equal length, the earlier one wins."
  allFound.sort((a, b) => {
    if (b.length !== a.length) {
      return b.length - a.length; // longest wins
    }
    return a.startIndex - b.startIndex; // earlier wins
  });

  const claimedIndices = new Set<number>();
  const accepted: PhraseMatch[] = [];

  for (const match of allFound) {
    let overlaps = false;
    for (let idx = match.startIndex; idx <= match.endIndex; idx++) {
      if (claimedIndices.has(idx)) {
        overlaps = true;
        break;
      }
    }

    if (!overlaps) {
      accepted.push(match);
      for (let idx = match.startIndex; idx <= match.endIndex; idx++) {
        claimedIndices.add(idx);
      }
    }
  }

  // Sort accepted phrases by startIndex for natural text order
  accepted.sort((a, b) => a.startIndex - b.startIndex);

  return accepted;
}
