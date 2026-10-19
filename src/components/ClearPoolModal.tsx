/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';

interface ClearPoolModalProps {
  isOpen: boolean;
  notesCount: number;
  onClose: () => void;
  onConfirm: (resetSettings: boolean) => Promise<void>;
}

export const ClearPoolModal: React.FC<ClearPoolModalProps> = ({
  isOpen,
  notesCount,
  onClose,
  onConfirm,
}) => {
  const [resetSettings, setResetSettings] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    try {
      setIsDeleting(true);
      await onConfirm(resetSettings);
      onClose();
    } catch (err) {
      console.error('Havuz temizleme hatası:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[var(--app-surface)] border border-rose-900/60 rounded-2xl shadow-2xl p-5 text-slate-200 space-y-4"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="clear-pool-title"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center shrink-0">
            <Trash2 className="w-5 h-5" />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Kapat"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div>
          <h3 id="clear-pool-title" className="text-base font-bold text-white">
            Kelime Havuzunu Temizle
          </h3>
          <p className="text-sm text-slate-300 mt-2 leading-relaxed">
            Havuzdaki <strong className="text-rose-400">{notesCount}</strong> kayıtlı not silinecek. Metinlerin ve kütüphanen silinmeyecek.
          </p>
        </div>

        {/* Checkbox option */}
        <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-900/80 border border-slate-800 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={resetSettings}
            onChange={(e) => setResetSettings(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded text-rose-500 bg-slate-950 border-slate-700 focus:ring-rose-500 cursor-pointer"
          />
          <span className="text-xs text-slate-300 leading-snug">
            Deste seçimlerini ve kök deste ayarını da sıfırla
          </span>
        </label>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            disabled={isDeleting}
            onClick={onClose}
            className="px-4 py-2 text-xs sm:text-sm font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
          >
            İptal
          </button>
          <button
            type="button"
            disabled={isDeleting}
            onClick={handleConfirm}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-xl transition-colors shadow-lg shadow-rose-950/40 cursor-pointer disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            <span>{isDeleting ? 'Temizleniyor...' : 'Havuzu Temizle'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
