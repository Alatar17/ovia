/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Trash2, X, Music, Image } from 'lucide-react';

interface DeleteMediaModalProps {
  isOpen: boolean;
  totalFiles: number;
  totalSizeMb: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export const DeleteMediaModal: React.FC<DeleteMediaModalProps> = ({
  isOpen,
  totalFiles,
  totalSizeMb,
  onClose,
  onConfirm,
}) => {
  const [isDeleting, setIsDeleting] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    try {
      setIsDeleting(true);
      await onConfirm();
      onClose();
    } catch (err) {
      console.error('Medya silme hatası:', err);
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
        aria-labelledby="delete-media-title"
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
          <h3 id="delete-media-title" className="text-base font-bold text-white">
            Medya Dosyalarını Sil
          </h3>
          <p className="text-sm text-slate-300 mt-2 leading-relaxed">
            Cihazınızda kayıtlı <strong className="text-rose-400">{totalFiles} medya dosyası ({totalSizeMb} MB)</strong> silinecek.
          </p>
          <div className="mt-3 p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-slate-400 space-y-1.5">
            <div className="flex items-center gap-2 text-slate-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>Metinleriniz ve kütüphaneniz silinmez.</span>
            </div>
            <div className="flex items-center gap-2 text-slate-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>Kelime havuzunuz ve Anki kartlarınız korunur.</span>
            </div>
            <div className="flex items-center gap-2 text-amber-300/90">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span>Kartlardaki ses düğmeleri (▶) tekrar tarayıcı sesine döner, resimler gizlenir.</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            disabled={isDeleting}
            onClick={onClose}
            className="px-4 py-2 text-xs sm:text-sm font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
          >
            Vazgeç
          </button>
          <button
            type="button"
            disabled={isDeleting}
            onClick={handleConfirm}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-xl transition-colors shadow-lg shadow-rose-950/40 cursor-pointer disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            <span>{isDeleting ? 'Siliniyor...' : 'Evet, medyayı sil'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
