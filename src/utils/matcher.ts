/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PoolNote, TokenWordMatch } from '../types/pool';
import { FormMappingTarget } from '../types/customMatch';
import { generateStemCandidates } from './stemmer';

function capitalizeWord(w: string): string {
  if (!w) return '';
  return w.charAt(0).toUpperCase() + w.slice(1);
}

/**
 * Match a single word against the active vocabulary pool according to Section 7.
 * Priority:
 * 1. Exact match (birebir)
 * 2. Irregular verbs and custom mappings dictionary (düzensiz / özel)
 * 3. Morphological stem derivations (ek kuralları)
 *
 * If a match is found in an earlier step, subsequent steps are skipped.
 */
export function matchWordAgainstPool(
  rawWord: string,
  poolIndex: Map<string, PoolNote[]>,
  irregularVerbMap: Map<string, Array<FormMappingTarget | string>>
): TokenWordMatch | null {
  // Normalize quotes and convert to lowercase
  const word = rawWord
    .replace(/[\u2018\u2019]/g, "'")
    .trim()
    .toLowerCase();

  if (!word || poolIndex.size === 0) {
    return null;
  }

  // 7.1 Birebir eşleşme
  const exactNotes = poolIndex.get(word);
  if (exactNotes && exactNotes.length > 0) {
    // Collect distinct notes (by guid)
    const uniqueNotes = deduplicateNotes(exactNotes);
    const primaryNote = uniqueNotes[0];
    const isAdditionalHw =
      primaryNote.headwords.length > 1 &&
      !uniqueNotes.some((n) => (n.headwords[0] || '').toLowerCase() === word);

    const mainHw = primaryNote.headwords[0] || word;
    const displayHeadword = capitalizeWord(mainHw);

    return {
      matchedHeadword: displayHeadword,
      rule: isAdditionalHw ? 'ek başlık' : 'birebir',
      notes: uniqueNotes,
    };
  }

  // 7.2 Düzensiz ve özel eşleştirmeler
  const bases = irregularVerbMap.get(word);
  if (bases && bases.length > 0) {
    const matchedNotes: PoolNote[] = [];
    const matchedRules: string[] = [];
    const matchedHeadwords: string[] = [];
    const seenGuids = new Set<string>();

    for (const item of bases) {
      const root = typeof item === 'string' ? item : item.root;
      const isCustom = typeof item === 'string' ? false : item.isCustom;
      if (root === word) continue;

      const rootNotes = poolIndex.get(root);
      if (rootNotes && rootNotes.length > 0) {
        for (const n of rootNotes) {
          if (!seenGuids.has(n.guid)) {
            seenGuids.add(n.guid);
            matchedNotes.push(n);

            const isAdditionalHw =
              n.headwords.length > 1 &&
              !n.headwords.some((hw) => (hw || '').toLowerCase() === root);

            const baseRule = isCustom ? 'özel' : 'düzensiz';
            const fullRule = isAdditionalHw ? `${baseRule}, ek başlık` : baseRule;
            matchedRules.push(fullRule);

            const mainHw = n.headwords[0] || root;
            matchedHeadwords.push(capitalizeWord(mainHw));
          }
        }
      }
    }

    if (matchedNotes.length > 0) {
      const uniqueRules = Array.from(new Set(matchedRules));
      return {
        matchedHeadword: matchedHeadwords[0] || capitalizeWord(word),
        rule: uniqueRules.join(', '),
        notes: matchedNotes,
      };
    }
  }

  // 7.3 Ek kuralları ile türetilmiş kök adayları
  const stemCandidates = generateStemCandidates(word);
  if (stemCandidates.length > 0) {
    const matchedNotes: PoolNote[] = [];
    const matchedRules: string[] = [];
    const matchedHeadwords: string[] = [];
    const seenGuids = new Set<string>();

    for (const { candidate, rule } of stemCandidates) {
      const candidateNotes = poolIndex.get(candidate);
      if (candidateNotes && candidateNotes.length > 0) {
        for (const n of candidateNotes) {
          if (!seenGuids.has(n.guid)) {
            seenGuids.add(n.guid);
            matchedNotes.push(n);

            const isAdditionalHw =
              n.headwords.length > 1 &&
              (n.headwords[0] || '').toLowerCase() !== candidate;

            const fullRule = isAdditionalHw ? `${rule}, ek başlık` : rule;
            matchedRules.push(fullRule);

            const mainHw = n.headwords[0] || candidate;
            matchedHeadwords.push(capitalizeWord(mainHw));
          }
        }
      }
    }

    if (matchedNotes.length > 0) {
      return {
        matchedHeadword: matchedHeadwords[0] || capitalizeWord(word),
        rule: matchedRules.join(', '),
        notes: matchedNotes,
      };
    }
  }

  return null;
}

function deduplicateNotes(notes: PoolNote[]): PoolNote[] {
  const seen = new Set<string>();
  const res: PoolNote[] = [];
  for (const n of notes) {
    if (!seen.has(n.guid)) {
      seen.add(n.guid);
      res.push(n);
    }
  }
  return res;
}
