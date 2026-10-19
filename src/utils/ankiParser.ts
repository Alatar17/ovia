/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import Papa from 'papaparse';
import { PoolNote, ImportSummary } from '../types/pool';

/**
 * Raw irregular verbs dictionary list.
 * Format: one line per verb: "base: form1, form2, ..."
 */
export const IRREGULAR_VERBS_RAW = `
be: was, were, been
beat: beaten
become: became
begin: began, begun
bend: bent
bite: bit, bitten
blow: blew, blown
break: broke, broken
bring: brought
build: built
buy: bought
catch: caught
choose: chose, chosen
come: came
creep: crept
deal: dealt
dig: dug
do: did, done
draw: drew, drawn
drink: drank, drunk
drive: drove, driven
eat: ate, eaten
fall: fell, fallen
feed: fed
feel: felt
fight: fought
find: found
flee: fled
fly: flew, flown
forbid: forbade, forbidden
forget: forgot, forgotten
forgive: forgave, forgiven
freeze: froze, frozen
get: got, gotten
give: gave, given
go: went, gone
grow: grew, grown
hang: hung
have: had
hear: heard
hide: hid, hidden
hold: held
keep: kept
kneel: knelt
know: knew, known
lay: laid
lead: led
leave: left
lend: lent
lie: lay, lain
light: lit
lose: lost
make: made
mean: meant
meet: met
pay: paid
ride: rode, ridden
ring: rang, rung
rise: rose, risen
run: ran
say: said
see: saw, seen
seek: sought
sell: sold
send: sent
sew: sewed, sewn
shake: shook, shaken
shine: shone
shoot: shot
show: showed, shown
shrink: shrank, shrunk
sing: sang, sung
sink: sank, sunk
sit: sat
sleep: slept
slide: slid
speak: spoke, spoken
spend: spent
spit: spat
spring: sprang, sprung
stand: stood
steal: stole, stolen
stick: stuck
sting: stung
stink: stank, stunk
strike: struck
swear: swore, sworn
sweep: swept
swim: swam, swum
swing: swung
take: took, taken
teach: taught
tear: tore, torn
tell: told
think: thought
throw: threw, thrown
understand: understood
wake: woke, woken
wear: wore, worn
weep: wept
win: won
write: wrote, written
arise: arose, arisen
awake: awoke, awoken
bear: bore, borne
bind: bound
bleed: bled
breed: bred
burn: burnt
cling: clung
dive: dove
dream: dreamt
dwell: dwelt
fling: flung
grind: ground
lean: leant
leap: leapt
learn: learnt
mislead: misled
mistake: mistook, mistaken
overcome: overcame
overtake: overtook, overtaken
overthrow: overthrew, overthrown
oversee: oversaw, overseen
outgrow: outgrew, outgrown
prove: proven
rebuild: rebuilt
redo: redid, redone
rewrite: rewrote, rewritten
slay: slew, slain
sling: slung
smell: smelt
sneak: snuck
sow: sown
spell: spelt
spill: spilt
spin: spun
spoil: spoilt
stride: strode, stridden
strive: strove, striven
swell: swollen
tread: trod, trodden
undergo: underwent, undergone
undertake: undertook, undertaken
undo: undid, undone
uphold: upheld
withdraw: withdrew, withdrawn
withstand: withstood
wind: wound
wring: wrung
foresee: foresaw, foreseen
`.trim();

/**
 * Builds a map from form -> array of base verbs.
 * A form can belong to several bases.
 */
export function buildIrregularVerbMap(raw: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const lines = raw.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.includes(':')) continue;
    const [basePart, formsPart] = trimmed.split(':');
    const base = basePart.trim().toLowerCase();
    if (!base) continue;
    const forms = formsPart.split(',').map((f) => f.trim().toLowerCase()).filter(Boolean);
    for (const form of forms) {
      const existing = map.get(form) || [];
      if (!existing.includes(base)) {
        existing.push(base);
      }
      map.set(form, existing);
    }
  }
  return map;
}

/**
 * Built-in irregular verbs map: form -> array of base verbs
 */
export const STANDARD_IRREGULAR_VERBS: Map<string, string[]> = buildIrregularVerbMap(IRREGULAR_VERBS_RAW);

export interface BuiltinMatchEntry {
  root: string;
  forms: string[];
}

export function parseBuiltinEntries(raw: string): BuiltinMatchEntry[] {
  const list: BuiltinMatchEntry[] = [];
  const lines = raw.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.includes(':')) continue;
    const [basePart, formsPart] = trimmed.split(':');
    const root = basePart.trim().toLowerCase();
    if (!root) continue;
    const forms = formsPart
      .split(',')
      .map((f) => f.trim().toLowerCase())
      .filter(Boolean);
    list.push({ root, forms });
  }
  return list;
}

export const BUILTIN_ENTRIES: BuiltinMatchEntry[] = parseBuiltinEntries(IRREGULAR_VERBS_RAW);

/**
 * Strips HTML tags and decodes common HTML entities
 */
export function stripHtmlAndEntities(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&rsquo;/gi, "'")
    .replace(/&lsquo;/gi, "'")
    .trim();
}

/**
 * Strips HTML tags and [sound:...] markers, decodes entities, collapses whitespace
 */
export function stripHtmlAndSound(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/\[sound:[^\]]*\]/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&rsquo;/gi, "'")
    .replace(/&lsquo;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts first line of an HTML field before <br>, <ul>, <ol>, <div>, [sound:, or newline
 */
export function extractFirstLine(html: string): string {
  if (!html) return '';
  // Strip leading sound tags if any before matching first line
  const cleanedLeading = html.replace(/^\s*\[sound:[^\]]*\]\s*/i, '');
  // Cut off at the first occurrence of line breaks / block starters
  const match = cleanedLeading.match(/^(.*?)(?:<br\s*\/?>|<ul\b|<ol\b|<div\b|<p\b|\[sound:|\r|\n)/i);
  const rawFirst = match ? match[1] : cleanedLeading;
  return stripHtmlAndEntities(rawFirst);
}

const TURKISH_CHARS_REGEX = /[çğıöşüÇĞİÖŞÜ]/;
const POS_TAG_REGEX = /\((?:i|f|s|z)\)\s*$/i;

/**
 * Determines whether English side is Front ('on') or Back ('geri')
 * Section 3.1:
 * Varsayılan: Ön.
 * İstisna: Ön'ün ilk satırı bir Türkçe karakter içeriyorsa veya (i), (f), (s), (z) ile bitiyorsa
 * VE Geri'nin ilk satırı bunlara uymuyorsa, İngilizce taraf Geri'dir.
 */
export function determineEnglishSide(front: string, back: string): 'on' | 'geri' {
  const frontLine = extractFirstLine(front);
  const backLine = extractFirstLine(back);

  const frontHasTurkish = TURKISH_CHARS_REGEX.test(frontLine) || POS_TAG_REGEX.test(frontLine);
  const backHasTurkish = TURKISH_CHARS_REGEX.test(backLine) || POS_TAG_REGEX.test(backLine);

  if (frontHasTurkish && !backHasTurkish) {
    return 'geri';
  }
  return 'on';
}

/**
 * Extract raw headword from English side
 * Section 3.2:
 * Headword extraction must stop before any IPA, "(/" or [sound:] on that line (use the <a> link text if present).
 */
export function extractRawHeadword(englishSideHtml: string): string {
  if (!englishSideHtml) return '';
  const trimmed = englishSideHtml.trim();
  // If field starts with a list, raw headword cannot be cleanly extracted
  if (/^<(?:ul|ol|table)\b/i.test(trimmed)) {
    return '';
  }

  let raw = '';

  // 1. If <a> link present, use its inner text
  const linkMatch = englishSideHtml.match(/<a\b[^>]*>(.*?)<\/a>/i);
  if (linkMatch && linkMatch[1]) {
    raw = stripHtmlAndEntities(linkMatch[1]).trim();
  }

  // 2. Otherwise take first line before line breaks / block starters
  if (!raw) {
    const cleanedLeading = englishSideHtml.replace(/^\s*\[sound:[^\]]*\]\s*/i, '');
    const match = cleanedLeading.match(/^(.*?)(?:<br\s*\/?>|<ul\b|<ol\b|<div\b|<p\b|<\/?tr\b|<\/?td\b|\[sound:|\r|\n)/i);
    raw = match ? match[1] : cleanedLeading;
  }

  // Headword extraction must stop before any IPA, "(/" or [sound:] on that line
  // 1. Stop before "(/" or "( /"
  const parenSlashIdx = raw.search(/\s*\(\s*\//);
  if (parenSlashIdx !== -1) {
    raw = raw.substring(0, parenSlashIdx);
  }

  // 2. Stop before "[sound:"
  const soundIdx = raw.search(/\[sound:/i);
  if (soundIdx !== -1) {
    raw = raw.substring(0, soundIdx);
  }

  // 3. Stop before IPA "/.../" or space followed by "/"
  const slashIdx = raw.search(/\s+\/[^\/]+\//);
  if (slashIdx !== -1) {
    raw = raw.substring(0, slashIdx);
  } else {
    const spaceSlash = raw.search(/\s+\//);
    if (spaceSlash !== -1) {
      raw = raw.substring(0, spaceSlash);
    }
  }

  // 4. Stop before " IPA" or "(IPA"
  const ipaWordIdx = raw.search(/\s*[\(\[]?\bIPA\b/i);
  if (ipaWordIdx !== -1) {
    raw = raw.substring(0, ipaWordIdx);
  }

  return stripHtmlAndEntities(raw).trim();
}

/**
 * Cleans headword string: strips parentheticals (1), (2), (E2), (US), (i), (f), (s), (z),
 * leading numbering, normalizes quotes and lowercases.
 */
export function cleanHeadword(rawHeadword: string): {
  cleanWord: string;
  hasWhitespace: boolean;
  hasLetters: boolean;
} {
  let cleaned = rawHeadword.trim();

  // Strip trailing parenthetical markers repeatedly: (1), (2), (E2), (US), (UK), (i), (f), (s), (z), etc.
  while (/\s*\([^)]*\)\s*$/.test(cleaned)) {
    cleaned = cleaned.replace(/\s*\([^)]*\)\s*$/, '').trim();
  }

  // Strip leading numbering: "1-", "2.", "1)"
  cleaned = cleaned.replace(/^\s*\d+[-.)]\s*/, '').trim();

  // Normalize quotes: ’ -> '
  cleaned = cleaned.replace(/[\u2018\u2019]/g, "'");

  // Lowercase
  cleaned = cleaned.toLowerCase().trim();

  const hasLetters = /[a-z]/.test(cleaned);
  const hasWhitespace = /\s/.test(cleaned);

  return {
    cleanWord: cleaned,
    hasWhitespace,
    hasLetters,
  };
}

// Auto rule for multi-headword notes:
// On the plain text of the English side, find single words that start with a capital letter
// and are immediately followed by optional space + "(/"
// Words starting with a lowercase letter (e.g. "range" in "Mountain range (/...") are not taken.
export function extractMultiHeadwords(englishPlain: string): string[] {
  if (!englishPlain) return [];
  const regex = /(?:^|[^A-Za-z'-])([A-Z][A-Za-z'-]*)\s*\(\s*\//g;
  const matches: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(englishPlain)) !== null) {
    if (m[1]) {
      const w = m[1].trim();
      if (w) {
        matches.push(w);
      }
    }
  }
  return matches;
}

export interface NoteClassificationResult {
  headwords: string[];
  phrase: boolean;
  suspicious: boolean;
  suspiciousReasons: string[];
  isMultiHeadword: boolean;
}

/**
 * Classifies headwords, phrase and suspicious status according to:
 * 1. Multi-headwords: if >= 2 matches, all (lowercased, deduplicated, plus main if exists)
 *    become headwords, and note is phrase:false, even if main headword could not be extracted.
 * 2. New rule: a note is a phrase ONLY if the cleaned headword itself contains whitespace.
 * 3. The presence of IPA or [sound:...] must NEVER make a note a phrase or suspicious
 *    when a clean single-word headword was extracted.
 * 4. Suspicious notes = notes where NO headword could be extracted and which are not phrases.
 */
export function classifyNoteHeadwords(
  englishHtml: string,
  englishPlain: string
): NoteClassificationResult {
  // 1. Check multi-headword matches
  const multiMatches = extractMultiHeadwords(englishPlain);

  // 2. Extract main headword
  const rawHw = extractRawHeadword(englishHtml);
  const { cleanWord, hasWhitespace, hasLetters } = cleanHeadword(rawHw);

  if (multiMatches.length >= 2) {
    const headwordsSet = new Set<string>();
    const headwords: string[] = [];

    // Prioritize clean main headword first if valid single word
    if (cleanWord && hasLetters && !hasWhitespace) {
      headwordsSet.add(cleanWord);
      headwords.push(cleanWord);
    }

    for (const match of multiMatches) {
      const lower = match.toLowerCase().trim();
      if (lower && !headwordsSet.has(lower)) {
        headwordsSet.add(lower);
        headwords.push(lower);
      }
    }

    return {
      headwords,
      phrase: false,
      suspicious: false,
      suspiciousReasons: [],
      isMultiHeadword: true,
    };
  }

  // Slash-split check if each part is a single word (e.g. "So/Such")
  if (cleanWord && cleanWord.includes('/') && !hasWhitespace) {
    const parts = cleanWord.split('/').map((p) => p.trim()).filter(Boolean);
    const allSingleWords = parts.every((p) => /^[a-z0-9'’-]+$/.test(p) && !p.includes(' '));
    if (allSingleWords && parts.length > 0) {
      return {
        headwords: parts,
        phrase: false,
        suspicious: false,
        suspiciousReasons: [],
        isMultiHeadword: parts.length > 1,
      };
    }
  }

  // Normal single headword / phrase
  if (cleanWord && hasLetters) {
    if (hasWhitespace) {
      return {
        headwords: [cleanWord],
        phrase: true,
        suspicious: false,
        suspiciousReasons: ['Kalıp (çok kelimeli)'],
        isMultiHeadword: false,
      };
    }

    // Clean single word: never a phrase, never suspicious
    return {
      headwords: [cleanWord],
      phrase: false,
      suspicious: false,
      suspiciousReasons: [],
      isMultiHeadword: false,
    };
  }

  // No headword could be extracted
  const reasons: string[] = [];
  if (!cleanWord) {
    reasons.push('Başlık bulunamadı (ilk satır boş veya liste)');
  } else if (!hasLetters) {
    reasons.push('Başlıkta harf yok');
  }

  if (rawHw.length > 40) {
    reasons.push('Başlık 40 karakterden uzun');
  }

  return {
    headwords: [],
    phrase: false,
    suspicious: true,
    suspiciousReasons: reasons.length > 0 ? reasons : ['Başlık bulunamadı (ilk satır boş veya liste)'],
    isMultiHeadword: false,
  };
}

export interface CleanHeadwordResult {
  headwords: string[];
  phrase: boolean;
  suspicious: boolean;
  suspiciousReasons: string[];
  suspiciousReason?: string;
}

/**
 * Backward compatible wrapper for cleanAndClassifyHeadword
 */
export function cleanAndClassifyHeadword(rawHeadword: string): CleanHeadwordResult {
  const { cleanWord, hasWhitespace, hasLetters } = cleanHeadword(rawHeadword);
  if (!cleanWord || !hasLetters) {
    const reasons = !cleanWord
      ? ['Başlık bulunamadı (ilk satır boş veya liste)']
      : ['Başlıkta harf yok'];
    return {
      headwords: [],
      phrase: false,
      suspicious: true,
      suspiciousReasons: reasons,
      suspiciousReason: reasons.join(', '),
    };
  }

  if (hasWhitespace) {
    return {
      headwords: [cleanWord],
      phrase: true,
      suspicious: false,
      suspiciousReasons: ['Kalıp (çok kelimeli)'],
      suspiciousReason: 'Kalıp (çok kelimeli)',
    };
  }

  return {
    headwords: [cleanWord],
    phrase: false,
    suspicious: false,
    suspiciousReasons: [],
    suspiciousReason: undefined,
  };
}

export interface ParseAnkiFileResult {
  notes: PoolNote[];
  summary: ImportSummary;
  allDecksInFile: string[];
}

/**
 * Parses Anki "Notes in Plain Text" file
 */
export async function parseAnkiPlainText(fileContent: string): Promise<ParseAnkiFileResult> {
  // 1. Parse top directives starting with '#'
  let pos = 0;
  const headerDirectives: Record<string, string> = {};

  while (pos < fileContent.length) {
    if (fileContent[pos] === '#') {
      const nextNewline = fileContent.indexOf('\n', pos);
      const lineEnd = nextNewline === -1 ? fileContent.length : nextNewline;
      const line = fileContent.substring(pos, lineEnd).trim();

      // Check if it has directive syntax: #key:value or #key column:N
      const colonIdx = line.indexOf(':');
      if (colonIdx !== -1) {
        const key = line.substring(1, colonIdx).trim().toLowerCase();
        const val = line.substring(colonIdx + 1).trim();
        headerDirectives[key] = val;
        pos = nextNewline === -1 ? fileContent.length : nextNewline + 1;
      } else {
        // Not a header directive with colon; stop header processing
        break;
      }
    } else if (fileContent[pos] === '\r' || fileContent[pos] === '\n') {
      // Empty line between directives
      pos++;
    } else {
      break;
    }
  }

  const bodyText = fileContent.substring(pos);

  // Validate header structure
  // Header directives typically include guid, notetype, deck, tags
  const guidCol = headerDirectives['guid column'] ? parseInt(headerDirectives['guid column'], 10) : 1;
  const notetypeCol = headerDirectives['notetype column'] ? parseInt(headerDirectives['notetype column'], 10) : 2;
  const deckCol = headerDirectives['deck column'] ? parseInt(headerDirectives['deck column'], 10) : 3;
  const tagsCol = headerDirectives['tags column'] ? parseInt(headerDirectives['tags column'], 10) : 7;

  if (guidCol !== 1 || notetypeCol !== 2 || deckCol !== 3 || tagsCol !== 7) {
    throw new Error(
      `Beklenmeyen dosya formatı: Sütun başlıkları beklenen Anki formatına uymuyor (guid: ${guidCol}, notetype: ${notetypeCol}, deck: ${deckCol}, tags: ${tagsCol}).`
    );
  }

  // 2. Parse TSV with PapaParse
  const parsed = Papa.parse<string[]>(bodyText, {
    delimiter: '\t',
    quoteChar: '"',
    escapeChar: '"',
    skipEmptyLines: 'greedy',
    comments: false, // CRITICAL: NEVER skip '#' comments!
  });

  if (parsed.errors && parsed.errors.length > 0) {
    // Only throw if fatal
    const fatal = parsed.errors.find((e) => e.type === 'Delimiter');
    if (fatal) {
      throw new Error(`TSV ayrıştırma hatası: ${fatal.message}`);
    }
  }

  const rawRows = parsed.data;
  const now = Date.now();

  const notes: PoolNote[] = [];
  const suspiciousList: ImportSummary['suspiciousList'] = [];
  const decksSet = new Set<string>();

  let suspiciousCount = 0;
  let phraseCount = 0;
  let englishWordsCount = 0;

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!row || row.length < 3) continue;

    // Ensure 7 columns
    while (row.length < 7) {
      row.push('');
    }

    const guid = row[0]?.trim();
    if (!guid) continue;

    const notetype = row[1] || '';
    const deck = row[2] || '';
    const front = row[3] || '';
    const back = row[4] || '';
    const hint = row[5] || '';
    const tags = row[6] || '';

    decksSet.add(deck);

    if (deck.startsWith('**İngilizce kelimeler')) {
      englishWordsCount++;
    }

    // Determine English side
    const englishSide = determineEnglishSide(front, back);
    const englishHtml = englishSide === 'on' ? front : back;
    const otherHtml = englishSide === 'on' ? back : front;

    const frontPlain = stripHtmlAndSound(front);
    const backPlain = stripHtmlAndSound(back);
    const englishPlain = englishSide === 'on' ? frontPlain : backPlain;
    const otherPlain = englishSide === 'on' ? backPlain : frontPlain;

    // Extract headword & multi-headwords
    const {
      headwords,
      phrase,
      suspicious,
      suspiciousReasons,
    } = classifyNoteHeadwords(englishHtml, englishPlain);

    if (suspicious) {
      suspiciousCount++;
      suspiciousList.push({
        guid,
        deck,
        headwords,
        reasons: suspiciousReasons,
        reason: suspiciousReasons.join(', '),
        englishPreview: englishPlain.slice(0, 80),
        otherPreview: otherPlain.slice(0, 60),
        englishSide,
        frontPreview: frontPlain.slice(0, 80),
        backPreview: backPlain.slice(0, 60),
      });
    }

    if (phrase) {
      phraseCount++;
    }

    const note: PoolNote = {
      guid,
      notetype,
      deck,
      front,
      back,
      hint,
      tags,
      headwords,
      phrase,
      englishSide,
      suspicious,
      suspiciousReasons: suspicious ? suspiciousReasons : (phrase ? ['Kalıp (çok kelimeli)'] : undefined),
      importedAt: now,
      updatedAt: now,
    };

    notes.push(note);
  }

  const summary: ImportSummary = {
    totalInFile: notes.length,
    newCount: 0, // Calculated during DB comparison
    updatedCount: 0, // Calculated during DB comparison
    unchangedCount: 0, // Calculated during DB comparison
    missingCount: 0,
    suspiciousCount,
    phraseCount,
    englishWordsCount,
    suspiciousList,
  };

  return {
    notes,
    summary,
    allDecksInFile: Array.from(decksSet).sort((a, b) => a.localeCompare(b, 'tr')),
  };
}
