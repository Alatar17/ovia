/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  ArrowLeft,
  Search,
  X,
  Plus,
  AlertCircle,
  Edit2,
  Trash2,
  Check,
  RotateCcw,
  Eye,
  FilePlus2,
} from 'lucide-react';
import { BUILTIN_ENTRIES } from '../utils/ankiParser';
import { customMatchStore } from '../store/customMatchStore';
import { poolStore } from '../store/poolStore';
import { CustomMatchEntry } from '../types/customMatch';

interface CustomMatchesViewProps {
  onBack: () => void;
  onNotify?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

type FilterChip = 'all' | 'custom' | 'builtin' | 'disabled';

interface BulkPreviewResult {
  valid: Array<{ root: string; forms: string[]; lineNum: number; raw: string }>;
  invalid: Array<{ lineNum: number; raw: string; reason: string }>;
}

export const CustomMatchesView: React.FC<CustomMatchesViewProps> = ({ onBack, onNotify }) => {
  // Store subscriptions
  const [storeRevision, setStoreRevision] = useState(0);

  useEffect(() => {
    const unsubCustom = customMatchStore.subscribe(() => {
      setStoreRevision((r) => r + 1);
    });
    const unsubPool = poolStore.subscribe(() => {
      setStoreRevision((r) => r + 1);
    });
    return () => {
      unsubCustom();
      unsubPool();
    };
  }, []);

  // UI state
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterChip>('all');

  // Add row form state
  const [addRoot, setAddRoot] = useState('');
  const [addForms, setAddForms] = useState('');
  const [addError, setAddError] = useState<string | null>(null);

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRoot, setEditRoot] = useState('');
  const [editForms, setEditForms] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  // Delete confirmation state
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Bulk add state
  const [bulkText, setBulkText] = useState('');
  const [bulkPreview, setBulkPreview] = useState<BulkPreviewResult | null>(null);

  // Load custom matches & disabled built-in roots from store
  const customMatches = useMemo(() => {
    return customMatchStore.getAllCustomMatches();
  }, [storeRevision]);

  const disabledBuiltins = useMemo(() => {
    return customMatchStore.getDisabledBuiltinRoots();
  }, [storeRevision]);

  // Active pool headwords lookup for "havuzda yok" check
  const activePoolIndex = useMemo(() => {
    return poolStore.getActivePoolIndex();
  }, [storeRevision]);

  // Single source counts
  const builtinCount = BUILTIN_ENTRIES.length;
  const customCount = customMatches.length;
  const disabledCount = disabledBuiltins.size;

  // Real-time pool warning for the add row
  const cleanAddRoot = addRoot.trim().toLowerCase();
  const isAddRootInPool = useMemo(() => {
    if (!cleanAddRoot) return true;
    return activePoolIndex.has(cleanAddRoot);
  }, [cleanAddRoot, activePoolIndex]);

  // Combined and filtered entries
  const displayedEntries = useMemo(() => {
    type UnifiedEntry =
      | { type: 'builtin'; root: string; forms: string[]; isDisabled: boolean; id: string }
      | { type: 'custom'; root: string; forms: string[]; id: string; createdAt: number };

    const list: UnifiedEntry[] = [];

    // Built-in entries
    if (activeFilter === 'all' || activeFilter === 'builtin' || activeFilter === 'disabled') {
      for (const b of BUILTIN_ENTRIES) {
        const root = b.root.toLowerCase().trim();
        const isDisabled = disabledBuiltins.has(root);

        if (activeFilter === 'disabled' && !isDisabled) {
          continue;
        }

        list.push({
          type: 'builtin',
          root,
          forms: b.forms,
          isDisabled,
          id: `builtin-${root}`,
        });
      }
    }

    // Custom entries
    if (activeFilter === 'all' || activeFilter === 'custom') {
      for (const c of customMatches) {
        list.push({
          type: 'custom',
          root: c.root,
          forms: c.forms,
          id: c.id,
          createdAt: c.createdAt,
        });
      }
    }

    // Search filter across both roots and forms
    const query = searchQuery.trim().toLowerCase();
    const filtered = query
      ? list.filter((item) => {
          if (item.root.toLowerCase().includes(query)) return true;
          return item.forms.some((f) => f.toLowerCase().includes(query));
        })
      : list;

    // Alphabetical sort by root
    return filtered.sort((a, b) => a.root.localeCompare(b.root, 'tr'));
  }, [activeFilter, customMatches, disabledBuiltins, searchQuery]);

  // Handle single add
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);

    const root = addRoot.trim().toLowerCase();
    if (!root) {
      setAddError('Kök kelime giriniz.');
      return;
    }

    const forms = addForms
      .split(',')
      .map((f) => f.trim().toLowerCase())
      .filter(Boolean);

    if (forms.length === 0) {
      setAddError('En az bir biçim giriniz (örn: children).');
      return;
    }

    // Check duplicate custom root
    const exists = customMatches.some((c) => c.root === root);
    if (exists) {
      setAddError(`"${root}" için zaten özel bir eşleştirme mevcut.`);
      return;
    }

    try {
      await customMatchStore.addCustomMatch(root, forms);
      setAddRoot('');
      setAddForms('');
      setAddError(null);
      onNotify?.(`"${root}" özel eşleştirmesi eklendi.`, 'success');
    } catch (err: any) {
      setAddError(err?.message || 'Eşleştirme eklenemedi.');
    }
  };

  // Handle inline edit save
  const handleEditSave = async (id: string) => {
    setEditError(null);
    const root = editRoot.trim().toLowerCase();
    if (!root) {
      setEditError('Kök kelime boş olamaz.');
      return;
    }

    const forms = editForms
      .split(',')
      .map((f) => f.trim().toLowerCase())
      .filter(Boolean);

    if (forms.length === 0) {
      setEditError('En az bir biçim belirtmelisiniz.');
      return;
    }

    // Check conflict
    const conflict = customMatches.some((c) => c.root === root && c.id !== id);
    if (conflict) {
      setEditError(`"${root}" için zaten başka bir özel eşleştirme mevcut.`);
      return;
    }

    try {
      await customMatchStore.updateCustomMatch(id, root, forms);
      setEditingId(null);
      setEditRoot('');
      setEditForms('');
      setEditError(null);
      onNotify?.(`"${root}" eşleştirmesi güncellendi.`, 'success');
    } catch (err: any) {
      setEditError(err?.message || 'Güncelleme başarısız oldu.');
    }
  };

  const handleStartEdit = (entry: CustomMatchEntry) => {
    setEditingId(entry.id);
    setEditRoot(entry.root);
    setEditForms(entry.forms.join(', '));
    setEditError(null);
    setDeletingId(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditRoot('');
    setEditForms('');
    setEditError(null);
  };

  // Handle delete
  const handleDeleteConfirm = async (id: string, root: string) => {
    try {
      await customMatchStore.deleteCustomMatch(id);
      setDeletingId(null);
      onNotify?.(`"${root}" eşleştirmesi silindi.`, 'info');
    } catch (err: any) {
      onNotify?.(err?.message || 'Silme işlemi başarısız.', 'error');
    }
  };

  // Handle built-in toggle
  const handleToggleBuiltin = async (root: string) => {
    try {
      const isNowEnabled = await customMatchStore.toggleDisabledBuiltin(root);
      if (isNowEnabled) {
        onNotify?.(`"${root}" hazır eşleştirmesi etkinleştirildi.`, 'success');
      } else {
        onNotify?.(`"${root}" hazır eşleştirmesi kapatıldı.`, 'info');
      }
    } catch (err: any) {
      onNotify?.(err?.message || 'İşlem başarısız.', 'error');
    }
  };

  // Handle bulk preview
  const handleGenerateBulkPreview = () => {
    if (!bulkText.trim()) {
      setBulkPreview(null);
      return;
    }

    const lines = bulkText.split('\n');
    const existingCustomRoots = new Set(customMatches.map((c) => c.root));
    const seenInBulk = new Set<string>();

    const valid: BulkPreviewResult['valid'] = [];
    const invalid: BulkPreviewResult['invalid'] = [];

    lines.forEach((rawLine, index) => {
      const lineNum = index + 1;
      const trimmed = rawLine.trim();
      if (!trimmed) {
        // Skip purely empty lines without error
        return;
      }

      if (!trimmed.includes(':')) {
        invalid.push({
          lineNum,
          raw: trimmed,
          reason: "':' işareti bulunamadı (biçim: kök: biçim1, biçim2)",
        });
        return;
      }

      const colonIdx = trimmed.indexOf(':');
      const rootPart = trimmed.slice(0, colonIdx).trim().toLowerCase();
      const formsPart = trimmed.slice(colonIdx + 1);

      if (!rootPart) {
        invalid.push({
          lineNum,
          raw: trimmed,
          reason: 'Kök kelime boş',
        });
        return;
      }

      const forms = Array.from(
        new Set(
          formsPart
            .split(',')
            .map((f) => f.trim().toLowerCase())
            .filter(Boolean)
        )
      );

      if (forms.length === 0) {
        invalid.push({
          lineNum,
          raw: trimmed,
          reason: 'Biçim listesi boş',
        });
        return;
      }

      if (existingCustomRoots.has(rootPart)) {
        invalid.push({
          lineNum,
          raw: trimmed,
          reason: `"${rootPart}" kökü zaten özel eşleştirmelerde mevcut`,
        });
        return;
      }

      if (seenInBulk.has(rootPart)) {
        invalid.push({
          lineNum,
          raw: trimmed,
          reason: `"${rootPart}" kökü toplu listede birden fazla kez geçiyor`,
        });
        return;
      }

      seenInBulk.add(rootPart);
      valid.push({
        root: rootPart,
        forms,
        lineNum,
        raw: trimmed,
      });
    });

    setBulkPreview({ valid, invalid });
  };

  // Handle bulk add confirm
  const handleBulkAddConfirm = async () => {
    if (!bulkPreview || bulkPreview.valid.length === 0) return;

    try {
      const count = await customMatchStore.bulkAddCustomMatches(
        bulkPreview.valid.map((v) => ({ root: v.root, forms: v.forms }))
      );
      setBulkText('');
      setBulkPreview(null);
      onNotify?.(`${count} özel eşleştirme başarıyla eklendi.`, 'success');
    } catch (err: any) {
      onNotify?.(err?.message || 'Toplu ekleme sırasında hata oluştu.', 'error');
    }
  };

  return (
    <div className="min-h-screen bg-[var(--app-bg)] text-[var(--app-text)] pb-24">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-[var(--app-bg)]/95 backdrop-blur-md border-b border-slate-800/80 px-4 sm:px-8 py-3.5">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="p-2 -ml-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/70 border border-transparent hover:border-slate-700/50 transition-colors cursor-pointer flex items-center gap-1.5"
              aria-label="Geri dön"
            >
              <ArrowLeft className="w-5 h-5 text-slate-300" />
              <span className="text-sm font-medium hidden xs:inline">Geri</span>
            </button>
            <div>
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white leading-tight">
                Özel eşleştirmeler
              </h1>
              <div className="text-xs text-slate-400 font-normal mt-0.5">
                Hazır {builtinCount} · Özel {customCount} · Kapalı {disabledCount}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-4xl mx-auto px-4 sm:px-8 py-6 space-y-6">
        {/* Search Box */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Kök veya biçim ara... (örn: go, went, child)"
            className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-[var(--app-surface)] border border-slate-700/80 text-white placeholder-slate-400 text-sm focus:outline-hidden focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500/50 transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-white cursor-pointer"
              aria-label="Aramayı temizle"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filter Chips */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs sm:text-sm">
          <button
            type="button"
            onClick={() => setActiveFilter('all')}
            className={`px-3.5 py-1.5 rounded-xl font-medium transition-colors cursor-pointer shrink-0 ${
              activeFilter === 'all'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-xs'
                : 'bg-[var(--app-surface)] text-slate-300 hover:text-white hover:bg-slate-800/80 border border-slate-700/70'
            }`}
          >
            Hepsi ({builtinCount + customCount})
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter('custom')}
            className={`px-3.5 py-1.5 rounded-xl font-medium transition-colors cursor-pointer shrink-0 ${
              activeFilter === 'custom'
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-xs'
                : 'bg-[var(--app-surface)] text-slate-300 hover:text-white hover:bg-slate-800/80 border border-slate-700/70'
            }`}
          >
            Özel ({customCount})
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter('builtin')}
            className={`px-3.5 py-1.5 rounded-xl font-medium transition-colors cursor-pointer shrink-0 ${
              activeFilter === 'builtin'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-xs'
                : 'bg-[var(--app-surface)] text-slate-300 hover:text-white hover:bg-slate-800/80 border border-slate-700/70'
            }`}
          >
            Hazır ({builtinCount})
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter('disabled')}
            className={`px-3.5 py-1.5 rounded-xl font-medium transition-colors cursor-pointer shrink-0 ${
              activeFilter === 'disabled'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-xs'
                : 'bg-[var(--app-surface)] text-slate-300 hover:text-white hover:bg-slate-800/80 border border-slate-700/70'
            }`}
          >
            Kapalı ({disabledCount})
          </button>
        </div>

        {/* Add Row Section */}
        <section className="bg-[var(--app-surface)] border border-slate-700/80 rounded-2xl p-4 sm:p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-slate-200">
            <Plus className="w-4 h-4 text-emerald-400" />
            <span>Yeni özel eşleştirme ekle</span>
          </div>

          <form onSubmit={handleAddSubmit} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
              <div className="sm:col-span-4">
                <input
                  type="text"
                  value={addRoot}
                  onChange={(e) => {
                    setAddRoot(e.target.value);
                    if (addError) setAddError(null);
                  }}
                  placeholder="Kök (örn: child, go)"
                  className="w-full px-3.5 py-2 rounded-xl bg-[var(--app-bg)] border border-slate-700/80 text-white placeholder-slate-400 text-sm focus:outline-hidden focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500/50"
                />
              </div>
              <div className="sm:col-span-6">
                <input
                  type="text"
                  value={addForms}
                  onChange={(e) => {
                    setAddForms(e.target.value);
                    if (addError) setAddError(null);
                  }}
                  placeholder="Biçimler (örn: children / virgülle ayırın)"
                  className="w-full px-3.5 py-2 rounded-xl bg-[var(--app-bg)] border border-slate-700/80 text-white placeholder-slate-400 text-sm focus:outline-hidden focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500/50"
                />
              </div>
              <div className="sm:col-span-2">
                <button
                  type="submit"
                  className="w-full py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm transition-all shadow-sm cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Ekle</span>
                </button>
              </div>
            </div>

            {/* Validation & Pool Warnings */}
            {cleanAddRoot && !isAddRootInPool && (
              <div className="text-xs text-amber-400 flex items-center gap-1.5 pt-0.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>Havuzda yok, şimdilik eşleşmez</span>
              </div>
            )}

            {addError && (
              <div className="text-xs text-rose-400 flex items-center gap-1.5 pt-0.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{addError}</span>
              </div>
            )}
          </form>
        </section>

        {/* List Section */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Eşleştirme Listesi ({displayedEntries.length})
            </h2>
            {searchQuery && (
              <span className="text-xs text-slate-400 font-normal">
                "{searchQuery}" araması için
              </span>
            )}
          </div>

          {displayedEntries.length === 0 ? (
            <div className="bg-[var(--app-surface)] border border-slate-800 rounded-2xl p-8 text-center text-slate-400 text-sm">
              Eşleşen kayıt bulunamadı.
            </div>
          ) : (
            <div className="space-y-2">
              {displayedEntries.map((entry) => {
                const isInPool = activePoolIndex.has(entry.root);
                const isCustom = entry.type === 'custom';
                const isBuiltin = entry.type === 'builtin';
                const isDisabledBuiltin = isBuiltin && entry.isDisabled;
                const isEditingThis = isCustom && editingId === entry.id;
                const isDeletingThis = isCustom && deletingId === entry.id;

                return (
                  <div
                    key={entry.id}
                    className={`bg-[var(--app-surface)] border rounded-xl p-3 sm:px-4 sm:py-3 transition-colors ${
                      isDisabledBuiltin
                        ? 'border-slate-800/80 bg-slate-900/40 opacity-60'
                        : !isInPool
                        ? 'border-slate-800 bg-[var(--app-sunken)]/80 opacity-75'
                        : 'border-slate-800 hover:border-slate-700/80'
                    }`}
                  >
                    {isEditingThis ? (
                      /* Inline Edit Form */
                      <div className="space-y-2.5">
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                          <div className="sm:col-span-4">
                            <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                              Kök
                            </label>
                            <input
                              type="text"
                              value={editRoot}
                              onChange={(e) => setEditRoot(e.target.value)}
                              className="w-full px-3 py-1.5 rounded-lg bg-[var(--app-bg)] border border-slate-700 text-white text-sm focus:outline-hidden focus:border-emerald-500"
                            />
                          </div>
                          <div className="sm:col-span-8">
                            <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                              Biçimler (virgülle ayırın)
                            </label>
                            <input
                              type="text"
                              value={editForms}
                              onChange={(e) => setEditForms(e.target.value)}
                              className="w-full px-3 py-1.5 rounded-lg bg-[var(--app-bg)] border border-slate-700 text-white text-sm focus:outline-hidden focus:border-emerald-500"
                            />
                          </div>
                        </div>

                        {editError && (
                          <div className="text-xs text-rose-400 flex items-center gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5" />
                            <span>{editError}</span>
                          </div>
                        )}

                        <div className="flex items-center justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={handleCancelEdit}
                            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium cursor-pointer"
                          >
                            Vazgeç
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEditSave(entry.id)}
                            className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer flex items-center gap-1"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Kaydet</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Normal Row View */
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        {/* Left: Root, Arrow, Forms, and Badges */}
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          {/* Root */}
                          <span
                            className={`font-semibold text-sm sm:text-base ${
                              isDisabledBuiltin
                                ? 'line-through text-slate-400'
                                : isInPool
                                ? 'text-white'
                                : 'text-slate-300'
                            }`}
                          >
                            {entry.root}
                          </span>

                          <span className="text-slate-500 text-xs select-none">→</span>

                          {/* Forms */}
                          <span
                            className={`text-xs sm:text-sm ${
                              isDisabledBuiltin
                                ? 'line-through text-slate-400'
                                : isInPool
                                ? 'text-emerald-400 font-medium'
                                : 'text-slate-400 font-medium'
                            }`}
                          >
                            {entry.forms.join(', ')}
                          </span>

                          {/* Tag: hazır or özel */}
                          {isBuiltin ? (
                            <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700/60 font-medium">
                              hazır
                            </span>
                          ) : (
                            <span className="text-[11px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 font-medium">
                              özel
                            </span>
                          )}

                          {/* Disabled built-in badge */}
                          {isDisabledBuiltin && (
                            <span className="text-[11px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 font-medium">
                              kapalı
                            </span>
                          )}

                          {/* Not in pool badge */}
                          {!isInPool && (
                            <span className="text-[11px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                              havuzda yok
                            </span>
                          )}
                        </div>

                        {/* Right: Actions */}
                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                          {isBuiltin && (
                            <button
                              type="button"
                              onClick={() => handleToggleBuiltin(entry.root)}
                              className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                                entry.isDisabled
                                  ? 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 border-emerald-500/30'
                                  : 'text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 border-amber-500/30'
                              }`}
                            >
                              {entry.isDisabled ? 'Aç' : 'Kapat'}
                            </button>
                          )}

                          {isCustom && (
                            <>
                              {isDeletingThis ? (
                                <div className="flex items-center gap-1.5 text-xs bg-rose-500/10 border border-rose-500/30 px-2 py-1 rounded-lg animate-fadeIn">
                                  <span className="text-rose-300 font-medium">Silinsin mi?</span>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteConfirm(entry.id, entry.root)}
                                    className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white font-medium cursor-pointer"
                                  >
                                    Evet
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDeletingId(null)}
                                    className="px-2 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 cursor-pointer"
                                  >
                                    Vazgeç
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleStartEdit({
                                        id: entry.id,
                                        root: entry.root,
                                        forms: entry.forms,
                                        createdAt: entry.createdAt,
                                      })
                                    }
                                    className="px-2.5 py-1 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-700/60 text-xs font-medium transition-colors cursor-pointer flex items-center gap-1"
                                  >
                                    <Edit2 className="w-3 h-3 text-slate-400" />
                                    <span>Düzenle</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => setDeletingId(entry.id)}
                                    className="px-2.5 py-1 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-rose-500/20 text-xs font-medium transition-colors cursor-pointer flex items-center gap-1"
                                  >
                                    <Trash2 className="w-3 h-3 text-rose-400" />
                                    <span>Sil</span>
                                  </button>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Bulk Add Section ("Toplu ekle") */}
        <section className="bg-[var(--app-surface)] border border-slate-700/80 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            <FilePlus2 className="w-4 h-4 text-emerald-400" />
            <span>Toplu ekle</span>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            Her satıra bir eşleştirme girin. Biçim: <code className="text-slate-300">kök: biçim1, biçim2</code>
            <br />
            Örnek: <span className="font-mono text-slate-300">child: children</span> veya{' '}
            <span className="font-mono text-slate-300">good: better, best</span>
          </p>

          <textarea
            rows={5}
            value={bulkText}
            onChange={(e) => {
              setBulkText(e.target.value);
              setBulkPreview(null);
            }}
            placeholder={`go: went, gone\nchild: children\ngood: better, best`}
            className="w-full p-3 rounded-xl bg-[var(--app-bg)] border border-slate-700/80 text-white placeholder-slate-500 text-sm font-mono focus:outline-hidden focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500/50"
          />

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              disabled={!bulkText.trim()}
              onClick={handleGenerateBulkPreview}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              <Eye className="w-4 h-4 text-slate-400" />
              <span>Önizle</span>
            </button>

            {bulkPreview && bulkPreview.valid.length > 0 && (
              <button
                type="button"
                onClick={handleBulkAddConfirm}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-all cursor-pointer shadow-sm flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Onayla ve Ekle ({bulkPreview.valid.length} satır)</span>
              </button>
            )}

            {bulkPreview && (
              <button
                type="button"
                onClick={() => setBulkPreview(null)}
                className="px-3 py-2 rounded-xl text-slate-400 hover:text-white text-xs font-medium cursor-pointer"
              >
                Önizlemeyi Gizle
              </button>
            )}
          </div>

          {/* Bulk Preview Report */}
          {bulkPreview && (
            <div className="pt-2 border-t border-slate-800/80 space-y-3 animate-fadeIn">
              <div className="text-sm font-medium text-slate-200">
                {bulkPreview.valid.length} satır eklenecek, {bulkPreview.invalid.length} satır
                hatalı/zaten var
              </div>

              {/* Invalid Lines List (not silently dropped) */}
              {bulkPreview.invalid.length > 0 && (
                <div className="bg-rose-500/10 border border-rose-500/25 rounded-xl p-3.5 space-y-2">
                  <div className="text-xs font-semibold text-rose-300 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4" />
                    <span>Hatalı veya atlanan satırlar ({bulkPreview.invalid.length}):</span>
                  </div>
                  <ul className="space-y-1 text-xs text-rose-200/90 font-mono divide-y divide-rose-500/15">
                    {bulkPreview.invalid.map((item, idx) => (
                      <li key={idx} className="pt-1 first:pt-0">
                        <span className="text-rose-400 font-bold">Satır {item.lineNum}:</span> "
                        {item.raw}" →{' '}
                        <span className="text-rose-300 font-sans italic">{item.reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Valid Lines Preview */}
              {bulkPreview.valid.length > 0 && (
                <div className="bg-[var(--app-sunken)] border border-slate-800 rounded-xl p-3.5 space-y-2">
                  <div className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                    <Check className="w-4 h-4" />
                    <span>Eklenecek eşleştirmeler ({bulkPreview.valid.length}):</span>
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1 text-xs text-slate-300">
                    {bulkPreview.valid.map((v, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="font-semibold text-white">{v.root}</span>
                        <span className="text-slate-500">→</span>
                        <span className="text-emerald-400">{v.forms.join(', ')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};
