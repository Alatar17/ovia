/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StoredText } from '../types/text';
import { SAMPLE_ARTICLE } from '../data/readingData';
import { getAppDB, TEXTS_STORE, META_STORE } from './db';

class TextStore {
  public isIndexedDBAvailable: boolean = true;
  public initError: string | null = null;
  private seedChecked: boolean = false;

  constructor() {
    this.tryRequestPersistentStorage();
  }

  /**
   * Request persistent storage to prevent browser eviction
   */
  private tryRequestPersistentStorage() {
    if (typeof window !== 'undefined' && navigator?.storage?.persist) {
      navigator.storage.persist().catch(() => {
        // Silently ignore failures per spec
      });
    }
  }

  /**
   * Open IndexedDB database via shared connection manager
   */
  private async getDB(): Promise<IDBDatabase> {
    try {
      const db = await getAppDB();
      this.isIndexedDBAvailable = true;

      if (!this.seedChecked) {
        this.seedChecked = true;
        try {
          await this.seedInitialTextIfNeeded(db);
        } catch (seedErr) {
          console.warn('Initial seed check error:', seedErr);
        }
      }

      return db;
    } catch (err: any) {
      this.isIndexedDBAvailable = false;
      this.initError = err?.message || 'IndexedDB başlatılamadı.';
      throw err;
    }
  }

  /**
   * Seed the default sample text ("Eski Bahçe") on the very first launch only.
   * If deleted later, the flag 'initial_seed_done' prevents re-adding.
   */
  private async seedInitialTextIfNeeded(db: IDBDatabase): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction([META_STORE, TEXTS_STORE], 'readwrite');
        const metaStore = tx.objectStore(META_STORE);
        const textStore = tx.objectStore(TEXTS_STORE);

        const checkSeedReq = metaStore.get('initial_seed_done');

        checkSeedReq.onsuccess = () => {
          const alreadySeeded = checkSeedReq.result?.value === true;
          if (alreadySeeded) {
            resolve();
            return;
          }

          // Initial text record for "Eski Bahçe"
          const sampleRecord: StoredText = {
            id: SAMPLE_ARTICLE.id || 'article-eski-bahce',
            title: SAMPLE_ARTICLE.title || 'Eski Bahçe',
            level: (SAMPLE_ARTICLE.level as any) || 'B1',
            group: 'Doğa',
            createdAt: Date.now(),
            paragraphs: SAMPLE_ARTICLE.paragraphs.map((p, pIdx) =>
              p.map((s, sIdx) => ({
                id: s.id || `s-${pIdx}-${sIdx}`,
                en: s.en,
                tr: s.tr,
              }))
            ),
          };

          textStore.put(sampleRecord);
          metaStore.put({ key: 'initial_seed_done', value: true, seededAt: Date.now() });

          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };

        checkSeedReq.onerror = () => {
          reject(checkSeedReq.error);
        };
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * Retrieve all texts stored in IndexedDB
   */
  public async getAll(): Promise<StoredText[]> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(TEXTS_STORE, 'readonly');
        const store = tx.objectStore(TEXTS_STORE);
        const request = store.getAll();

        request.onsuccess = () => {
          const results = (request.result as StoredText[]) || [];
          resolve(results);
        };

        request.onerror = () => {
          reject(request.error);
        };
      });
    } catch (err) {
      console.error('getAll failed:', err);
      return [];
    }
  }

  /**
   * Add a single new text record
   */
  public async add(text: StoredText): Promise<StoredText> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(TEXTS_STORE, 'readwrite');
      const store = tx.objectStore(TEXTS_STORE);
      const request = store.add(text);

      request.onsuccess = () => {
        resolve(text);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * Batch add multiple texts (useful for import & restore)
   */
  public async addMany(texts: StoredText[]): Promise<StoredText[]> {
    if (!texts.length) return [];
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(TEXTS_STORE, 'readwrite');
      const store = tx.objectStore(TEXTS_STORE);

      for (const item of texts) {
        store.put(item);
      }

      tx.oncomplete = () => {
        resolve(texts);
      };

      tx.onerror = () => {
        reject(tx.error);
      };
    });
  }

  /**
   * Update an existing text record
   */
  public async update(text: StoredText): Promise<StoredText> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(TEXTS_STORE, 'readwrite');
      const store = tx.objectStore(TEXTS_STORE);
      const request = store.put(text);

      request.onsuccess = () => {
        resolve(text);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * Delete a text by ID
   */
  public async delete(id: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(TEXTS_STORE, 'readwrite');
      const store = tx.objectStore(TEXTS_STORE);
      const request = store.delete(id);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }
}

export const textStore = new TextStore();
