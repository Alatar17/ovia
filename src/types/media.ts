/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface MediaRecord {
  name: string;
  blob: Blob;
  size: number;
  mime: string;
  importedAt: number;
}

export interface NeededMediaItem {
  originalName: string;
  decks: Set<string>;
  headwords: Set<string>;
  guids: Set<string>;
}

export interface MediaImportStats {
  addedCount: number;
  alreadyExistedCount: number;
  unusedSkippedCount: number;
  missingInApkgCount: number;
  totalInApkg: number;
  totalNeeded: number;
  missingList: Array<{
    fileName: string;
    deck?: string;
    headword?: string;
  }>;
}

export interface MediaStorageSummary {
  totalFiles: number;
  totalBytes: number;
  audioCount: number;
  imageCount: number;
  usageBytes?: number;
  quotaBytes?: number;
  persisted?: boolean;
}

export interface ApkgImportProgress {
  phase: 'reading-index' | 'analyzing' | 'extracting' | 'completed' | 'cancelled';
  processedCount: number;
  totalNeededCount: number;
  processedBytes: number;
  totalBytes: number;
  currentFileName: string;
}
