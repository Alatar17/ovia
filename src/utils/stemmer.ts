/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface StemCandidate {
  candidate: string;
  rule: string;
}

const CONSONANTS = 'bcdfghjklmnpqrstvwxyz';

/**
 * Checks if a character is an English consonant
 */
function isConsonant(char: string): boolean {
  return CONSONANTS.includes(char.toLowerCase());
}

/**
 * Generate candidate lemma/stems according to the Turkish rules specified in Section 7.3.
 * Minimum stem length safety rule: candidate must be at least 3 letters.
 */
export function generateStemCandidates(rawWord: string): StemCandidate[] {
  const word = rawWord.toLowerCase();
  const results: StemCandidate[] = [];
  const seen = new Set<string>();

  const add = (candidate: string, rule: string) => {
    const clean = candidate.trim().toLowerCase();
    // Safety check: Stem must be at least 3 characters
    if (clean.length >= 3 && clean !== word && !seen.has(`${clean}:${rule}`)) {
      seen.add(`${clean}:${rule}`);
      results.push({ candidate: clean, rule });
    }
  };

  // 10. Possessives: 's and s'
  if (word.endsWith("'s") || word.endsWith("’s")) {
    add(word.slice(0, -2), "'s");
  } else if (word.endsWith("s'") || word.endsWith("s’")) {
    add(word.slice(0, -1), "s'");
  }

  // 1. -s, 2. -es, 3. -ies, 4. -ves
  if (word.endsWith('ies') && word.length > 4) {
    add(word.slice(0, -3) + 'y', '-ies → -y');
  }

  if (word.endsWith('ves') && word.length > 4) {
    add(word.slice(0, -3) + 'f', '-ves → -f');
    add(word.slice(0, -3) + 'fe', '-ves → -fe');
  }

  if (word.endsWith('es') && word.length > 3) {
    add(word.slice(0, -2), '-es');
  }

  if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3) {
    add(word.slice(0, -1), '-s');
  }

  // 5. -ed, 6. -ied
  if (word.endsWith('ied') && word.length > 4) {
    add(word.slice(0, -3) + 'y', '-ied → -y');
  }

  if (word.endsWith('ed') && word.length > 3) {
    // ed'yi at (played -> play)
    add(word.slice(0, -2), '-ed');
    // sadece d'yi at (breathed -> breathe)
    add(word.slice(0, -1), '-ed (sadece -d)');

    // çift ünsüzü tek yap (stopped -> stop, planned -> plan)
    const base = word.slice(0, -2);
    if (base.length >= 3) {
      const last = base[base.length - 1];
      const prev = base[base.length - 2];
      if (last === prev && isConsonant(last) && last !== 's' && last !== 'l') {
        add(base.slice(0, -1), '-ed (çift ünsüz)');
      }
    }
  }

  // 7. -ing
  if (word.endsWith('ing') && word.length > 4) {
    // -ing'i at (walking -> walk)
    add(word.slice(0, -3), '-ing');

    // sonuna e ekle (breathing -> breathe, hoping -> hope)
    add(word.slice(0, -3) + 'e', '-ing + e');

    // -ying -> -ie (lying -> lie, dying -> die)
    if (word.endsWith('ying') && word.length > 4) {
      add(word.slice(0, -4) + 'ie', '-ying → -ie');
    }

    // çift ünsüzü tek yap (running -> run, swimming -> swim)
    const base = word.slice(0, -3);
    if (base.length >= 3) {
      const last = base[base.length - 1];
      const prev = base[base.length - 2];
      if (last === prev && isConsonant(last) && last !== 's') {
        add(base.slice(0, -1), '-ing (çift ünsüz)');
      }
    }
  }

  // 8. -ly
  if (word.endsWith('ly') && word.length > 3) {
    // -ically -> -ic (scientifically -> scientific)
    if (word.endsWith('ically') && word.length > 6) {
      add(word.slice(0, -6) + 'ic', '-ically → -ic');
    }

    // -ily -> -y (happily -> happy)
    if (word.endsWith('ily') && word.length > 4) {
      add(word.slice(0, -3) + 'y', '-ily → -y');
    }

    // -ly -> -le (gently -> gentle, simply -> simple)
    if (word.length > 4) {
      add(word.slice(0, -2) + 'le', '-ly → -le');
    }

    // ly'yi at (quickly -> quick)
    add(word.slice(0, -2), '-ly');
  }

  // 9. -er, -est
  if (word.endsWith('ier') && word.length > 4) {
    add(word.slice(0, -3) + 'y', '-ier → -y');
  } else if (word.endsWith('iest') && word.length > 5) {
    add(word.slice(0, -4) + 'y', '-iest → -y');
  }

  if (word.endsWith('er') && word.length > 3) {
    add(word.slice(0, -2), '-er');
    add(word.slice(0, -2) + 'e', '-er + e');
    const base = word.slice(0, -2);
    if (base.length >= 3) {
      const last = base[base.length - 1];
      const prev = base[base.length - 2];
      if (last === prev && isConsonant(last)) {
        add(base.slice(0, -1), '-er (çift ünsüz)');
      }
    }
  }

  if (word.endsWith('est') && word.length > 4) {
    add(word.slice(0, -3), '-est');
    add(word.slice(0, -3) + 'e', '-est + e');
    const base = word.slice(0, -3);
    if (base.length >= 3) {
      const last = base[base.length - 1];
      const prev = base[base.length - 2];
      if (last === prev && isConsonant(last)) {
        add(base.slice(0, -1), '-est (çift ünsüz)');
      }
    }
  }

  return results;
}
