/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { Check, Download, Upload, Loader2, FolderTree, Trash2, Shuffle } from 'lucide-react';
import { exportBackup, importBackup, RestoreResult } from '../utils/backupRestore';
import { poolStore } from '../store/poolStore';
import { THEME_OPTIONS, getTheme, setTheme } from '../utils/theme';

const SHOW_ADVANCED_KEY = 'ovia_show_advanced';

function loadShowAdvanced(): boolean {
  try {
    return localStorage.getItem(SHOW_ADVANCED_KEY) === '1';
  } catch {
    return false;
  }
}

const ToggleSwitch: React.FC<{ checked: boolean; onChange: () => void; label: string }> = ({
  checked,
  onChange,
  label,
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={onChange}
    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
      checked ? 'bg-emerald-500' : 'bg-slate-700'
    }`}
  >
    <span
      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
        checked ? 'translate-x-4' : 'translate-x-0'
      }`}
    />
  </button>
);

export type HighlightStyle = 'bold-green' | 'bold' | 'green';
export type DesktopPanelPlacement = 'side-sticky' | 'floating';

interface SettingsMenuProps {
  isOpen: boolean;
  onClose: () => void;
  highlightStyle: HighlightStyle;
  onHighlightStyleChange: (style: HighlightStyle) => void;
  panelPlacement: DesktopPanelPlacement;
  onPanelPlacementChange: (placement: DesktopPanelPlacement) => void;
  showPhrases?: boolean;
  onShowPhrasesChange?: (show: boolean) => void;
  onOpenPoolSettings?: () => void;
  onOpenCustomMatches?: () => void;
  onClearPoolClick?: () => void;
  onDataChanged?: () => void;
  onNotify?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export const SettingsMenu: React.FC<SettingsMenuProps> = ({
  isOpen,
  onClose,
  highlightStyle,
  onHighlightStyleChange,
  panelPlacement,
  onPanelPlacementChange,
  showPhrases,
  onShowPhrasesChange,
  onOpenPoolSettings,
  onOpenCustomMatches,
  onClearPoolClick,
  onDataChanged,
  onNotify,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(loadShowAdvanced);

  const toggleAdvanced = () => {
    const next = !showAdvanced;
    setShowAdvanced(next);
    try {
      localStorage.setItem(SHOW_ADVANCED_KEY, next ? '1' : '0');
    } catch {
      // storage unavailable: keep in memory only
    }
  };

  const currentShowPhrases =
    showPhrases !== undefined ? showPhrases : poolStore.getShowPhrases();

  const handleTogglePhrases = async () => {
    const nextVal = !currentShowPhrases;
    await poolStore.setShowPhrases(nextVal);
    onShowPhrasesChange?.(nextVal);
  };

  // Close when tapping outside or pressing Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  // Theme lives on <html data-theme>; re-render after changing it
  const [, setThemeRevision] = useState(0);

  if (!isOpen) return null;

  const currentTheme = getTheme();

  const highlightOptions: { id: HighlightStyle; label: string }[] = [
    { id: 'bold', label: 'Sadece kalın' },
    { id: 'bold-green', label: 'Kalın + yeşil' },
    { id: 'green', label: 'Sadece yeşil' },
  ];

  const placementOptions: { id: DesktopPanelPlacement; label: string }[] = [
    { id: 'side-sticky', label: 'Yan sütun (sabit)' },
    { id: 'floating', label: 'Kelimenin yanında' },
  ];

  const handleBackupClick = async () => {
    try {
      setIsProcessing(true);
      const count = await exportBackup();
      onNotify?.(`${count} metin yedek dosyası olarak indirildi.`, 'success');
      onClose();
    } catch (err) {
      console.error(err);
      onNotify?.('Yedek indirilirken bir hata oluştu.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRestoreFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsProcessing(true);
      const res: RestoreResult = await importBackup(file);
      if (res.error) {
        onNotify?.(res.error, 'error');
      } else {
        let msg = `${res.addedCount} metin başarıyla geri yüklendi.`;
        if (res.skippedCount > 0) {
          msg += ` (${res.skippedCount} metin zaten mevcut olduğu için atlandı)`;
        }
        onNotify?.(msg, 'success');
        onDataChanged?.();
      }
      onClose();
    } catch (err: any) {
      onNotify?.(err?.message || 'Yedek yüklenirken hata oluştu.', 'error');
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div
      ref={menuRef}
      className="absolute top-14 right-2 sm:right-4 z-50 w-72 max-h-[calc(100vh-5rem)] overflow-y-auto bg-[var(--app-surface)] border border-slate-700/80 rounded-xl shadow-2xl py-2 animate-fadeIn text-slate-200"
      role="menu"
      aria-label="Okuma ve Yedek Ayarları"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Hidden file input for restore */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleRestoreFileSelected}
        accept=".json,application/json"
        className="hidden"
      />

      {/* 0. Theme Section */}
      <div className="px-3.5 py-1 text-xs font-bold text-slate-200 uppercase tracking-wider">
        Tema
      </div>

      <div className="px-3.5 py-1.5 grid grid-cols-3 gap-2">
        {THEME_OPTIONS.map((opt) => {
          const isSelected = currentTheme === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="menuitem"
              onClick={() => {
                setTheme(opt.id);
                setThemeRevision((r) => r + 1);
              }}
              className={`flex flex-col items-center gap-1.5 py-2 rounded-lg border text-xs transition-colors cursor-pointer ${
                isSelected
                  ? 'border-emerald-400 text-emerald-400 font-medium'
                  : 'border-slate-700/80 text-slate-300 hover:border-slate-500'
              }`}
            >
              <span
                className="w-9 h-6 rounded-md border border-slate-600/50 flex items-center justify-center"
                style={{ backgroundColor: opt.swatch }}
                aria-hidden="true"
              >
                <span className="w-4 h-1.5 rounded-full" style={{ backgroundColor: opt.accent }} />
              </span>
              <span>{opt.label}</span>
            </button>
          );
        })}
      </div>

      <div className="my-1.5 border-t border-slate-800/80" />

      {/* 1. Highlight Style Section */}
      <div className="px-3.5 py-1 text-xs font-bold text-slate-200 uppercase tracking-wider">
        Vurgu stili
      </div>

      <div className="py-1">
        {highlightOptions.map((opt) => {
          const isSelected = highlightStyle === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="menuitem"
              onClick={() => onHighlightStyleChange(opt.id)}
              className={`w-full flex items-center justify-between px-3.5 py-1.5 text-sm text-left transition-colors cursor-pointer ${
                isSelected
                  ? 'text-emerald-400 bg-emerald-500/10 font-medium'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <span>{opt.label}</span>
              {isSelected && <Check className="w-4 h-4 text-emerald-400 stroke-[2.5]" />}
            </button>
          );
        })}
      </div>

      <div className="my-1.5 border-t border-slate-800/80" />

      {/* 2. Desktop Panel Placement Section */}
      <div className="px-3.5 py-1 text-xs font-bold text-slate-200 uppercase tracking-wider">
        Panel konumu (bilgisayarda)
      </div>

      <div className="py-1">
        {placementOptions.map((opt) => {
          const isSelected = panelPlacement === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="menuitem"
              onClick={() => onPanelPlacementChange(opt.id)}
              className={`w-full flex items-center justify-between px-3.5 py-1.5 text-sm text-left transition-colors cursor-pointer ${
                isSelected
                  ? 'text-emerald-400 bg-emerald-500/10 font-medium'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <span>{opt.label}</span>
              {isSelected && <Check className="w-4 h-4 text-emerald-400 stroke-[2.5]" />}
            </button>
          );
        })}
      </div>

      <div className="my-1.5 border-t border-slate-800/80" />

      {/* 3. Word Pool & Anki Section */}
      <div className="px-3.5 py-1 text-xs font-bold text-slate-200 uppercase tracking-wider">
        Kelime Havuzu
      </div>

      <div className="py-1">
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onClose();
            onOpenPoolSettings?.();
          }}
          className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors cursor-pointer"
        >
          <FolderTree className="w-4 h-4 text-emerald-400 shrink-0" />
          <div>
            <div className="font-medium text-slate-200">Kelime Havuzu & Anki</div>
            <div className="text-[11px] text-slate-400 leading-tight">Deste seçimi, arama ve içe aktarma</div>
          </div>
        </button>

        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onClose();
            onOpenCustomMatches?.();
          }}
          className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors cursor-pointer"
        >
          <Shuffle className="w-4 h-4 text-emerald-400 shrink-0" />
          <div>
            <div className="font-medium text-slate-200">Özel eşleştirmeler</div>
            <div className="text-[11px] text-slate-400 leading-tight">Düzensiz ve özel biçim haritası</div>
          </div>
        </button>
      </div>

      <div className="my-1.5 border-t border-slate-800/80" />

      {/* 4. Backup and Restore Section */}
      <div className="px-3.5 py-1 text-xs font-bold text-slate-200 uppercase tracking-wider">
        Veri ve Yedekleme
      </div>

      <div className="py-1">
        <button
          type="button"
          role="menuitem"
          disabled={isProcessing}
          onClick={handleBackupClick}
          className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors cursor-pointer disabled:opacity-50"
        >
          {isProcessing ? (
            <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
          ) : (
            <Download className="w-4 h-4 text-slate-400" />
          )}
          <div>
            <div className="font-medium text-slate-200">Yedekle (indir)</div>
            <div className="text-[11px] text-slate-400 leading-tight">JSON dosyası olarak kaydet</div>
          </div>
        </button>

        <button
          type="button"
          role="menuitem"
          disabled={isProcessing}
          onClick={() => fileInputRef.current?.click()}
          className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors cursor-pointer disabled:opacity-50"
        >
          {isProcessing ? (
            <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
          ) : (
            <Upload className="w-4 h-4 text-slate-400" />
          )}
          <div>
            <div className="font-medium text-slate-200">Yedekten geri yükle</div>
            <div className="text-[11px] text-slate-400 leading-tight">Daha önce alınan yedeği ekle</div>
          </div>
        </button>
      </div>

      <div className="my-1.5 border-t border-slate-800/80" />

      {/* 5. Advanced settings (rarely used options, hidden by default) */}
      <div className="py-1 px-3.5">
        <div className="flex items-center justify-between py-1">
          <div className="text-sm font-medium text-slate-200">Gelişmiş ayarlar</div>
          <ToggleSwitch checked={showAdvanced} onChange={toggleAdvanced} label="Gelişmiş ayarlar" />
        </div>
      </div>

      {showAdvanced && (
        <>
          <div className="py-1 px-3.5">
            <div className="flex items-center justify-between py-1">
              <div>
                <div className="text-sm font-medium text-slate-200">Kalıpları göster</div>
                <div className="text-[11px] text-slate-400 leading-tight">Çok kelimeli kalıpları eşleştir</div>
              </div>
              <ToggleSwitch checked={currentShowPhrases} onChange={handleTogglePhrases} label="Kalıpları göster" />
            </div>
          </div>

          <div className="py-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onClose();
                onClearPoolClick?.();
              }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4 text-rose-400 shrink-0" />
              <div>
                <div className="font-medium">Havuzu temizle</div>
                <div className="text-[11px] text-slate-400 leading-tight">Tüm havuz kartlarını ve indeksleri kaldır</div>
              </div>
            </button>
          </div>
        </>
      )}
    </div>
  );
};
