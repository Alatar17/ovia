/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Check, ChevronDown, HelpCircle, X } from 'lucide-react';

interface AnkiExportGuideModalProps {
  isOpen: boolean;
  rootDeck: string;
  onClose: () => void;
}

interface GuideOption {
  label: string;
  checked: boolean;
  note: string;
}

interface GuideSection {
  title: string;
  purpose: string;
  format: string;
  options: GuideOption[];
}

// Read-only imitation of Anki's Export window: shows which boxes must be ticked
const FakeSelect: React.FC<{ value: string }> = ({ value }) => (
  <div className="flex-1 min-w-0 flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md bg-[#2b2b2b] border border-[#3c3c3c] text-sm text-slate-100">
    <span className="truncate">{value}</span>
    <ChevronDown className="w-4 h-4 text-slate-300 shrink-0" />
  </div>
);

const FakeCheckbox: React.FC<{ checked: boolean }> = ({ checked }) => (
  <span
    className={`w-4 h-4 mt-0.5 rounded-[3px] border flex items-center justify-center shrink-0 ${
      checked ? 'bg-[#2f6fd6] border-[#2f6fd6]' : 'bg-[#1e1e1e] border-[#5a5a5a]'
    }`}
    aria-hidden="true"
  >
    {checked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
  </span>
);

export const AnkiExportGuideModal: React.FC<AnkiExportGuideModalProps> = ({ isOpen, rootDeck, onClose }) => {
  if (!isOpen) return null;

  const sections: GuideSection[] = [
    {
      title: '1. Kelimeler ve kartlar (.txt)',
      purpose: 'Her güncellemede gerekli. Önce bu yüklenir.',
      format: 'Notes in Plain Text (.txt)',
      options: [
        { label: 'Include HTML and media references', checked: true, note: 'Kartın görünümü ve ses/resim bağlantıları' },
        { label: 'Include tags', checked: true, note: 'Etiketler' },
        { label: 'Include deck name', checked: true, note: 'Deste açma/kapama için' },
        { label: 'Include notetype name', checked: true, note: 'Farklı formatlı kartları ayırmak için' },
        { label: 'Include unique identifier', checked: true, note: 'Mutlaka açık: yeni/değişen kartlar bununla bulunur' },
      ],
    },
    {
      title: '2. Ses ve resimler (.apkg)',
      purpose: 'Sadece Anki\'ye yeni ses veya resim eklediysen gerekli. .txt\'den sonra yüklenir.',
      format: 'Anki Deck Package (.apkg)',
      options: [
        { label: 'Include scheduling information', checked: false, note: 'Çalışma geçmişi gerekmez' },
        { label: 'Include deck presets', checked: false, note: 'Gerekmez' },
        { label: 'Include media', checked: true, note: 'Ses ve resimler' },
        { label: 'Support older Anki versions', checked: false, note: 'Kapalı: dosya daha küçük olur' },
      ],
    },
  ];

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-[var(--app-surface)] border border-slate-800 rounded-2xl shadow-2xl p-5 text-slate-200 space-y-4"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="anki-export-guide-title"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 id="anki-export-guide-title" className="text-base font-bold text-white">
                Anki'den dışa aktarma
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">Anki: Dosya → Dışa Aktar. Kutuları bu şekilde ayarla.</p>
            </div>
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

        {sections.map((section) => (
          <div key={section.format} className="space-y-2">
            <div>
              <div className="text-sm font-semibold text-white">{section.title}</div>
              <div className="text-xs text-slate-400 mt-0.5">{section.purpose}</div>
            </div>

            {/* Anki-style export window */}
            <div className="rounded-lg bg-[#1e1e1e] border border-[#3c3c3c] p-3 space-y-2.5">
              <div className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-xs font-semibold text-slate-200">Export format:</span>
                <FakeSelect value={section.format} />
              </div>
              <div className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-xs font-semibold text-slate-200">Include:</span>
                <FakeSelect value={rootDeck} />
              </div>
              <div className="pt-1 space-y-2">
                {section.options.map((opt) => (
                  <div key={opt.label} className="flex items-start gap-2.5">
                    <FakeCheckbox checked={opt.checked} />
                    <div className="min-w-0">
                      <div className="text-sm text-slate-100 leading-snug">{opt.label}</div>
                      <div className={`text-[11px] leading-snug ${opt.checked ? 'text-emerald-400/80' : 'text-slate-500'}`}>
                        {opt.note}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}

        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs sm:text-sm font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
};
