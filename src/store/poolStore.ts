/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PoolNote, PoolSettings, ImportSummary, SkippedPhraseItem } from '../types/pool';
import { FormMappingTarget } from '../types/customMatch';
import { isDeckDisabledByDefault, isDeckOrAncestorDisabled } from '../utils/deckTree';
import { stripHtmlAndSound, classifyNoteHeadwords } from '../utils/ankiParser';
import { parsePhraseHeading, PhraseCandidate } from '../utils/phraseMatcher';
import { getAppDB, POOL_NOTES_STORE, POOL_SETTINGS_STORE } from './db';
import { customMatchStore } from './customMatchStore';

const SETTINGS_KEY = 'config';

class PoolStore {
  public isReady: boolean = false;

  // In-memory active lookup index: headword -> PoolNote[]
  private activePoolIndex: Map<string, PoolNote[]> = new Map();
  // In-memory active phrase index: first-word root -> PhraseCandidate[]
  private activePhraseIndex: Map<string, PhraseCandidate[]> = new Map();
  private activePhraseNotesCount: number = 0;
  private skippedPhraseNotes: SkippedPhraseItem[] = [];
  private showPhrases: boolean = true;

  // In-memory irregular/custom mappings map: form -> target roots []
  private irregularVerbMap: Map<string, FormMappingTarget[]> = new Map();
  // In-memory cached all notes for quick searching and tree rendering
  private allNotesCache: PoolNote[] = [];
  // In-memory cached settings
  private settingsCache: PoolSettings = {
    key: SETTINGS_KEY,
    disabledDecks: [],
    knownDecks: [],
    englishRootDeck: null,
    fileDecksSummary: [],
    lastImportedAt: null,
    lastImportStats: null,
    showPhrases: true,
  };

  private listeners: Set<() => void> = new Set();

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  private getDB(): Promise<IDBDatabase> {
    return getAppDB();
  }

  /**
   * Initializes the pool on app startup: loads settings and notes, builds in-memory indexes
   */
  public async initialize(): Promise<void> {
    try {
      customMatchStore.registerRebuildCallback(() => {
        this.rebuildIndexes();
        this.notify();
      });
      await customMatchStore.initialize();

      const db = await this.getDB();
      // Load settings
      const settings = await this.loadSettingsFromDB(db);
      this.settingsCache = settings;

      // Restore showPhrases preference (default: true)
      if (settings.showPhrases !== undefined) {
        this.showPhrases = Boolean(settings.showPhrases);
      } else {
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            const saved = localStorage.getItem('ovia_show_phrases');
            this.showPhrases = saved !== 'false';
          }
        } catch {
          this.showPhrases = true;
        }
      }

      // Load all notes
      const notes = await this.loadAllNotesFromDB(db);

      // Re-classify any notes that might have outdated classification
      let modifiedAny = false;
      const updatedNotes: PoolNote[] = [];
      for (const note of notes) {
        const englishHtml = note.englishSide === 'on' ? note.front : note.back;
        const frontPlain = stripHtmlAndSound(note.front);
        const backPlain = stripHtmlAndSound(note.back);
        const englishPlain = note.englishSide === 'on' ? frontPlain : backPlain;
        const classification = classifyNoteHeadwords(englishHtml, englishPlain);

        const hwChanged =
          classification.headwords.length !== note.headwords.length ||
          classification.headwords.some((h, i) => h !== note.headwords[i]);

        if (
          hwChanged ||
          classification.phrase !== note.phrase ||
          classification.suspicious !== note.suspicious
        ) {
          modifiedAny = true;
          updatedNotes.push({
            ...note,
            headwords: classification.headwords,
            phrase: classification.phrase,
            suspicious: classification.suspicious,
            suspiciousReasons: classification.suspicious
              ? classification.suspiciousReasons
              : classification.phrase
              ? ['Kalıp (çok kelimeli)']
              : undefined,
          });
        } else {
          updatedNotes.push(note);
        }
      }

      if (modifiedAny) {
        this.allNotesCache = updatedNotes;
        try {
          const tx = db.transaction(POOL_NOTES_STORE, 'readwrite');
          const store = tx.objectStore(POOL_NOTES_STORE);
          for (const item of updatedNotes) {
            store.put(item);
          }
        } catch (e) {
          console.warn('Failed to update reclassified notes in IndexedDB:', e);
        }
      } else {
        this.allNotesCache = notes;
      }

      // Rebuild irregular verbs map and active index
      this.rebuildIndexes();
      this.notify();
    } catch (err) {
      console.warn('PoolStore initialization warning:', err);
    }
  }

  private loadSettingsFromDB(db: IDBDatabase): Promise<PoolSettings> {
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(POOL_SETTINGS_STORE, 'readonly');
        const store = tx.objectStore(POOL_SETTINGS_STORE);
        const req = store.get(SETTINGS_KEY);

        req.onsuccess = () => {
          if (req.result) {
            const res = req.result as any;
            delete res.customIrregularVerbs;
            delete res.irregularVerbDeck;
            resolve(res as PoolSettings);
          } else {
            resolve({
              key: SETTINGS_KEY,
              disabledDecks: [],
              knownDecks: [],
              englishRootDeck: null,
              fileDecksSummary: [],
              lastImportedAt: null,
              lastImportStats: null,
            });
          }
        };

        req.onerror = () => {
          resolve(this.settingsCache);
        };
      } catch {
        resolve(this.settingsCache);
      }
    });
  }

  private loadAllNotesFromDB(db: IDBDatabase): Promise<PoolNote[]> {
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(POOL_NOTES_STORE, 'readonly');
        const store = tx.objectStore(POOL_NOTES_STORE);
        const req = store.getAll();

        req.onsuccess = () => {
          resolve((req.result as PoolNote[]) || []);
        };

        req.onerror = () => {
          resolve([]);
        };
      } catch {
        resolve([]);
      }
    });
  }

  /**
   * Rebuilds in-memory active pool index, active phrase index, and irregular verbs dictionary
   */
  public rebuildIndexes() {
    const disabledSet = new Set(this.settingsCache.disabledDecks);
    const newSingleIndex = new Map<string, PoolNote[]>();
    const newPhraseIndex = new Map<string, PhraseCandidate[]>();
    const activePhraseGuids = new Set<string>();
    const skippedList: SkippedPhraseItem[] = [];

    for (const note of this.allNotesCache) {
      // Respect existing deck on/off choices: notes from closed decks are NOT indexed
      if (isDeckOrAncestorDisabled(note.deck, disabledSet)) {
        continue;
      }

      // Check if note is a phrase (multi-word note)
      const rawHeading = (note.headwords && note.headwords.length > 0 ? note.headwords[0] : '') || '';
      const isMultiWord = Boolean(note.phrase || (rawHeading && /\s/.test(rawHeading.trim())));

      if (isMultiWord) {
        if (!this.showPhrases) {
          continue;
        }

        const parsed = parsePhraseHeading(rawHeading);
        if (!parsed.valid || !parsed.patterns || parsed.patterns.length === 0) {
          const frontPlain = stripHtmlAndSound(note.front);
          const backPlain = stripHtmlAndSound(note.back);
          const englishPlain = note.englishSide === 'on' ? frontPlain : backPlain;
          const otherPlain = note.englishSide === 'on' ? backPlain : frontPlain;

          skippedList.push({
            guid: note.guid,
            deck: note.deck,
            heading: rawHeading,
            reason: parsed.reason || 'Kalıp olarak işlenemedi',
            englishPreview: englishPlain.slice(0, 80),
            otherPreview: otherPlain.slice(0, 60),
            englishSide: note.englishSide,
            note,
          });
          continue;
        }

        activePhraseGuids.add(note.guid);

        for (const p of parsed.patterns) {
          const firstWord = p.firstWord;
          const list = newPhraseIndex.get(firstWord) || [];
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
          newPhraseIndex.set(firstWord, list);
        }
        continue;
      }

      // Single-word headwords indexing
      for (const hw of note.headwords) {
        const clean = hw.toLowerCase().trim();
        if (!clean) continue;
        const list = newSingleIndex.get(clean) || [];
        list.push(note);
        newSingleIndex.set(clean, list);
      }
    }

    this.activePoolIndex = newSingleIndex;
    this.activePhraseIndex = newPhraseIndex;
    this.activePhraseNotesCount = activePhraseGuids.size;
    this.skippedPhraseNotes = skippedList;
    this.irregularVerbMap = customMatchStore.buildCombinedMapping();
  }

  /**
   * Commit confirmed import to database in a single atomic transaction.
   * Only notes belonging to englishRootDeck and its subdecks are saved.
   */
  public async commitImport(params: {
    notesToSave: PoolNote[];
    allDecksInFile: string[];
    fileDecksSummary: Array<{ path: string; noteCount: number }>;
    englishRootDeck: string;
    disabledDecks: string[];
    newDecksList: string[];
    renamedDecks?: Array<{ oldDeck: string; newDeck: string }>;
  }): Promise<ImportSummary> {
    const db = await this.getDB();
    const existingNotesMap = new Map<string, PoolNote>();
    for (const n of this.allNotesCache) {
      existingNotesMap.set(n.guid, n);
    }

    const renameMap = new Map<string, string>();
    if (params.renamedDecks) {
      for (const r of params.renamedDecks) {
        renameMap.set(r.oldDeck, r.newDeck);
      }
    }

    const incomingGuids = new Set<string>();
    let newCount = 0;
    let updatedCount = 0;
    let unchangedCount = 0;
    let suspiciousCount = 0;
    let phraseCount = 0;
    let englishWordsCount = 0;

    const suspiciousList: ImportSummary['suspiciousList'] = [];
    const finalNotesToStore: PoolNote[] = [];

    const now = Date.now();

    for (const note of params.notesToSave) {
      incomingGuids.add(note.guid);

      englishWordsCount++;
      if (note.phrase) {
        phraseCount++;
      }
      if (note.suspicious && !note.phrase) {
        suspiciousCount++;
        const frontPlain = stripHtmlAndSound(note.front);
        const backPlain = stripHtmlAndSound(note.back);
        const englishPlain = note.englishSide === 'on' ? frontPlain : backPlain;
        const otherPlain = note.englishSide === 'on' ? backPlain : frontPlain;
        const reasons =
          note.suspiciousReasons && note.suspiciousReasons.length > 0
            ? note.suspiciousReasons
            : ['Başlık bulunamadı (ilk satır boş veya liste)'];

        suspiciousList.push({
          guid: note.guid,
          deck: note.deck,
          headwords: note.headwords,
          reasons,
          reason: reasons.join(', '),
          englishPreview: englishPlain.slice(0, 80),
          otherPreview: otherPlain.slice(0, 60),
          englishSide: note.englishSide,
          frontPreview: frontPlain.slice(0, 80),
          backPreview: backPlain.slice(0, 60),
        });
      }

      const existing = existingNotesMap.get(note.guid);
      if (!existing) {
        // Brand new note
        newCount++;
        finalNotesToStore.push({
          ...note,
          importedAt: now,
          updatedAt: now,
          missingFromLastImport: false,
        });
      } else {
        // Check if old deck was renamed
        let effectiveExistingDeck = existing.deck;
        if (renameMap.has(effectiveExistingDeck)) {
          effectiveExistingDeck = renameMap.get(effectiveExistingDeck)!;
        }

        const isIdentical =
          existing.front === note.front &&
          existing.back === note.back &&
          existing.hint === note.hint &&
          effectiveExistingDeck === note.deck &&
          existing.tags === note.tags &&
          existing.notetype === note.notetype;

        if (isIdentical) {
          unchangedCount++;
          finalNotesToStore.push({
            ...note,
            importedAt: existing.importedAt || now,
            updatedAt: existing.updatedAt || now,
            missingFromLastImport: false,
          });
        } else {
          updatedCount++;
          finalNotesToStore.push({
            ...note,
            importedAt: existing.importedAt || now,
            updatedAt: now,
            missingFromLastImport: false,
          });
        }
      }
    }

    // Flag notes in DB belonging to the English root deck that were NOT in incoming file as missing
    let missingCount = 0;
    for (const [guid, existing] of existingNotesMap.entries()) {
      if (!incomingGuids.has(guid)) {
        // Only keep track if note belonged to the root deck
        const isUnderRoot =
          existing.deck === params.englishRootDeck ||
          existing.deck.startsWith(`${params.englishRootDeck}::`) ||
          (renameMap.has(existing.deck) &&
            (renameMap.get(existing.deck) === params.englishRootDeck ||
              renameMap.get(existing.deck)!.startsWith(`${params.englishRootDeck}::`)));

        if (isUnderRoot) {
          missingCount++;
          finalNotesToStore.push({
            ...existing,
            deck: renameMap.get(existing.deck) || existing.deck,
            missingFromLastImport: true,
          });
        }
      }
    }

    const summary: ImportSummary = {
      totalInFile: params.notesToSave.length,
      newCount,
      updatedCount,
      unchangedCount,
      missingCount,
      suspiciousCount,
      phraseCount,
      englishWordsCount,
      suspiciousList,
    };

    // Combine known decks
    const knownSet = new Set<string>(this.settingsCache.knownDecks);
    for (const p of params.allDecksInFile) {
      knownSet.add(p);
    }
    // Update renamed decks in known decks
    for (const [oldD, newD] of renameMap.entries()) {
      knownSet.delete(oldD);
      knownSet.add(newD);
    }

    const newSettings: PoolSettings = {
      key: SETTINGS_KEY,
      disabledDecks: params.disabledDecks,
      knownDecks: Array.from(knownSet),
      newDecks: params.newDecksList,
      englishRootDeck: params.englishRootDeck,
      fileDecksSummary: params.fileDecksSummary,
      lastImportedAt: now,
      lastImportStats: summary,
    };

    // Execute in a single atomic transaction
    await new Promise<void>((resolve, reject) => {
      try {
        const tx = db.transaction([POOL_NOTES_STORE, POOL_SETTINGS_STORE], 'readwrite');
        const notesStore = tx.objectStore(POOL_NOTES_STORE);
        const settingsStore = tx.objectStore(POOL_SETTINGS_STORE);

        // Clear all previous notes and put only the active root deck notes
        notesStore.clear();
        for (const item of finalNotesToStore) {
          notesStore.put(item);
        }
        settingsStore.put(newSettings);

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      } catch (err) {
        reject(err);
      }
    });

    this.allNotesCache = finalNotesToStore;
    this.settingsCache = newSettings;
    this.rebuildIndexes();
    this.notify();

    return summary;
  }

  /**
   * Clear the entire vocabulary pool in a single transaction.
   * Clears poolNotes, irregular verbs dictionary, and search index.
   * If resetSettings is true, also clears disabledDecks, knownDecks, englishRootDeck, etc.
   */
  public async clearPool(resetSettings: boolean = true): Promise<void> {
    const db = await this.getDB();
    await new Promise<void>((resolve, reject) => {
      try {
        const tx = db.transaction([POOL_NOTES_STORE, POOL_SETTINGS_STORE], 'readwrite');
        const notesStore = tx.objectStore(POOL_NOTES_STORE);
        const settingsStore = tx.objectStore(POOL_SETTINGS_STORE);

        // 1. Clear all pool notes
        notesStore.clear();

        // 2. Reset or clean settings
        if (resetSettings) {
          const freshSettings: PoolSettings = {
            key: SETTINGS_KEY,
            disabledDecks: [],
            knownDecks: [],
            newDecks: [],
            englishRootDeck: null,
            fileDecksSummary: [],
            lastImportedAt: null,
            lastImportStats: null,
          };
          settingsStore.put(freshSettings);
        } else {
          const preservedSettings: PoolSettings = {
            ...this.settingsCache,
            newDecks: [],
            fileDecksSummary: [],
            lastImportedAt: null,
            lastImportStats: null,
            key: SETTINGS_KEY,
          };
          settingsStore.put(preservedSettings);
        }

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      } catch (err) {
        reject(err);
      }
    });

    // Clear in-memory notes and indexes
    this.allNotesCache = [];
    this.activePoolIndex = new Map();
    this.irregularVerbMap = customMatchStore.buildCombinedMapping();

    if (resetSettings) {
      this.settingsCache = {
        key: SETTINGS_KEY,
        disabledDecks: [],
        knownDecks: [],
        newDecks: [],
        englishRootDeck: null,
        fileDecksSummary: [],
        lastImportedAt: null,
        lastImportStats: null,
      };
    } else {
      this.settingsCache = {
        ...this.settingsCache,
        newDecks: [],
        fileDecksSummary: [],
        lastImportedAt: null,
        lastImportStats: null,
      };
    }

    this.notify();
  }

  /**
   * Save imported notes with GUID comparison (new, updated, unchanged, missing)
   */
  public async saveImportedNotes(
    incomingNotes: PoolNote[],
    allDecksInFile: string[]
  ): Promise<ImportSummary> {
    const rootDeck = this.settingsCache.englishRootDeck || '**İngilizce kelimeler';
    const notesToSave = incomingNotes.filter(
      (n) => n.deck === rootDeck || n.deck.startsWith(`${rootDeck}::`)
    );
    const deckCounts = new Map<string, number>();
    for (const n of incomingNotes) {
      deckCounts.set(n.deck, (deckCounts.get(n.deck) || 0) + 1);
    }
    const fileDecksSummary = Array.from(deckCounts.entries()).map(([path, noteCount]) => ({
      path,
      noteCount,
    }));

    return this.commitImport({
      notesToSave,
      allDecksInFile,
      fileDecksSummary,
      englishRootDeck: rootDeck,
      disabledDecks: this.settingsCache.disabledDecks,
      newDecksList: [],
    });
  }

  /**
   * Delete notes that have missingFromLastImport: true
   */
  public async removeMissingNotes(): Promise<number> {
    const db = await this.getDB();
    const missingGuids: string[] = [];

    for (const n of this.allNotesCache) {
      if (n.missingFromLastImport) {
        missingGuids.push(n.guid);
      }
    }

    if (missingGuids.length === 0) return 0;

    await new Promise<void>((resolve, reject) => {
      try {
        const tx = db.transaction(POOL_NOTES_STORE, 'readwrite');
        const store = tx.objectStore(POOL_NOTES_STORE);

        for (const g of missingGuids) {
          store.delete(g);
        }

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      } catch (err) {
        reject(err);
      }
    });

    const deletedSet = new Set(missingGuids);
    this.allNotesCache = this.allNotesCache.filter((n) => !deletedSet.has(n.guid));
    if (this.settingsCache.lastImportStats) {
      this.settingsCache.lastImportStats.missingCount = 0;
      await this.saveSettings({ lastImportStats: this.settingsCache.lastImportStats });
    }

    this.rebuildIndexes();
    this.notify();
    return missingGuids.length;
  }

  /**
   * Update disabled decks or other pool settings
   */
  public async saveSettings(partial: Partial<PoolSettings>): Promise<void> {
    const db = await this.getDB();
    const updated: PoolSettings = {
      ...this.settingsCache,
      ...partial,
      key: SETTINGS_KEY,
    };

    await new Promise<void>((resolve, reject) => {
      try {
        const tx = db.transaction(POOL_SETTINGS_STORE, 'readwrite');
        const store = tx.objectStore(POOL_SETTINGS_STORE);
        store.put(updated);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      } catch (err) {
        reject(err);
      }
    });

    this.settingsCache = updated;
    this.rebuildIndexes();
    this.notify();
  }

  public getSettings(): PoolSettings {
    return this.settingsCache;
  }

  public getShowPhrases(): boolean {
    return this.showPhrases;
  }

  public async setShowPhrases(show: boolean): Promise<void> {
    this.showPhrases = show;
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('ovia_show_phrases', String(show));
      }
    } catch {}
    await this.saveSettings({ showPhrases: show });
  }

  public getAllNotes(): PoolNote[] {
    return this.allNotesCache;
  }

  public getActivePoolIndex(): Map<string, PoolNote[]> {
    return this.activePoolIndex;
  }

  public getActivePhraseIndex(): Map<string, PhraseCandidate[]> {
    return this.activePhraseIndex;
  }

  public getActivePhraseNotesCount(): number {
    return this.activePhraseNotesCount;
  }

  public getSkippedPhrases(): SkippedPhraseItem[] {
    return this.skippedPhraseNotes;
  }

  public getIrregularVerbMap(): Map<string, FormMappingTarget[]> {
    return this.irregularVerbMap;
  }

  public isDeckDisabled(deckPath: string): boolean {
    return this.settingsCache.disabledDecks.includes(deckPath);
  }
}

export const poolStore = new PoolStore();
