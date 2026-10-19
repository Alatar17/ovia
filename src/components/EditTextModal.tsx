/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { StoredText, CEFRLevel } from '../types/text';
import { parseTexts, serializeStoredText, ParseIssue } from '../utils/textImportParser';
import { X, Check, FileText, ChevronRight, ArrowLeft, AlertCircle, AlertTriangle } from 'lucide-react';

interface EditTextModalProps {
  isOpen: boolean;
  text: StoredText | null;
  existingGroups: string[];
  onClose: () => void;
  onSave: (updated: StoredText) => void;
}

export const EditTextModal: React.FC<EditTextModalProps> = ({
  isOpen,
  text,
  existingGroups,
  onClose,
  onSave,
}) => {
  const [title, setTitle] = useState('');
  const [level, setLevel] = useState<CEFRLevel>('');
  const [group, setGroup] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Full text content edit mode state
  const [isFullContentMode, setIsFullContentMode] = useState(false);
  const [fullTextContent, setFullTextContent] = useState('');
  const [fullTextErrors, setFullTextErrors] = useState<ParseIssue[]>([]);
  const [fullTextWarnings, setFullTextWarnings] = useState<ParseIssue[]>([]);

  useEffect(() => {
    if (text) {
      setTitle(text.title);
      setLevel(text.level || '');
      setGroup(text.group || '');
      setError(null);
      setIsFullContentMode(false);
      setFullTextErrors([]);
      setFullTextWarnings([]);
    }
  }, [text, isOpen]);

  // Handle ESC
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !text) return null;

  // Open full text editor mode
  const handleOpenFullContent = () => {
    const serialized = serializeStoredText({
      ...text,
      title: title.trim() || text.title,
      level,
      group: group.trim(),
    });
    setFullTextContent(serialized);
    setFullTextErrors([]);
    setFullTextWarnings([]);
    setIsFullContentMode(true);
  };

  // Submit standard metadata edit
  const handleSubmitMetadata = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Başlık alanı boş bırakılamaz.');
      return;
    }

    onSave({
      ...text,
      title: title.trim(),
      level,
      group: group.trim(),
    });
  };

  // Submit full text content edit
  const handleSubmitFullContent = (e: React.FormEvent) => {
    e.preventDefault();

    if (!fullTextContent.trim()) {
      setFullTextErrors([{ message: 'Metin içeriği boş bırakılamaz.' }]);
      return;
    }

    const parseResult = parseTexts(fullTextContent);

    if (parseResult.totalErrors > 0 || parseResult.texts.length === 0) {
      const allErrors: ParseIssue[] = [];
      parseResult.texts.forEach((t) => allErrors.push(...t.errors));
      if (parseResult.texts.length === 0) {
        allErrors.push({
          message: 'Hiçbir metin ayrıştırılamadı. Lütfen geçerli EN: ve TR: formatında cümleler girin.',
        });
      }
      setFullTextErrors(allErrors);
      setFullTextWarnings(parseResult.texts.flatMap((t) => t.warnings));
      return;
    }

    if (parseResult.texts.length > 1) {
      setFullTextErrors([
        {
          message:
            'Birden fazla metin ("=====" veya yeni "Başlık:") tespit edildi. Lütfen yalnızca düzenlenen bu metni girin.',
        },
      ]);
      setFullTextWarnings(parseResult.texts.flatMap((t) => t.warnings));
      return;
    }

    const parsedItem = parseResult.texts[0];
    if (!parsedItem.isValid) {
      setFullTextErrors(parsedItem.errors);
      setFullTextWarnings(parsedItem.warnings);
      return;
    }

    // Success: update existing record keeping id and createdAt
    onSave({
      ...text,
      title: parsedItem.title,
      level: parsedItem.level,
      group: parsedItem.group,
      paragraphs: parsedItem.paragraphs,
    });
  };

  const sentenceCount = text.paragraphs.reduce((acc, p) => acc + p.length, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        className={`w-full ${
          isFullContentMode ? 'max-w-2xl sm:max-w-3xl' : 'max-w-md'
        } bg-[var(--app-surface)] border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden transition-all duration-200`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-text-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            {isFullContentMode && (
              <button
                type="button"
                onClick={() => setIsFullContentMode(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors mr-1 cursor-pointer"
                title="Temel bilgilere dön"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <h3 id="edit-text-title" className="text-base font-semibold text-white">
              {isFullContentMode ? 'Metin İçeriğini Düzenle' : 'Metni Düzenle'}
            </h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Kapat"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Mode: Full Textarea Editor */}
        {isFullContentMode ? (
          <form onSubmit={handleSubmitFullContent} className="p-5 space-y-4">
            <div className="text-xs text-slate-400 leading-relaxed">
              Metin başlığını, seviyesini, grubunu ve cümlelerini düzenleyin. Paragrafları boş bir satır bırakarak ayırın.
            </div>

            {/* Validation errors blocking save */}
            {fullTextErrors.length > 0 && (
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs space-y-1.5 animate-fadeIn">
                <div className="font-semibold text-rose-400 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>Kayıt engellendi — lütfen aşağıdaki hataları düzeltin:</span>
                </div>
                <div className="space-y-1 pl-5">
                  {fullTextErrors.map((err, i) => (
                    <div key={i} className="text-rose-200">
                      • {err.message}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Warnings */}
            {fullTextWarnings.length > 0 && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-1 animate-fadeIn">
                <div className="font-semibold text-amber-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>Uyarılar:</span>
                </div>
                <div className="space-y-0.5 pl-5">
                  {fullTextWarnings.map((w, i) => (
                    <div key={i} className="text-amber-200/90">
                      • {w.message}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Large Textarea */}
            <div>
              <textarea
                value={fullTextContent}
                onChange={(e) => {
                  setFullTextContent(e.target.value);
                  if (fullTextErrors.length > 0) setFullTextErrors([]);
                }}
                rows={14}
                className="w-full p-4 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 font-mono text-xs sm:text-sm leading-relaxed focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors resize-y min-h-[300px]"
                placeholder={`# Başlık: ${text.title}\n# Seviye: B1\n# Grup: Doğa\n\nEN: First sentence...\nTR: İlk cümle...`}
                autoFocus
              />
              <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
                <span>{fullTextContent.split('\n').length} satır · {fullTextContent.length} karakter</span>
                <span>Format: # Başlık, # Seviye, # Grup, EN:, TR:</span>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsFullContentMode(false)}
                className="px-3.5 py-2 text-xs font-medium text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                ← Temel bilgilere dön
              </button>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700/80 rounded-xl transition-colors cursor-pointer"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-lg shadow-emerald-900/20 active:scale-[0.98] transition-all cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>Değişiklikleri Kaydet</span>
                </button>
              </div>
            </div>
          </form>
        ) : (
          /* Standard Metadata Mode */
          <form onSubmit={handleSubmitMetadata} className="p-5 space-y-4">
            {error && (
              <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                {error}
              </div>
            )}

            {/* Title Input */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Başlık <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Metin başlığı"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                autoFocus
              />
            </div>

            {/* Level Select */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Seviye
              </label>
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value as CEFRLevel)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
              >
                <option value="">Seviyesiz / Boş</option>
                <option value="A1">A1 (Başlangıç)</option>
                <option value="A2">A2 (Temel)</option>
                <option value="B1">B1 (Orta Öncesi)</option>
                <option value="B2">B2 (Orta Üstü)</option>
                <option value="C1">C1 (İleri)</option>
                <option value="C2">C2 (Yetkin)</option>
              </select>
            </div>

            {/* Group Input with suggestions */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Grup <span className="text-slate-500 font-normal">(Boş bırakılırsa "Grupsuz" olur)</span>
              </label>
              <input
                type="text"
                list="existing-groups-list-edit"
                value={group}
                onChange={(e) => setGroup(e.target.value)}
                placeholder="Örn: Doğa, Günlük Hayat..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
              />
              <datalist id="existing-groups-list-edit">
                {existingGroups
                  .filter((g) => g && g !== 'Grupsuz')
                  .map((g) => (
                    <option key={g} value={g} />
                  ))}
              </datalist>
            </div>

            {/* "Metni düzenle" Button: opens full serialized text editor */}
            <div className="pt-1.5">
              <button
                type="button"
                onClick={handleOpenFullContent}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-900/90 hover:bg-slate-900 border border-slate-700/80 hover:border-emerald-500/50 text-left transition-all cursor-pointer group shadow-sm"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center group-hover:bg-emerald-500/20 transition-colors">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-white group-hover:text-emerald-300 transition-colors">
                      Metni düzenle
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Cümle ve paragrafları metin olarak düzenle ({sentenceCount} cümle)
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
              </button>
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700/80 rounded-xl transition-colors cursor-pointer"
              >
                İptal
              </button>
              <button
                type="submit"
                className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-lg shadow-emerald-900/20 active:scale-[0.98] transition-all cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>Kaydet</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

