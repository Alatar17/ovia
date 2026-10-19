/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CustomMatchEntry } from './customMatch';

export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | '';

export interface StoredSentence {
  id: string;
  en: string;
  tr: string;
}

export interface StoredText {
  id: string;
  title: string;
  level: CEFRLevel;
  group: string; // Free string; empty string represents "Grupsuz"
  createdAt: number; // Unix timestamp in ms
  paragraphs: StoredSentence[][];
}

export interface BackupData {
  version: number;
  exportedAt: string;
  texts: StoredText[];
  disabledDecks?: string[];
  customMatches?: CustomMatchEntry[];
  disabledBuiltins?: string[];
}
