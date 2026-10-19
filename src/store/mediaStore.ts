/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getAppDB, MEDIA_STORE } from './db';
import { MediaRecord, MediaStorageSummary } from '../types/media';
import { speakText, stopAllSounds } from '../utils/speech';

let activeMediaAudio: HTMLAudioElement | null = null;
let activeMediaUrl: string | null = null;

class MediaStore {
  private listeners: Set<() => void> = new Set();
  // In-memory index of lowercased filenames -> exact stored key
  private keyLookupLower: Map<string, string> = new Map();
  private isLookupIndexBuilt: boolean = false;

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
   * Builds or refreshes the lightweight in-memory filename lookup index (names only, no blobs)
   */
  public async refreshLookupIndex(): Promise<void> {
    try {
      const db = await this.getDB();
      const lookup = new Map<string, string>();

      await new Promise<void>((resolve, reject) => {
        try {
          const tx = db.transaction(MEDIA_STORE, 'readonly');
          const store = tx.objectStore(MEDIA_STORE);
          const req = store.openKeyCursor();

          req.onsuccess = () => {
            const cursor = req.result;
            if (cursor) {
              const key = String(cursor.key);
              lookup.set(key.toLowerCase(), key);
              try {
                lookup.set(decodeURIComponent(key).toLowerCase(), key);
              } catch {
                // Ignore malformed URI
              }
              cursor.continue();
            } else {
              resolve();
            }
          };

          req.onerror = () => reject(req.error);
        } catch (err) {
          reject(err);
        }
      });

      this.keyLookupLower = lookup;
      this.isLookupIndexBuilt = true;
    } catch (err) {
      console.warn('Failed to build media lookup index:', err);
    }
  }

  /**
   * Retrieves a single media record by name, trying exact, decoded, and case-insensitive matches.
   */
  public async getMedia(name: string): Promise<MediaRecord | null> {
    if (!name) return null;
    const cleanName = name.trim();
    if (!cleanName) return null;

    try {
      const db = await this.getDB();

      // 1. Direct match first
      const direct = await this.fetchByKey(db, cleanName);
      if (direct) return direct;

      // 2. URL-decoded match
      let decoded = cleanName;
      try {
        decoded = decodeURIComponent(cleanName);
      } catch {
        // Ignore
      }
      if (decoded !== cleanName) {
        const decodedMatch = await this.fetchByKey(db, decoded);
        if (decodedMatch) return decodedMatch;
      }

      // 3. In-memory case-insensitive lookup
      if (!this.isLookupIndexBuilt) {
        await this.refreshLookupIndex();
      }

      const lowerKey = cleanName.toLowerCase();
      let indexedKey = this.keyLookupLower.get(lowerKey);
      if (!indexedKey) {
        indexedKey = this.keyLookupLower.get(decoded.toLowerCase());
      }

      if (indexedKey && indexedKey !== cleanName && indexedKey !== decoded) {
        const matched = await this.fetchByKey(db, indexedKey);
        if (matched) return matched;
      }

      return null;
    } catch (err) {
      console.warn(`Error getting media "${name}":`, err);
      return null;
    }
  }

  private fetchByKey(db: IDBDatabase, key: string): Promise<MediaRecord | null> {
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(MEDIA_STORE, 'readonly');
        const store = tx.objectStore(MEDIA_STORE);
        const req = store.get(key);

        req.onsuccess = () => {
          resolve((req.result as MediaRecord) || null);
        };
        req.onerror = () => {
          resolve(null);
        };
      } catch {
        resolve(null);
      }
    });
  }

  /**
   * Returns a map of filename -> size for fast incremental check without loading blobs.
   */
  public async getExistingMediaMap(): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    try {
      const db = await this.getDB();

      await new Promise<void>((resolve, reject) => {
        try {
          const tx = db.transaction(MEDIA_STORE, 'readonly');
          const store = tx.objectStore(MEDIA_STORE);
          const req = store.openCursor();

          req.onsuccess = () => {
            const cursor = req.result;
            if (cursor) {
              const val = cursor.value as MediaRecord;
              if (val && val.name) {
                map.set(val.name, val.size || 0);
              }
              cursor.continue();
            } else {
              resolve();
            }
          };

          req.onerror = () => reject(req.error);
        } catch (err) {
          reject(err);
        }
      });
    } catch (err) {
      console.warn('Failed to load existing media map:', err);
    }
    return map;
  }

  /**
   * Adds a batch of media records (up to ~20 items) inside a single readwrite transaction.
   */
  public async addMediaBatch(records: MediaRecord[]): Promise<void> {
    if (records.length === 0) return;

    const db = await this.getDB();

    await new Promise<void>((resolve, reject) => {
      try {
        const tx = db.transaction(MEDIA_STORE, 'readwrite');
        const store = tx.objectStore(MEDIA_STORE);

        for (const record of records) {
          store.put(record);
        }

        tx.oncomplete = () => {
          // Update in-memory index with added records
          for (const r of records) {
            this.keyLookupLower.set(r.name.toLowerCase(), r.name);
            try {
              this.keyLookupLower.set(decodeURIComponent(r.name).toLowerCase(), r.name);
            } catch {
              // Ignore
            }
          }
          resolve();
        };

        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
      } catch (err) {
        reject(err);
      }
    });

    this.notify();
  }

  /**
   * Clears the media store completely without touching texts, pool notes, or settings.
   */
  public async clearAllMedia(): Promise<void> {
    this.stopAllAudio();
    const db = await this.getDB();

    await new Promise<void>((resolve, reject) => {
      try {
        const tx = db.transaction(MEDIA_STORE, 'readwrite');
        const store = tx.objectStore(MEDIA_STORE);
        const req = store.clear();

        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });

    this.keyLookupLower.clear();
    this.isLookupIndexBuilt = false;
    this.notify();
  }

  /**
   * Computes a storage summary: count of audio, image, total bytes, and storage quota estimate.
   */
  public async getStorageSummary(): Promise<MediaStorageSummary> {
    let totalFiles = 0;
    let totalBytes = 0;
    let audioCount = 0;
    let imageCount = 0;

    try {
      const db = await this.getDB();

      await new Promise<void>((resolve) => {
        try {
          const tx = db.transaction(MEDIA_STORE, 'readonly');
          const store = tx.objectStore(MEDIA_STORE);
          const req = store.openCursor();

          req.onsuccess = () => {
            const cursor = req.result;
            if (cursor) {
              const val = cursor.value as MediaRecord;
              if (val) {
                totalFiles++;
                totalBytes += val.size || 0;
                const mime = val.mime || '';
                const name = (val.name || '').toLowerCase();
                if (mime.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(name)) {
                  audioCount++;
                } else if (mime.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(name)) {
                  imageCount++;
                }
              }
              cursor.continue();
            } else {
              resolve();
            }
          };

          req.onerror = () => resolve();
        } catch {
          resolve();
        }
      });
    } catch {
      // Ignore
    }

    let usageBytes: number | undefined;
    let quotaBytes: number | undefined;
    let persisted: boolean | undefined;

    if (typeof navigator !== 'undefined' && navigator.storage) {
      if (navigator.storage.estimate) {
        try {
          const est = await navigator.storage.estimate();
          usageBytes = est.usage;
          quotaBytes = est.quota;
        } catch {
          // Ignore
        }
      }
      if (navigator.storage.persisted) {
        try {
          persisted = await navigator.storage.persisted();
        } catch {
          // Ignore
        }
      }
    }

    return {
      totalFiles,
      totalBytes,
      audioCount,
      imageCount,
      usageBytes,
      quotaBytes,
      persisted,
    };
  }

  /**
   * Plays sound using real media file from IndexedDB.
   * If not found, falls back to speech synthesis and triggers fallback callback.
   */
  public async playSound(
    soundFileName: string,
    fallbackHeadword: string,
    onFallback?: (msg: string) => void
  ): Promise<void> {
    this.stopAllAudio();

    if (!soundFileName) {
      speakText(fallbackHeadword);
      if (onFallback) onFallback('Ses dosyası yok, tarayıcı sesi kullanıldı');
      return;
    }

    try {
      const record = await this.getMedia(soundFileName);

      if (record && record.blob && record.blob.size > 0) {
        const objectUrl = URL.createObjectURL(record.blob);
        activeMediaUrl = objectUrl;

        const audio = new Audio(objectUrl);
        activeMediaAudio = audio;

        const cleanup = () => {
          if (activeMediaAudio === audio) {
            activeMediaAudio = null;
          }
          if (activeMediaUrl === objectUrl) {
            activeMediaUrl = null;
          }
          URL.revokeObjectURL(objectUrl);
        };

        audio.onended = cleanup;
        audio.onerror = (e) => {
          console.warn(`Audio playback error for ${soundFileName}:`, e);
          cleanup();
          speakText(fallbackHeadword);
          if (onFallback) onFallback('Ses dosyası çalınamadı, tarayıcı sesi kullanıldı');
        };

        await audio.play();
        return;
      }
    } catch (err) {
      console.warn(`Audio play failed for ${soundFileName}:`, err);
    }

    // Fallback: browser speech synthesis
    speakText(fallbackHeadword);
    if (onFallback) {
      onFallback('Ses dosyası yok, tarayıcı sesi kullanıldı');
    }
  }

  /**
   * Immediately stops any playing media audio or speech synthesis and revokes active URLs.
   */
  public stopAllAudio(): void {
    if (activeMediaAudio) {
      try {
        activeMediaAudio.pause();
        activeMediaAudio.currentTime = 0;
      } catch (e) {
        console.warn('Error pausing audio:', e);
      }
      activeMediaAudio = null;
    }
    if (activeMediaUrl) {
      try {
        URL.revokeObjectURL(activeMediaUrl);
      } catch (e) {
        console.warn('Error revoking url:', e);
      }
      activeMediaUrl = null;
    }
    stopAllSounds();
  }
}

export const mediaStore = new MediaStore();
