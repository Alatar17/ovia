/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { StoredText, CEFRLevel } from '../types/text';
import {
  Plus,
  Settings,
  Search,
  MoreVertical,
  Edit2,
  Trash2,
  BookOpen,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Folder,
  Layers,
  X,
  FolderTree,
} from 'lucide-react';
import { SettingsMenu, HighlightStyle, DesktopPanelPlacement } from './SettingsMenu';
import { EditTextModal } from './EditTextModal';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { PoolSettingsModal } from './PoolSettingsModal';
import { ClearPoolModal } from './ClearPoolModal';
import { poolStore } from '../store/poolStore';

interface LibraryViewProps {
  texts: StoredText[];
  isDbAvailable: boolean;
  dbError: string | null;
  onSelectText: (text: StoredText) => void;
  onAddTextClick: () => void;
  onUpdateText: (updated: StoredText) => Promise<void>;
  onDeleteText: (id: string) => Promise<void>;
  onReload: () => void;
  onNotify: (message: string, type?: 'success' | 'error' | 'info') => void;
  highlightStyle: HighlightStyle;
  onHighlightStyleChange: (s: HighlightStyle) => void;
  panelPlacement: DesktopPanelPlacement;
  onPanelPlacementChange: (p: DesktopPanelPlacement) => void;
  onOpenCustomMatches?: () => void;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  texts,
  isDbAvailable,
  dbError,
  onSelectText,
  onAddTextClick,
  onUpdateText,
  onDeleteText,
  onReload,
  onNotify,
  highlightStyle,
  onHighlightStyleChange,
  panelPlacement,
  onPanelPlacementChange,
  onOpenCustomMatches,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const closeSearch = () => {
    setSearchQuery('');
    setIsSearchOpen(false);
  };
  const [selectedLevel, setSelectedLevel] = useState<string>('all');
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPoolSettingsOpen, setIsPoolSettingsOpen] = useState(false);
  const [isClearPoolOpen, setIsClearPoolOpen] = useState(false);

  // Collapsed sections map: groupName -> boolean (true = collapsed)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  // Active item dropdown menu (for Düzenle / Sil)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Modals state
  const [editingText, setEditingText] = useState<StoredText | null>(null);
  const [deletingText, setDeletingText] = useState<StoredText | null>(null);

  // Extract distinct levels that exist in current texts
  const existingLevels = useMemo(() => {
    const set = new Set<string>();
    texts.forEach((t) => {
      if (t.level && t.level.trim()) {
        set.add(t.level.trim().toUpperCase());
      }
    });
    const standardOrder = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
    return standardOrder.filter((lvl) => set.has(lvl));
  }, [texts]);

  // Extract distinct groups from all texts
  const existingGroups = useMemo(() => {
    const set = new Set<string>();
    texts.forEach((t) => {
      const g = t.group ? t.group.trim() : '';
      set.add(g || 'Grupsuz');
    });
    const arr = Array.from(set).filter((g) => g !== 'Grupsuz').sort((a, b) => a.localeCompare(b, 'tr'));
    if (set.has('Grupsuz')) {
      arr.push('Grupsuz');
    }
    return arr;
  }, [texts]);

  // Filter texts by search query, level, and group
  const filteredTexts = useMemo(() => {
    return texts.filter((item) => {
      // Search by title
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        if (!item.title.toLowerCase().includes(query)) {
          return false;
        }
      }

      // Filter by level
      if (selectedLevel !== 'all') {
        if ((item.level || '').toUpperCase() !== selectedLevel.toUpperCase()) {
          return false;
        }
      }

      // Filter by group
      if (selectedGroup !== 'all') {
        const itemGroupName = (item.group || '').trim() || 'Grupsuz';
        if (itemGroupName !== selectedGroup) {
          return false;
        }
      }

      return true;
    });
  }, [texts, searchQuery, selectedLevel, selectedGroup]);

  // Group filtered texts by group name
  // Groups sorted alphabetically, with "Grupsuz" last
  // Inside group, sorted by newest first (createdAt descending)
  const groupedSections = useMemo(() => {
    const map: Record<string, StoredText[]> = {};

    filteredTexts.forEach((item) => {
      const groupName = (item.group || '').trim() || 'Grupsuz';
      if (!map[groupName]) {
        map[groupName] = [];
      }
      map[groupName].push(item);
    });

    // Sort items within each group newest first
    Object.keys(map).forEach((g) => {
      map[g].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    });

    // Sort group names: alphabetical with "Grupsuz" last
    const sortedGroupNames = Object.keys(map).sort((a, b) => {
      if (a === 'Grupsuz') return 1;
      if (b === 'Grupsuz') return -1;
      return a.localeCompare(b, 'tr');
    });

    return sortedGroupNames.map((groupName) => ({
      groupName,
      items: map[groupName],
    }));
  }, [filteredTexts]);

  const toggleGroupCollapse = (groupName: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupName]: !prev[groupName],
    }));
  };

  const handleEditSave = async (updated: StoredText) => {
    try {
      await onUpdateText(updated);
      setEditingText(null);
      onNotify('Metin başarıyla güncellendi.', 'success');
    } catch (err) {
      console.error(err);
      onNotify('Metin güncellenirken hata oluştu.', 'error');
    }
  };

  const handleDeleteConfirm = async (id: string) => {
    try {
      await onDeleteText(id);
      setDeletingText(null);
      onNotify('Metin kütüphaneden silindi.', 'success');
    } catch (err) {
      console.error(err);
      onNotify('Metin silinirken hata oluştu.', 'error');
    }
  };

  return (
    <div
      className="min-h-screen bg-[var(--app-bg)] text-slate-100 flex flex-col relative"
      onClick={() => setOpenMenuId(null)}
    >
      {/* Top Header */}
      <header
        className="sticky top-0 z-30 bg-[var(--app-bg)]/95 backdrop-blur-md border-b border-slate-800/80 px-4 sm:px-8 py-3.5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          {/* Brand */}
          <div className="flex items-center gap-2.5">
            <span className="font-serif text-2xl font-bold tracking-tight text-white">
              Ovia
            </span>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-2 sm:gap-2.5 relative">
            <button
              type="button"
              onClick={() => (isSearchOpen ? closeSearch() : setIsSearchOpen(true))}
              className={`p-2 sm:p-2.5 rounded-xl border transition-colors cursor-pointer ${
                isSearchOpen
                  ? 'text-emerald-400 bg-slate-800/70 border-slate-700/50'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/70 border-transparent hover:border-slate-700/50'
              }`}
              aria-label="Metin ara"
              aria-expanded={isSearchOpen}
              title="Metin ara"
            >
              <Search className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>

            <button
              type="button"
              onClick={() => setIsPoolSettingsOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700/80 text-slate-200 border border-slate-700/80 text-xs sm:text-sm font-medium transition-all cursor-pointer shadow-sm"
              title="Kelime Havuzu & Anki Desteleri"
            >
              <FolderTree className="w-4 h-4 text-emerald-400" />
              <span className="hidden xs:inline">Kelime Havuzu</span>
            </button>

            <button
              type="button"
              onClick={onAddTextClick}
              className="flex items-center gap-1.5 px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-semibold shadow-md shadow-emerald-950/40 active:scale-[0.98] transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Metin ekle</span>
            </button>

            <button
              type="button"
              onClick={() => setIsSettingsOpen((prev) => !prev)}
              className="p-2 sm:p-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/70 border border-transparent hover:border-slate-700/50 transition-colors cursor-pointer"
              aria-label="Ayarlar"
              title="Ayarlar"
            >
              <Settings className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>

            {/* Settings Dropdown */}
            <SettingsMenu
              isOpen={isSettingsOpen}
              onClose={() => setIsSettingsOpen(false)}
              highlightStyle={highlightStyle}
              onHighlightStyleChange={onHighlightStyleChange}
              panelPlacement={panelPlacement}
              onPanelPlacementChange={onPanelPlacementChange}
              onOpenPoolSettings={() => setIsPoolSettingsOpen(true)}
              onOpenCustomMatches={onOpenCustomMatches}
              onClearPoolClick={() => setIsClearPoolOpen(true)}
              onDataChanged={onReload}
              onNotify={onNotify}
            />
          </div>
        </div>
      </header>

      {/* Warning banner if IndexedDB is not available */}
      {(!isDbAvailable || dbError) && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2.5 text-xs text-amber-200">
          <div className="max-w-4xl mx-auto flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              {dbError || 'Tarayıcınızda kalıcı yerel depolama (IndexedDB) etkin değil. Eklediğiniz metinler tarayıcıyı kapattığınızda silinebilir.'}
            </span>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-4xl w-full mx-auto px-4 sm:px-8 py-6 flex-1 space-y-6">
        {/* Search & Filters */}
        <section className="space-y-3.5">
          {/* Search Input (hidden until the header search button is pressed) */}
          {isSearchOpen && (
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') closeSearch();
                }}
                placeholder="Başlığa göre metin ara..."
                className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
              />
              <button
                type="button"
                onClick={closeSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1"
                aria-label="Aramayı kapat"
                title="Aramayı kapat (Esc)"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Level Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <span className="text-xs text-slate-400 shrink-0 mr-1 hidden sm:inline">
              Seviye:
            </span>
            <button
              type="button"
              onClick={() => setSelectedLevel('all')}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer shrink-0 ${
                selectedLevel === 'all'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                  : 'bg-slate-850 text-slate-400 hover:text-slate-200 border border-slate-800 hover:border-slate-700'
              }`}
            >
              Tümü
            </button>
            {existingLevels.map((lvl) => {
              const isSelected = selectedLevel.toUpperCase() === lvl.toUpperCase();
              return (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setSelectedLevel(isSelected ? 'all' : lvl)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer shrink-0 ${
                    isSelected
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-semibold'
                      : 'bg-slate-850 text-slate-400 hover:text-slate-200 border border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {lvl}
                </button>
              );
            })}
          </div>

          {/* Group Filter Chips */}
          {existingGroups.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              <span className="text-xs text-slate-400 shrink-0 mr-1 hidden sm:inline">
                Grup:
              </span>
              <button
                type="button"
                onClick={() => setSelectedGroup('all')}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer shrink-0 ${
                  selectedGroup === 'all'
                    ? 'bg-slate-700 text-white border border-slate-600'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800 hover:border-slate-700'
                }`}
              >
                Tüm Gruplar
              </button>
              {existingGroups.map((grp) => {
                const isSelected = selectedGroup === grp;
                return (
                  <button
                    key={grp}
                    type="button"
                    onClick={() => setSelectedGroup(isSelected ? 'all' : grp)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer shrink-0 ${
                      isSelected
                        ? 'bg-slate-700 text-white border border-slate-600'
                        : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {grp}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Text List or Empty States */}
        {texts.length === 0 ? (
          /* Empty Library State */
          <div className="p-10 sm:p-14 text-center bg-[var(--app-surface)] border border-slate-800 rounded-3xl space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400 mx-auto">
              <BookOpen className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-semibold text-white">
                Kütüphanenizde Henüz Metin Yok
              </h3>
              <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-sm mx-auto leading-relaxed">
                İngilizce okuma metinlerinizi EN: ve TR: formatında ekleyerek okumaya ve kelime dağarcığınızı geliştirmeye hemen başlayın.
              </p>
            </div>
            <button
              type="button"
              onClick={onAddTextClick}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold shadow-lg shadow-emerald-950/40 active:scale-[0.98] transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>İlk Metni Ekle</span>
            </button>
          </div>
        ) : filteredTexts.length === 0 ? (
          /* No search/filter results */
          <div className="p-8 text-center bg-[var(--app-surface)] border border-slate-800 rounded-2xl space-y-3">
            <p className="text-sm text-slate-300">
              Arama kriterlerinize uygun metin bulunamadı.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedLevel('all');
                setSelectedGroup('all');
              }}
              className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 cursor-pointer"
            >
              Filtreleri Temizle
            </button>
          </div>
        ) : (
          /* Grouped Text List */
          <div className="space-y-6">
            {groupedSections.map(({ groupName, items }) => {
              const isCollapsed = Boolean(collapsedGroups[groupName]);

              return (
                <div key={groupName} className="space-y-2">
                  {/* Collapsible Section Header */}
                  <button
                    type="button"
                    onClick={() => toggleGroupCollapse(groupName)}
                    className="w-full flex items-center justify-between py-1.5 px-1 text-left text-slate-300 hover:text-white cursor-pointer select-none group"
                  >
                    <div className="flex items-center gap-2">
                      <Folder className="w-4 h-4 text-emerald-400/80" />
                      <span className="text-sm font-semibold text-slate-200 group-hover:text-white">
                        {groupName}
                      </span>
                      <span className="text-xs text-slate-500 tabular-nums">
                        ({items.length})
                      </span>
                    </div>

                    <div className="text-slate-500 group-hover:text-slate-300">
                      {isCollapsed ? (
                        <ChevronRight className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </div>
                  </button>

                  {/* Section Items */}
                  {!isCollapsed && (
                    <div className="space-y-2">
                      {items.map((item) => {
                        const sentenceCount = item.paragraphs.reduce(
                          (acc, p) => acc + p.length,
                          0
                        );
                        const isMenuOpen = openMenuId === item.id;

                        return (
                          <div
                            key={item.id}
                            onClick={() => onSelectText(item)}
                            className="group p-4 rounded-2xl bg-[var(--app-surface)] border border-slate-800/90 hover:border-slate-700 hover:bg-[var(--app-raised)] transition-all cursor-pointer relative"
                          >
                            <div className="flex items-start justify-between gap-3">
                              {/* Left details */}
                              <div className="flex-1 min-w-0 pr-2">
                                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                                  <h4 className="font-serif text-base sm:text-lg font-semibold text-white group-hover:text-emerald-300 transition-colors truncate">
                                    {item.title}
                                  </h4>

                                  {item.level && (
                                    <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                                      {item.level}
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center gap-2 text-xs text-slate-400">
                                  <span className="flex items-center gap-1">
                                    <BookOpen className="w-3.5 h-3.5 text-slate-500" />
                                    <span>{sentenceCount} cümle</span>
                                  </span>
                                  <span>·</span>
                                  <span className="flex items-center gap-1">
                                    <Layers className="w-3.5 h-3.5 text-slate-500" />
                                    <span>{item.paragraphs.length} paragraf</span>
                                  </span>
                                </div>
                              </div>

                              {/* Right context menu trigger */}
                              <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenMenuId(isMenuOpen ? null : item.id);
                                  }}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                                  aria-label="Metin İşlemleri"
                                >
                                  <MoreVertical className="w-4 h-4" />
                                </button>

                                {/* Context Menu Popover */}
                                {isMenuOpen && (
                                  <div
                                    className="absolute right-0 top-8 z-40 w-36 bg-[var(--app-raised)] border border-slate-700 rounded-xl shadow-xl py-1 text-xs animate-fadeIn"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOpenMenuId(null);
                                        setEditingText(item);
                                      }}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-slate-200 hover:bg-slate-700/80 transition-colors cursor-pointer"
                                    >
                                      <Edit2 className="w-3.5 h-3.5 text-slate-400" />
                                      <span>Düzenle</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOpenMenuId(null);
                                        setDeletingText(item);
                                      }}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                                    >
                                      <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                                      <span>Sil</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Edit Modal */}
      <EditTextModal
        isOpen={Boolean(editingText)}
        text={editingText}
        existingGroups={existingGroups}
        onClose={() => setEditingText(null)}
        onSave={handleEditSave}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={Boolean(deletingText)}
        text={deletingText}
        onClose={() => setDeletingText(null)}
        onConfirm={handleDeleteConfirm}
      />

      {/* Pool Settings Modal */}
      <PoolSettingsModal
        isOpen={isPoolSettingsOpen}
        onClose={() => setIsPoolSettingsOpen(false)}
        onNotify={onNotify}
        onPoolChanged={onReload}
      />

      {/* Clear Pool Modal (Ayarlar > Kelime Havuzu > Havuzu temizle) */}
      <ClearPoolModal
        isOpen={isClearPoolOpen}
        notesCount={poolStore.getAllNotes().length}
        onClose={() => setIsClearPoolOpen(false)}
        onConfirm={async (resetSettings) => {
          await poolStore.clearPool(resetSettings);
          onNotify('Kelime havuzu temizlendi.', 'success');
          onReload();
        }}
      />
    </div>
  );
};
