/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CustomMatchEntry, FormMappingTarget } from '../types/customMatch';
import { BUILTIN_ENTRIES } from '../utils/ankiParser';
import { getAppDB, CUSTOM_MATCHES_STORE, DISABLED_BUILTINS_STORE } from './db';

class CustomMatchStore {
  public isReady: boolean = false;
  private customMatchesCache: CustomMatchEntry[] = [];
  private disabledBuiltinRootsCache: Set<string> = new Set();
  private listeners: Set<() => void> = new Set();
  private onRebuildNeeded?: () => void;

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((l) => l());
    if (this.onRebuildNeeded) {
      this.onRebuildNeeded();
    }
  }

  public registerRebuildCallback(cb: () => void) {
    this.onRebuildNeeded = cb;
  }

  private getDB(): Promise<IDBDatabase> {
    return getAppDB();
  }

  /**
   * Initializes store on startup: loads custom matches and disabled builtins from DB
   */
  public async initialize(): Promise<void> {
    try {
      const db = await this.getDB();

      // 1. Load custom matches
      const customMatches = await new Promise<CustomMatchEntry[]>((resolve) => {
        try {
          if (!db.objectStoreNames.contains(CUSTOM_MATCHES_STORE)) {
            return resolve([]);
          }
          const tx = db.transaction(CUSTOM_MATCHES_STORE, 'readonly');
          const store = tx.objectStore(CUSTOM_MATCHES_STORE);
          const req = store.getAll();
          req.onsuccess = () => resolve((req.result as CustomMatchEntry[]) || []);
          req.onerror = () => resolve([]);
        } catch {
          resolve([]);
        }
      });

      // 2. Load disabled built-in roots
      const disabledRoots = await new Promise<string[]>((resolve) => {
        try {
          if (!db.objectStoreNames.contains(DISABLED_BUILTINS_STORE)) {
            return resolve([]);
          }
          const tx = db.transaction(DISABLED_BUILTINS_STORE, 'readonly');
          const store = tx.objectStore(DISABLED_BUILTINS_STORE);
          const req = store.getAll();
          req.onsuccess = () => {
            const list = (req.result as Array<{ root: string } | string>) || [];
            const roots = list.map((item) => (typeof item === 'string' ? item : item.root));
            resolve(roots);
          };
          req.onerror = () => resolve([]);
        } catch {
          resolve([]);
        }
      });

      this.customMatchesCache = customMatches;
      this.disabledBuiltinRootsCache = new Set(disabledRoots.map((r) => r.toLowerCase().trim()));
      this.isReady = true;
    } catch (err) {
      console.warn('CustomMatchStore initialize warning:', err);
      this.isReady = true;
    }
  }

  public getAllCustomMatches(): CustomMatchEntry[] {
    return [...this.customMatchesCache];
  }

  public getDisabledBuiltinRoots(): Set<string> {
    return new Set(this.disabledBuiltinRootsCache);
  }

  public isBuiltinDisabled(root: string): boolean {
    return this.disabledBuiltinRootsCache.has(root.toLowerCase().trim());
  }

  /**
   * Builds combined form -> FormMappingTarget[] map using enabled built-ins and all custom entries.
   */
  public buildCombinedMapping(): Map<string, FormMappingTarget[]> {
    const map = new Map<string, FormMappingTarget[]>();

    // 1. Enabled built-ins
    for (const b of BUILTIN_ENTRIES) {
      const root = b.root.toLowerCase().trim();
      if (this.disabledBuiltinRootsCache.has(root)) {
        continue;
      }
      for (const form of b.forms) {
        const cleanForm = form.toLowerCase().trim();
        if (!cleanForm) continue;
        const list = map.get(cleanForm) || [];
        if (!list.some((item) => item.root === root && !item.isCustom)) {
          list.push({ root, isCustom: false });
        }
        map.set(cleanForm, list);
      }
    }

    // 2. Custom entries (if custom root equals built-in root, both apply / custom adds extra forms)
    for (const c of this.customMatchesCache) {
      const root = c.root.toLowerCase().trim();
      for (const form of c.forms) {
        const cleanForm = form.toLowerCase().trim();
        if (!cleanForm) continue;
        const list = map.get(cleanForm) || [];
        if (!list.some((item) => item.root === root && item.isCustom)) {
          list.push({ root, isCustom: true });
        }
        map.set(cleanForm, list);
      }
    }

    return map;
  }

  /**
   * Add a single custom match entry
   */
  public async addCustomMatch(rawRoot: string, rawForms: string[] | string): Promise<CustomMatchEntry> {
    const root = rawRoot.toLowerCase().trim();
    if (!root) {
      throw new Error('Kök kelime boş olamaz.');
    }

    const formsArray = Array.isArray(rawForms)
      ? rawForms
      : rawForms.split(',').map((f) => f.trim().toLowerCase());

    const forms = Array.from(new Set(formsArray.map((f) => f.toLowerCase().trim()).filter(Boolean)));
    if (forms.length === 0) {
      throw new Error('En az bir biçim belirtmelisiniz.');
    }

    // Check duplicate custom root
    const existing = this.customMatchesCache.find((e) => e.root === root);
    if (existing) {
      throw new Error(`"${root}" için zaten özel bir eşleştirme mevcut.`);
    }

    const newEntry: CustomMatchEntry = {
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      root,
      forms,
      createdAt: Date.now(),
    };

    const db = await this.getDB();
    await new Promise<void>((resolve, reject) => {
      try {
        const tx = db.transaction(CUSTOM_MATCHES_STORE, 'readwrite');
        const store = tx.objectStore(CUSTOM_MATCHES_STORE);
        store.put(newEntry);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      } catch (err) {
        reject(err);
      }
    });

    this.customMatchesCache.push(newEntry);
    this.notify();
    return newEntry;
  }

  /**
   * Update an existing custom match entry
   */
  public async updateCustomMatch(
    id: string,
    rawRoot: string,
    rawForms: string[] | string
  ): Promise<CustomMatchEntry> {
    const root = rawRoot.toLowerCase().trim();
    if (!root) {
      throw new Error('Kök kelime boş olamaz.');
    }

    const formsArray = Array.isArray(rawForms)
      ? rawForms
      : rawForms.split(',').map((f) => f.trim().toLowerCase());

    const forms = Array.from(new Set(formsArray.map((f) => f.toLowerCase().trim()).filter(Boolean)));
    if (forms.length === 0) {
      throw new Error('En az bir biçim belirtmelisiniz.');
    }

    // Check conflict with other custom entries
    const conflict = this.customMatchesCache.find((e) => e.root === root && e.id !== id);
    if (conflict) {
      throw new Error(`"${root}" için başka bir özel eşleştirme mevcut.`);
    }

    const existingIdx = this.customMatchesCache.findIndex((e) => e.id === id);
    if (existingIdx === -1) {
      throw new Error('Güncellenecek eşleştirme bulunamadı.');
    }

    const updatedEntry: CustomMatchEntry = {
      ...this.customMatchesCache[existingIdx],
      root,
      forms,
    };

    const db = await this.getDB();
    await new Promise<void>((resolve, reject) => {
      try {
        const tx = db.transaction(CUSTOM_MATCHES_STORE, 'readwrite');
        const store = tx.objectStore(CUSTOM_MATCHES_STORE);
        store.put(updatedEntry);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      } catch (err) {
        reject(err);
      }
    });

    this.customMatchesCache[existingIdx] = updatedEntry;
    this.notify();
    return updatedEntry;
  }

  /**
   * Delete an existing custom match entry
   */
  public async deleteCustomMatch(id: string): Promise<void> {
    const db = await this.getDB();
    await new Promise<void>((resolve, reject) => {
      try {
        const tx = db.transaction(CUSTOM_MATCHES_STORE, 'readwrite');
        const store = tx.objectStore(CUSTOM_MATCHES_STORE);
        store.delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      } catch (err) {
        reject(err);
      }
    });

    this.customMatchesCache = this.customMatchesCache.filter((e) => e.id !== id);
    this.notify();
  }

  /**
   * Toggle disabled state of a built-in root
   */
  public async toggleDisabledBuiltin(rawRoot: string): Promise<boolean> {
    const root = rawRoot.toLowerCase().trim();
    if (!root) return false;

    const isCurrentlyDisabled = this.disabledBuiltinRootsCache.has(root);
    const db = await this.getDB();

    await new Promise<void>((resolve, reject) => {
      try {
        const tx = db.transaction(DISABLED_BUILTINS_STORE, 'readwrite');
        const store = tx.objectStore(DISABLED_BUILTINS_STORE);

        if (isCurrentlyDisabled) {
          // Re-enable
          store.delete(root);
        } else {
          // Disable
          store.put({ root });
        }

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      } catch (err) {
        reject(err);
      }
    });

    if (isCurrentlyDisabled) {
      this.disabledBuiltinRootsCache.delete(root);
    } else {
      this.disabledBuiltinRootsCache.add(root);
    }

    this.notify();
    return !isCurrentlyDisabled;
  }

  /**
   * Bulk add multiple custom entries
   */
  public async bulkAddCustomMatches(
    entries: Array<{ root: string; forms: string[] }>
  ): Promise<number> {
    if (entries.length === 0) return 0;

    const existingRoots = new Set(this.customMatchesCache.map((e) => e.root));
    const toInsert: CustomMatchEntry[] = [];
    const now = Date.now();

    for (let i = 0; i < entries.length; i++) {
      const { root, forms } = entries[i];
      const normRoot = root.toLowerCase().trim();
      if (!normRoot || existingRoots.has(normRoot)) continue;

      const normForms = Array.from(
        new Set(forms.map((f) => f.toLowerCase().trim()).filter(Boolean))
      );
      if (normForms.length === 0) continue;

      existingRoots.add(normRoot);
      toInsert.push({
        id: `custom-${now}-${i}-${Math.random().toString(36).slice(2, 6)}`,
        root: normRoot,
        forms: normForms,
        createdAt: now,
      });
    }

    if (toInsert.length === 0) return 0;

    const db = await this.getDB();
    await new Promise<void>((resolve, reject) => {
      try {
        const tx = db.transaction(CUSTOM_MATCHES_STORE, 'readwrite');
        const store = tx.objectStore(CUSTOM_MATCHES_STORE);
        for (const item of toInsert) {
          store.put(item);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      } catch (err) {
        reject(err);
      }
    });

    this.customMatchesCache = [...this.customMatchesCache, ...toInsert];
    this.notify();
    return toInsert.length;
  }

  /**
   * Restore custom matches from backup
   */
  public async restoreCustomMatches(entries: CustomMatchEntry[]): Promise<void> {
    if (!Array.isArray(entries)) return;
    const db = await this.getDB();

    const validEntries: CustomMatchEntry[] = [];
    const seenRoots = new Set<string>();

    for (const e of entries) {
      if (!e || typeof e !== 'object' || !e.root || !Array.isArray(e.forms)) continue;
      const root = e.root.toLowerCase().trim();
      if (!root || seenRoots.has(root)) continue;
      const forms = Array.from(new Set(e.forms.map((f) => f.toLowerCase().trim()).filter(Boolean)));
      if (forms.length === 0) continue;

      seenRoots.add(root);
      validEntries.push({
        id: e.id || `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        root,
        forms,
        createdAt: e.createdAt || Date.now(),
      });
    }

    await new Promise<void>((resolve, reject) => {
      try {
        const tx = db.transaction(CUSTOM_MATCHES_STORE, 'readwrite');
        const store = tx.objectStore(CUSTOM_MATCHES_STORE);
        store.clear();
        for (const item of validEntries) {
          store.put(item);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      } catch (err) {
        reject(err);
      }
    });

    this.customMatchesCache = validEntries;
    this.notify();
  }

  /**
   * Restore disabled built-ins from backup
   */
  public async restoreDisabledBuiltins(roots: string[]): Promise<void> {
    if (!Array.isArray(roots)) return;
    const cleanRoots = Array.from(
      new Set(roots.map((r) => String(r).toLowerCase().trim()).filter(Boolean))
    );

    const db = await this.getDB();
    await new Promise<void>((resolve, reject) => {
      try {
        const tx = db.transaction(DISABLED_BUILTINS_STORE, 'readwrite');
        const store = tx.objectStore(DISABLED_BUILTINS_STORE);
        store.clear();
        for (const root of cleanRoots) {
          store.put({ root });
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      } catch (err) {
        reject(err);
      }
    });

    this.disabledBuiltinRootsCache = new Set(cleanRoots);
    this.notify();
  }
}

export const customMatchStore = new CustomMatchStore();
