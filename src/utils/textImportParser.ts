/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CEFRLevel, StoredSentence, StoredText } from '../types/text';

export interface ParseIssue {
  line?: number;
  message: string;
}

export interface ParsedTextItem {
  tempId: string;
  title: string;
  level: CEFRLevel;
  group: string;
  paragraphs: StoredSentence[][];
  sentenceCount: number;
  paragraphCount: number;
  warnings: ParseIssue[];
  errors: ParseIssue[];
  isValid: boolean;
  startLine: number;
}

export interface ParseResult {
  texts: ParsedTextItem[];
  totalErrors: number;
  totalWarnings: number;
}

const VALID_LEVELS: Set<string> = new Set(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);

interface TextInProgress {
  startLine: number;
  title: string | null;
  level: CEFRLevel;
  group: string;
  paragraphs: StoredSentence[][];
  currentParagraph: StoredSentence[];
  pendingEn: { en: string; lineNum: number } | null;
  hasBlankLineSinceLastSentence: boolean;
  warnings: ParseIssue[];
  errors: ParseIssue[];
  hasEnOrTr: boolean;
}

function createNewTextInProgress(lineNum: number): TextInProgress {
  return {
    startLine: lineNum,
    title: null,
    level: '',
    group: '',
    paragraphs: [],
    currentParagraph: [],
    pendingEn: null,
    hasBlankLineSinceLastSentence: false,
    warnings: [],
    errors: [],
    hasEnOrTr: false,
  };
}

interface HeaderParseMatch {
  key: 'title' | 'level' | 'group' | 'unknown';
  rawKey: string;
  value: string;
}

/**
 * Tolerantly parse a header line:
 * Keys: Başlık / Baslik / Title, Seviye / Level, Grup / Group
 * Case-insensitive, optional leading #, optional markdown bold markers (** or *)
 */
function parseHeaderLine(line: string): HeaderParseMatch | null {
  const trimmed = line.trim();
  const withoutHashes = trimmed.replace(/^#+\s*/, '');

  // Match: optional **, key, optional **, colon, optional **, value
  // Handles: **Başlık:** val, **Başlık**: val, # Başlık: val, Başlık: val, Title: val, etc.
  const headerRegex = /^(?:\*\*|\*)?\s*(başlık|baslik|title|seviye|level|grup|group)\s*(?:\*\*|\*)?\s*:\s*(?:\*\*|\*)?\s*(.*)$/i;
  const match = withoutHashes.match(headerRegex);

  if (match) {
    const rawKey = match[1].trim().toLowerCase();
    let val = match[2].trim();
    // Strip surrounding markdown bold or italics from value if present
    val = val
      .replace(/^\*\*(.*)\*\*$/, '$1')
      .replace(/^\*(.*)\*$/, '$1')
      .replace(/^\*+|\*+$/g, '')
      .trim();

    if (rawKey === 'başlık' || rawKey === 'baslik' || rawKey === 'title') {
      return { key: 'title', rawKey, value: val };
    }
    if (rawKey === 'seviye' || rawKey === 'level') {
      return { key: 'level', rawKey, value: val };
    }
    if (rawKey === 'grup' || rawKey === 'group') {
      return { key: 'group', rawKey, value: val };
    }
  }

  // If the line had leading '#', check if it was an unrecognized header field with colon
  if (trimmed.startsWith('#')) {
    const genericHeaderMatch = trimmed.match(/^#+\s*([^:]+)\s*:\s*(.*)$/);
    if (genericHeaderMatch) {
      return {
        key: 'unknown',
        rawKey: genericHeaderMatch[1].trim(),
        value: genericHeaderMatch[2].trim(),
      };
    }
  }

  return null;
}

/**
 * Match EN: line, tolerating optional markdown bold markers like **EN:** or EN:
 */
function matchEnLine(trimmed: string): string | null {
  const match = trimmed.match(/^(?:\*\*|\*)?\s*EN\s*(?:\*\*|\*)?\s*:\s*(?:\*\*|\*)?\s*(.*)$/i);
  if (!match) return null;
  let val = match[1].trim();
  val = val
    .replace(/^\*\*(.*)\*\*$/, '$1')
    .replace(/^\*(.*)\*$/, '$1')
    .replace(/^\*+|\*+$/g, '')
    .trim();
  return val;
}

/**
 * Match TR: line, tolerating optional markdown bold markers like **TR:** or TR:
 */
function matchTrLine(trimmed: string): string | null {
  const match = trimmed.match(/^(?:\*\*|\*)?\s*TR\s*(?:\*\*|\*)?\s*:\s*(?:\*\*|\*)?\s*(.*)$/i);
  if (!match) return null;
  let val = match[1].trim();
  val = val
    .replace(/^\*\*(.*)\*\*$/, '$1')
    .replace(/^\*(.*)\*$/, '$1')
    .replace(/^\*+|\*+$/g, '')
    .trim();
  return val;
}

/**
 * Finalize an in-progress text item
 */
function finalizeCurrentText(textState: TextInProgress, textIndex: number): ParsedTextItem | null {
  // If an EN was waiting for TR at end of text
  if (textState.pendingEn) {
    textState.errors.push({
      line: textState.pendingEn.lineNum,
      message: `Satır ${textState.pendingEn.lineNum}: "EN:" cümlesinden sonra "TR:" çevirisi bulunamadı.`,
    });
    textState.pendingEn = null;
  }

  // Push pending paragraph if any
  if (textState.currentParagraph.length > 0) {
    textState.paragraphs.push(textState.currentParagraph);
    textState.currentParagraph = [];
  }

  const sentenceCount = textState.paragraphs.reduce((sum, p) => sum + p.length, 0);

  // Check if this text block is completely empty
  const isEmpty =
    !textState.hasEnOrTr &&
    !textState.title &&
    !textState.level &&
    !textState.group &&
    textState.errors.length === 0 &&
    textState.warnings.length === 0;

  if (isEmpty) {
    return null;
  }

  if (sentenceCount === 0) {
    textState.errors.push({
      line: textState.startLine,
      message: `Satır ${textState.startLine}: Bu metin hiç geçerli EN/TR cümlesi içermiyor.`,
    });
  }

  // Title fallback if missing
  let finalTitle = textState.title ? textState.title.trim() : '';
  if (!finalTitle) {
    if (sentenceCount > 0 && textState.paragraphs[0]?.[0]?.en) {
      const firstSentence = textState.paragraphs[0][0].en;
      finalTitle = firstSentence.length > 50 ? firstSentence.slice(0, 50).trim() + '...' : firstSentence;
    } else {
      finalTitle = `İsimsiz Metin #${textIndex + 1}`;
    }
  }

  const isValid = textState.errors.length === 0 && sentenceCount > 0;

  return {
    tempId: `parsed-${textIndex}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: finalTitle,
    level: textState.level,
    group: textState.group.trim(),
    paragraphs: textState.paragraphs,
    sentenceCount,
    paragraphCount: textState.paragraphs.length,
    warnings: textState.warnings,
    errors: textState.errors,
    isValid,
    startLine: textState.startLine,
  };
}

/**
 * Tolerant text parser that splits multiple texts separated by `=====` or `-----`
 * or a new "Başlık:" / "Title:" line after sentences,
 * and parses Headers, EN:, TR: sentences and paragraphs.
 */
export function parseTexts(rawString: string): ParseResult {
  // Strip UTF-8 BOM if present
  let cleanString = rawString;
  if (cleanString.charCodeAt(0) === 0xfeff) {
    cleanString = cleanString.slice(1);
  }

  // Normalize line endings
  const allLines = cleanString.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  const parsedTexts: ParsedTextItem[] = [];
  let currentText: TextInProgress = createNewTextInProgress(1);

  for (let idx = 0; idx < allLines.length; idx++) {
    const lineNum = idx + 1;
    const lineText = allLines[idx];
    const trimmed = lineText.trim();

    // 1. Ignore code fence lines (``` or ```text or ```markdown etc.)
    if (/^\s*```[\w-]*\s*$/.test(trimmed)) {
      continue;
    }

    // 2. Empty blank line: signals paragraph boundary if sentences were already parsed
    if (trimmed === '') {
      if (currentText.currentParagraph.length > 0) {
        currentText.hasBlankLineSinceLastSentence = true;
      }
      continue;
    }

    // 3. Separator line: 3 or more '=' OR 3 or more '-'
    if (/^\s*(={3,}|-{3,})\s*$/.test(trimmed)) {
      const finalized = finalizeCurrentText(currentText, parsedTexts.length);
      if (finalized) {
        parsedTexts.push(finalized);
      }
      currentText = createNewTextInProgress(lineNum + 1);
      continue;
    }

    // 4. Header lines (Başlık / Title, Seviye / Level, Grup / Group)
    const header = parseHeaderLine(trimmed);
    if (header) {
      // If an EN was waiting for TR, that's an error
      if (currentText.pendingEn) {
        currentText.errors.push({
          line: currentText.pendingEn.lineNum,
          message: `Satır ${currentText.pendingEn.lineNum}: "EN:" cümlesinden sonra "TR:" çevirisi bulunamadı.`,
        });
        currentText.pendingEn = null;
      }

      if (header.key === 'title') {
        // "A new 'Başlık:' line that appears after sentences must start a NEW text even if there is no '=====' separator."
        const hasSentences =
          currentText.paragraphs.length > 0 ||
          currentText.currentParagraph.length > 0 ||
          currentText.hasEnOrTr;

        if (hasSentences) {
          const finalized = finalizeCurrentText(currentText, parsedTexts.length);
          if (finalized) {
            parsedTexts.push(finalized);
          }
          currentText = createNewTextInProgress(lineNum);
        }

        currentText.title = header.value;
        currentText.startLine = lineNum;
        continue;
      }

      if (header.key === 'level') {
        const upper = header.value.toUpperCase();
        if (VALID_LEVELS.has(upper)) {
          currentText.level = upper as CEFRLevel;
        } else if (header.value !== '') {
          currentText.warnings.push({
            line: lineNum,
            message: `Satır ${lineNum}: Tanınmayan seviye "${header.value}". Yalnızca A1, A2, B1, B2, C1 veya C2 geçerlidir; seviye boş bırakıldı.`,
          });
          currentText.level = '';
        } else {
          currentText.level = '';
        }
        continue;
      }

      if (header.key === 'group') {
        currentText.group = header.value;
        continue;
      }

      if (header.key === 'unknown') {
        currentText.warnings.push({
          line: lineNum,
          message: `Satır ${lineNum}: Tanınmayan başlık alanı "#${header.rawKey}" yoksayıldı.`,
        });
        continue;
      }
    }

    // 5. EN line: e.g. "EN: The old garden was quiet." or "**EN:** ..."
    const enVal = matchEnLine(trimmed);
    if (enVal !== null) {
      currentText.hasEnOrTr = true;
      if (currentText.pendingEn) {
        currentText.errors.push({
          line: currentText.pendingEn.lineNum,
          message: `Satır ${currentText.pendingEn.lineNum}: "EN:" cümlesinden sonra "TR:" çevirisi bulunamadı.`,
        });
      }

      // If blank line was seen between sentences -> start new paragraph
      if (currentText.hasBlankLineSinceLastSentence && currentText.currentParagraph.length > 0) {
        currentText.paragraphs.push(currentText.currentParagraph);
        currentText.currentParagraph = [];
        currentText.hasBlankLineSinceLastSentence = false;
      }

      currentText.pendingEn = {
        en: enVal,
        lineNum,
      };
      continue;
    }

    // 6. TR line: e.g. "TR: Eski bahçe sabah sessizdi." or "**TR:** ..."
    const trVal = matchTrLine(trimmed);
    if (trVal !== null) {
      currentText.hasEnOrTr = true;
      if (!currentText.pendingEn) {
        currentText.errors.push({
          line: lineNum,
          message: `Satır ${lineNum}: "TR:" çevirisinden önce "EN:" İngilizce cümlesi bulunamadı.`,
        });
      } else {
        const sId = `s-${parsedTexts.length}-${currentText.paragraphs.length}-${currentText.currentParagraph.length}-${Math.random().toString(36).slice(2, 7)}`;
        currentText.currentParagraph.push({
          id: sId,
          en: currentText.pendingEn.en,
          tr: trVal,
        });
        currentText.pendingEn = null;
        currentText.hasBlankLineSinceLastSentence = false;
      }
      continue;
    }

    // 7. Check if line starts with '#' but had no colon
    if (trimmed.startsWith('#')) {
      currentText.warnings.push({
        line: lineNum,
        message: `Satır ${lineNum}: Hatalı başlık satırı biçimi (iki nokta üst üste eksik): "${trimmed}"`,
      });
      continue;
    }

    // 8. Stray unmatched line (e.g. comments, notes, stray markdown)
    currentText.warnings.push({
      line: lineNum,
      message: `Satır ${lineNum}: Tanınmayan satır yoksayıldı: "${trimmed.length > 50 ? trimmed.slice(0, 50) + '...' : trimmed}"`,
    });
  }

  // End of all lines: finalize any remaining text
  const finalized = finalizeCurrentText(currentText, parsedTexts.length);
  if (finalized) {
    parsedTexts.push(finalized);
  }

  let totalErrors = 0;
  let totalWarnings = 0;
  parsedTexts.forEach((t) => {
    totalErrors += t.errors.length;
    totalWarnings += t.warnings.length;
  });

  return {
    texts: parsedTexts,
    totalErrors,
    totalWarnings,
  };
}

/**
 * Convert a valid parsed item into a StoredText for IndexedDB
 */
export function parsedItemToStoredText(item: ParsedTextItem): StoredText {
  return {
    id: `text-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: item.title,
    level: item.level,
    group: item.group,
    createdAt: Date.now(),
    paragraphs: item.paragraphs,
  };
}

/**
 * Serialize a StoredText into the standard import format
 */
export function serializeStoredText(text: StoredText): string {
  const lines: string[] = [];
  lines.push(`# Başlık: ${text.title}`);
  lines.push(`# Seviye: ${text.level || ''}`);
  lines.push(`# Grup: ${text.group || ''}`);
  lines.push('');

  const paragraphBlocks = text.paragraphs.map((p) => {
    return p.map((s) => `EN: ${s.en}\nTR: ${s.tr}`).join('\n');
  });

  lines.push(paragraphBlocks.join('\n\n'));

  return lines.join('\n');
}

