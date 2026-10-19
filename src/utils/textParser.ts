/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PoolNote, TokenWordMatch, PhraseMatch } from '../types/pool';
import { FormMappingTarget } from '../types/customMatch';
import { matchWordAgainstPool } from './matcher';
import { findPhraseMatchesInSentence, PhraseCandidate, RawSentenceToken } from './phraseMatcher';

export interface WordToken {
  id: string; // Unique token ID (e.g. s0-w2)
  sentenceIndex: number;
  wordIndex: number;
  leading: string;
  coreWord: string;
  trailing: string;
  cleanWord: string;
  match: TokenWordMatch | null;
  phraseMatch?: PhraseMatch | null;
  notes: PoolNote[];
}

/**
 * Tokenize a sentence into words, isolating leading/trailing punctuation,
 * running phrase detection pass first (longest contiguous phrase wins),
 * and then matching remaining words against the active single-word pool.
 */
export function tokenizeSentence(
  sentenceText: string,
  sentenceIndex: number,
  poolIndex: Map<string, PoolNote[]>,
  irregularVerbMap: Map<string, Array<FormMappingTarget | string>>,
  phraseIndex?: Map<string, PhraseCandidate[]> | null
): WordToken[] {
  const rawWords = sentenceText.trim().split(/\s+/);

  const rawTokens: RawSentenceToken[] = rawWords.map((rawWord, wordIndex) => {
    // Separate leading punctuation, core letters/word (allowing ' and -), and trailing punctuation
    const match = rawWord.match(/^([^\w]*)([\w'’-]+)([^\w]*)$/);

    let leading = '';
    let coreWord = rawWord;
    let trailing = '';

    if (match) {
      leading = match[1] || '';
      coreWord = match[2] || '';
      trailing = match[3] || '';
    } else {
      const clean = rawWord.replace(/^[^\w]+|[^\w]+$/g, '');
      coreWord = clean || rawWord;
    }

    const cleanWord = coreWord.toLowerCase().replace(/[\u2018\u2019]/g, "'");

    return {
      id: `s${sentenceIndex}-w${wordIndex}`,
      sentenceIndex,
      wordIndex,
      leading,
      coreWord,
      trailing,
      cleanWord,
    };
  });

  // 1. Phrase detection pass BEFORE single-word matching
  let phraseMatches: PhraseMatch[] = [];
  const claimedIndices = new Map<number, PhraseMatch>();

  if (phraseIndex && phraseIndex.size > 0) {
    phraseMatches = findPhraseMatchesInSentence(
      rawTokens,
      sentenceIndex,
      phraseIndex,
      irregularVerbMap
    );

    for (const pm of phraseMatches) {
      for (let idx = pm.startIndex; idx <= pm.endIndex; idx++) {
        claimedIndices.set(idx, pm);
      }
    }
  }

  // 2. Build final WordToken array
  return rawTokens.map((raw) => {
    const pm = claimedIndices.get(raw.wordIndex) || null;

    if (pm) {
      // Words inside a matched phrase are NOT matched or highlighted separately as single words.
      return {
        ...raw,
        match: null,
        phraseMatch: pm,
        notes: pm.notes,
      };
    }

    // Normal single-word matching for tokens outside any phrase
    const poolMatch = matchWordAgainstPool(raw.cleanWord, poolIndex, irregularVerbMap);

    return {
      ...raw,
      match: poolMatch,
      phraseMatch: null,
      notes: poolMatch ? poolMatch.notes : [],
    };
  });
}
