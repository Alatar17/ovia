/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface PoolNote {
  guid: string;
  notetype: string;
  deck: string;
  front: string;
  back: string;
  hint: string;
  tags: string;
  headwords: string[];
  phrase: boolean;
  englishSide: 'on' | 'geri';
  suspicious: boolean;
  suspiciousReasons?: string[];
  importedAt: number;
  updatedAt: number;
  missingFromLastImport?: boolean;
}

export interface PoolSettings {
  key: string;
  disabledDecks: string[];
  knownDecks: string[];
  newDecks?: string[];
  lastImportedAt: number | null;
  lastImportStats?: ImportSummary | null;
  englishRootDeck?: string | null;
  fileDecksSummary?: Array<{ path: string; noteCount: number }>;
  showPhrases?: boolean;
}

export interface SkippedPhraseItem {
  guid: string;
  deck: string;
  heading: string;
  reason: string;
  englishPreview?: string;
  otherPreview?: string;
  englishSide?: 'on' | 'geri';
  note?: PoolNote;
}

export interface PhrasePattern {
  patternString: string;
  words: string[];
  firstWord: string;
  wordCount: number;
  displayHeading: string;
  note: PoolNote;
}

export interface PhraseMatch {
  id: string; // e.g. phrase-s0-w2-w3
  sentenceIndex: number;
  startIndex: number;
  endIndex: number;
  length: number;
  pattern: string;
  matchedText: string;
  displayHeadword: string;
  rule: string;
  firstWordRule: string;
  notes: PoolNote[];
}

export interface SuspiciousItem {
  guid: string;
  deck: string;
  headwords: string[];
  phrase?: boolean;
  reasons?: string[];
  reason?: string;
  englishPreview?: string;
  otherPreview?: string;
  englishSide?: 'on' | 'geri';
  frontPreview: string;
  backPreview?: string;
}

export interface ImportSummary {
  totalInFile: number;
  newCount: number;
  updatedCount: number;
  unchangedCount: number;
  missingCount: number;
  suspiciousCount: number;
  phraseCount: number;
  englishWordsCount: number;
  suspiciousList: SuspiciousItem[];
}

export interface DeckTreeNode {
  name: string;
  path: string;
  noteCount: number;
  isNew?: boolean;
  isOutsideRoot?: boolean;
  children: DeckTreeNode[];
}

export interface RenameCandidate {
  oldDeck: string;
  newDeck: string;
  ratio: number;
  matchCount: number;
  totalNew: number;
}

export interface TokenWordMatch {
  matchedHeadword: string;
  rule: string;
  notes: PoolNote[];
}
