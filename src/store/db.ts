/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const DB_NAME = 'ovia_library_db';
export const DB_VERSION = 4;

export const TEXTS_STORE = 'texts';
export const META_STORE = 'meta';
export const POOL_NOTES_STORE = 'poolNotes';
export const POOL_SETTINGS_STORE = 'poolSettings';
export const MEDIA_STORE = 'media';
export const CUSTOM_MATCHES_STORE = 'customMatches';
export const DISABLED_BUILTINS_STORE = 'disabledBuiltins';

let sharedDbPromise: Promise<IDBDatabase> | null = null;

/**
 * Singleton database connection for the entire application to prevent
 * IndexedDB version upgrade deadlocks between textStore and poolStore.
 */
export function getAppDB(): Promise<IDBDatabase> {
  if (sharedDbPromise) {
    return sharedDbPromise;
  }

  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.reject(new Error('IndexedDB bu ortamda desteklenmiyor.'));
  }

  sharedDbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // 1. Text library stores (Phase 1)
        if (!db.objectStoreNames.contains(TEXTS_STORE)) {
          db.createObjectStore(TEXTS_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE, { keyPath: 'key' });
        }

        // 2. Vocabulary pool stores (Phase 2)
        if (!db.objectStoreNames.contains(POOL_NOTES_STORE)) {
          const notesStore = db.createObjectStore(POOL_NOTES_STORE, { keyPath: 'guid' });
          notesStore.createIndex('deck', 'deck', { unique: false });
          notesStore.createIndex('phrase', 'phrase', { unique: false });
        }
        if (!db.objectStoreNames.contains(POOL_SETTINGS_STORE)) {
          db.createObjectStore(POOL_SETTINGS_STORE, { keyPath: 'key' });
        }

        // 3. Media assets store (Phase 3)
        if (!db.objectStoreNames.contains(MEDIA_STORE)) {
          db.createObjectStore(MEDIA_STORE, { keyPath: 'name' });
        }

        // 4. Custom matches & disabled built-in roots (Phase 4)
        if (!db.objectStoreNames.contains(CUSTOM_MATCHES_STORE)) {
          db.createObjectStore(CUSTOM_MATCHES_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(DISABLED_BUILTINS_STORE)) {
          db.createObjectStore(DISABLED_BUILTINS_STORE, { keyPath: 'root' });
        }
      };

      request.onsuccess = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        db.onversionchange = () => {
          db.close();
          sharedDbPromise = null;
        };
        resolve(db);
      };

      request.onerror = () => {
        sharedDbPromise = null;
        reject(request.error);
      };

      request.onblocked = (event) => {
        console.warn('IndexedDB upgrade blocked by older connection, waiting...', event);
      };
    } catch (err) {
      sharedDbPromise = null;
      reject(err);
    }
  });

  return sharedDbPromise;
}
