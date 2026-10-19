/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StoredText, BackupData } from '../types/text';
import { textStore } from '../store/textStore';
import { poolStore } from '../store/poolStore';
import { customMatchStore } from '../store/customMatchStore';

/**
 * Generate formatted backup filename: ovia-yedek-YYYY-MM-DD.json
 */
export function getBackupFilename(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `ovia-yedek-${year}-${month}-${day}.json`;
}

/**
 * Export all texts and disabled deck settings as a downloadable JSON file
 */
export async function exportBackup(): Promise<number> {
  const texts = await textStore.getAll();
  const poolSettings = poolStore.getSettings();
  const customMatches = customMatchStore.getAllCustomMatches();
  const disabledBuiltins = Array.from(customMatchStore.getDisabledBuiltinRoots());

  const data: BackupData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    texts,
    disabledDecks: poolSettings.disabledDecks,
    customMatches,
    disabledBuiltins,
  };

  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = getBackupFilename();
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return texts.length;
}

export interface RestoreResult {
  addedCount: number;
  skippedCount: number;
  totalInFile: number;
  error?: string;
}

/**
 * Import texts from a JSON backup file, skipping texts whose id already exists.
 */
export async function importBackup(file: File): Promise<RestoreResult> {
  try {
    const text = await file.text();
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { addedCount: 0, skippedCount: 0, totalInFile: 0, error: 'Dosya geçerli bir JSON biçiminde değil.' };
    }

    let textsToImport: StoredText[] = [];

    // Support both direct array format and { texts: [...] } format
    if (Array.isArray(parsed)) {
      textsToImport = parsed;
    } else if (parsed && Array.isArray(parsed.texts)) {
      textsToImport = parsed.texts;
    } else {
      return { addedCount: 0, skippedCount: 0, totalInFile: 0, error: 'Yedek dosyasında metin listesi bulunamadı.' };
    }

    const currentTexts = await textStore.getAll();
    const existingIds = new Set(currentTexts.map((t) => t.id));

    const newTexts: StoredText[] = [];
    let skippedCount = 0;

    for (const item of textsToImport) {
      if (!item || typeof item !== 'object') continue;
      // Validate mandatory fields
      if (!item.id || !item.title || !Array.isArray(item.paragraphs)) {
        skippedCount++;
        continue;
      }

      if (existingIds.has(item.id)) {
        skippedCount++;
      } else {
        newTexts.push({
          id: item.id,
          title: item.title,
          level: item.level || '',
          group: typeof item.group === 'string' ? item.group : '',
          createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
          paragraphs: item.paragraphs,
        });
        existingIds.add(item.id);
      }
    }

    if (newTexts.length > 0) {
      await textStore.addMany(newTexts);
    }

    // Restore disabled decks configuration if present
    if (parsed && Array.isArray(parsed.disabledDecks)) {
      await poolStore.saveSettings({ disabledDecks: parsed.disabledDecks });
    }

    // Restore custom matches if present (old backups without this field are safe)
    if (parsed && Array.isArray(parsed.customMatches)) {
      await customMatchStore.restoreCustomMatches(parsed.customMatches);
    }

    // Restore disabled built-ins if present (old backups without this field are safe)
    if (parsed && Array.isArray(parsed.disabledBuiltins)) {
      await customMatchStore.restoreDisabledBuiltins(parsed.disabledBuiltins);
    }

    return {
      addedCount: newTexts.length,
      skippedCount,
      totalInFile: textsToImport.length,
    };
  } catch (err: any) {
    return {
      addedCount: 0,
      skippedCount: 0,
      totalInFile: 0,
      error: err?.message || 'Yedek dosyası okunurken hata oluştu.',
    };
  }
}
