/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useId } from 'react';
import { StoredText } from '../types/text';
import { parseTexts, ParsedTextItem, parsedItemToStoredText } from '../utils/textImportParser';
import { textStore } from '../store/textStore';
import {
  ArrowLeft,
  Upload,
  FileText,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Save,
  BookOpen,
  Layers,
  Sparkles,
} from 'lucide-react';

// Prompt the user gives to another AI so its output already matches the import format
const AI_PROMPT_TEXT = `İngilizce öğrenen bir Türk için okuma metni yaz.

- Seviye: B1 (A1, A2, B1, B2, C1 veya C2 olarak değiştirebilirsin)
- Konu: [buraya konuyu yaz]
- Uzunluk: yaklaşık 150-200 kelime, 3-4 paragraf

Çıktıyı SADECE aşağıdaki formatta ver, başka hiçbir şey yazma:
- İlk üç satır:
# Başlık: <İngilizce başlık>
# Seviye: <seviye>
# Grup: <Türkçe konu grubu, örneğin Doğa>
- Ardından her cümle iki satır olsun: önce "EN: " ile İngilizce cümle, hemen altında "TR: " ile doğal Türkçe çevirisi.
- Her EN satırında tek bir cümle olsun.
- Paragraflar arasında bir boş satır bırak; paragraf içinde boş satır olmasın.
- Birden fazla metin istersem metinleri "=====" satırıyla ayır.
- Kod bloğu, madde işareti, kalın yazı veya açıklama kullanma.

Örnek:
# Başlık: The Old Garden
# Seviye: B1
# Grup: Doğa

EN: The old garden was quiet in the morning.
TR: Eski bahçe sabah sessizdi.
EN: White daisies grew along the path.
TR: Yol boyunca beyaz papatyalar büyüyordu.

EN: Under the big oak tree, I found a few acorns.
TR: Büyük meşe ağacının altında birkaç palamut buldum.`;

interface ImportViewProps {
  onBack: () => void;
  onSuccess: (addedCount: number) => void;
  existingTitles: Set<string>;
  existingGroups?: string[];
}

const SAMPLE_FORMAT_TEXT = `# Başlık: The Old Garden
# Seviye: B1
# Grup: Doğa

EN: The old garden was quiet in the morning.
TR: Eski bahçe sabah sessizdi.
EN: White daisies grew along the path.
TR: Yol boyunca beyaz papatyalar büyüyordu.

EN: Under the big oak tree, I found a few acorns.
TR: Büyük meşe ağacının altında birkaç palamut buldum.

=====
# Başlık: Next Text
# Seviye: B2
# Grup: Günlük Hayat

EN: She walked to the library every Saturday afternoon.
TR: Her cumartesi öğleden sonra kütüphaneye yürürdü.
EN: Reading books brought peace to her busy week.
TR: Kitap okumak yoğun geçen haftasına huzur getiriyordu.`;

export const ImportView: React.FC<ImportViewProps> = ({
  onBack,
  onSuccess,
  existingTitles,
  existingGroups = [],
}) => {
  const fileInputId = useId();
  const [rawText, setRawText] = useState('');
  const [isSampleOpen, setIsSampleOpen] = useState(false);
  const [copiedSample, setCopiedSample] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [parsedItems, setParsedItems] = useState<ParsedTextItem[]>([]);
  const [hasParsed, setHasParsed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedTempIds, setSelectedTempIds] = useState<Set<string>>(new Set());

  // Bulk apply controls
  const [bulkLevel, setBulkLevel] = useState<string>('__keep__');
  const [bulkGroup, setBulkGroup] = useState<string>('');
  const [bulkFeedback, setBulkFeedback] = useState<string | null>(null);

  // Group suggestions combined from existing groups and currently parsed items
  const allSuggestedGroups = React.useMemo(() => {
    const set = new Set<string>(existingGroups);
    parsedItems.forEach((t) => {
      const g = (t.group || '').trim();
      if (g && g !== 'Grupsuz') {
        set.add(g);
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'tr'));
  }, [existingGroups, parsedItems]);

  // Handle file uploads (.txt, one or more files)
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      const readPromises = Array.from(files).map((file) => file.text());
      const contents = await Promise.all(readPromises);
      const combined = contents.join('\n\n=====\n\n');

      setRawText((prev) => (prev.trim() ? `${prev}\n\n=====\n\n${combined}` : combined));
      e.target.value = '';
    } catch (err) {
      console.error('Dosya okunamadı:', err);
    }
  };

  const handleCopySample = () => {
    navigator.clipboard.writeText(SAMPLE_FORMAT_TEXT);
    setCopiedSample(true);
    setTimeout(() => setCopiedSample(false), 2000);
  };

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(AI_PROMPT_TEXT);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  const handleFillWithSample = () => {
    setRawText(SAMPLE_FORMAT_TEXT);
    const result = parseTexts(SAMPLE_FORMAT_TEXT);
    setParsedItems(result.texts);
    setHasParsed(true);
    const validIds = new Set(result.texts.filter((t) => t.isValid).map((t) => t.tempId));
    setSelectedTempIds(validIds);
  };

  // Run parser
  const handleParse = () => {
    if (!rawText.trim()) return;
    const result = parseTexts(rawText);
    setParsedItems(result.texts);
    setHasParsed(true);
    const validIds = new Set(result.texts.filter((t) => t.isValid).map((t) => t.tempId));
    setSelectedTempIds(validIds);
  };

  // Toggle selection of a valid text to save
  const toggleSelect = (tempId: string) => {
    setSelectedTempIds((prev) => {
      const next = new Set(prev);
      if (next.has(tempId)) {
        next.delete(tempId);
      } else {
        next.add(tempId);
      }
      return next;
    });
  };

  // Update a single parsed item's editable fields
  const handleUpdateItem = (tempId: string, updates: Partial<ParsedTextItem>) => {
    setParsedItems((prev) =>
      prev.map((item) => {
        if (item.tempId !== tempId) return item;
        return {
          ...item,
          ...updates,
        };
      })
    );
  };

  // Apply bulk level and group to all parsed texts
  const handleApplyBulk = () => {
    if (parsedItems.length === 0) return;
    setParsedItems((prev) =>
      prev.map((item) => {
        const updated = { ...item };
        if (bulkLevel !== '__keep__') {
          updated.level = bulkLevel as any;
        }
        if (bulkGroup.trim() !== '') {
          updated.group = bulkGroup.trim();
        }
        return updated;
      })
    );
    setBulkFeedback('Tüm metinlere uygulandı!');
    setTimeout(() => setBulkFeedback(null), 2500);
  };

  // Save selected valid texts
  const handleSave = async () => {
    const validToSave = parsedItems.filter(
      (item) => item.isValid && item.title.trim().length > 0 && selectedTempIds.has(item.tempId)
    );
    if (validToSave.length === 0) return;

    try {
      setIsSaving(true);
      const records: StoredText[] = validToSave.map((item) => ({
        ...parsedItemToStoredText(item),
        title: item.title.trim(),
        level: item.level,
        group: item.group.trim(),
      }));
      await textStore.addMany(records);
      onSuccess(records.length);
    } catch (err) {
      console.error('Metinler kaydedilemedi:', err);
      setIsSaving(false);
    }
  };

  const validCount = parsedItems.filter((t) => t.isValid).length;
  const errorCount = parsedItems.filter((t) => !t.isValid).length;
  const selectedCount = parsedItems.filter((t) => t.isValid && selectedTempIds.has(t.tempId)).length;

  return (
    <div className="min-h-screen bg-[var(--app-bg)] text-slate-100 flex flex-col">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-[var(--app-bg)]/95 backdrop-blur-md border-b border-slate-800 px-4 sm:px-8 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/80 transition-colors text-sm font-medium cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Kütüphane</span>
            </button>
            <div className="h-4 w-px bg-slate-800" />
            <h1 className="text-base sm:text-lg font-semibold text-white">Metin Ekle</h1>
          </div>

          {/* Quick Sample Button */}
          <button
            type="button"
            onClick={handleFillWithSample}
            className="text-xs font-medium text-emerald-400 hover:text-emerald-300 py-1 px-2 rounded-md hover:bg-emerald-500/10 transition-colors cursor-pointer"
          >
            Örnek metin doldur
          </button>
        </div>
      </header>

      {/* Main Body */}
      <main className="max-w-4xl w-full mx-auto px-4 sm:px-8 py-6 flex-1 space-y-6">
        {/* Format Explanation & Collapsible Box */}
        <section className="bg-[var(--app-surface)] border border-slate-800/90 rounded-2xl p-4 sm:p-5">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-400" />
                <span>Metin Formatı</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Her metin için isteğe bağlı <code className="text-emerald-300"># Başlık</code>, <code className="text-emerald-300"># Seviye</code> (A1–C2) ve <code className="text-emerald-300"># Grup</code> etiketlerini kullanın. Cümleleri <code className="text-emerald-300">EN:</code> ve <code className="text-emerald-300">TR:</code> çiftleri olarak yazın. Birden fazla metni <code className="text-emerald-300">=====</code> satırı ile ayırın.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsSampleOpen((prev) => !prev)}
              className="flex items-center gap-1 text-xs font-medium text-slate-300 hover:text-white px-2.5 py-1.5 rounded-lg bg-slate-800/70 hover:bg-slate-800 transition-colors cursor-pointer shrink-0 ml-3"
            >
              <span>{isSampleOpen ? 'Gizle' : 'Örnek format'}</span>
              {isSampleOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Collapsible Example Content */}
          {isSampleOpen && (
            <div className="mt-4 pt-4 border-t border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Örnek Şablon
                </span>
                <button
                  type="button"
                  onClick={handleCopySample}
                  className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
                >
                  {copiedSample ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedSample ? 'Kopyalandı' : 'Kopyala'}</span>
                </button>
              </div>
              <pre className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80 text-xs font-mono text-slate-300 overflow-x-auto leading-relaxed whitespace-pre-wrap select-all">
                {SAMPLE_FORMAT_TEXT}
              </pre>
            </div>
          )}
        </section>

        {/* Input Methods: Textarea & File Picker */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <label className="text-sm font-semibold text-slate-200">
              Metin İçeriği
            </label>

            {/* AI prompt copy + file upload trigger */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleCopyPrompt}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700/80 border border-slate-700 text-xs font-medium text-slate-200 hover:text-white transition-colors cursor-pointer"
                title="Metni üretecek yapay zekâya yapıştıracağın komutu kopyalar"
              >
                {copiedPrompt ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                )}
                <span>{copiedPrompt ? 'Kopyalandı' : 'Yapay zekâ komutunu kopyala'}</span>
              </button>
              <input
                id={fileInputId}
                type="file"
                multiple
                accept=".txt,text/plain"
                onChange={handleFileChange}
                className="hidden"
              />
              <label
                htmlFor={fileInputId}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700/80 border border-slate-700 text-xs font-medium text-slate-200 hover:text-white transition-colors cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-emerald-400" />
                <span>.txt Dosyası Yükle</span>
              </label>
              {rawText && (
                <button
                  type="button"
                  onClick={() => {
                    setRawText('');
                    setParsedItems([]);
                    setHasParsed(false);
                  }}
                  className="text-xs text-slate-400 hover:text-rose-400 px-2 py-1.5 transition-colors cursor-pointer"
                >
                  Temizle
                </button>
              )}
            </div>
          </div>

          <textarea
            value={rawText}
            onChange={(e) => {
              setRawText(e.target.value);
              // reset parsed state on typing so user can re-preview
              setHasParsed(false);
            }}
            placeholder={`Buraya metinlerinizi yapıştırın veya yukarıdaki ".txt Dosyası Yükle" butonunu kullanın...\n\n# Başlık: My Story\n# Seviye: B1\nEN: First sentence...\nTR: İlk cümle...`}
            rows={10}
            className="w-full p-4 rounded-2xl bg-slate-900 border border-slate-800 text-slate-100 placeholder-slate-500 font-mono text-xs sm:text-sm leading-relaxed focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors resize-y min-h-[180px]"
          />

          {/* Action to Parse / Preview */}
          <div className="flex items-center justify-between pt-1">
            <div className="text-xs text-slate-400">
              {rawText.length > 0 ? (
                <span>
                  {rawText.split('\n').length} satır · {rawText.length} karakter
                </span>
              ) : (
                <span>Henüz metin girilmedi</span>
              )}
            </div>

            <button
              type="button"
              disabled={!rawText.trim()}
              onClick={handleParse}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm font-medium text-white border border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span>Ayrıştır ve Önizle</span>
            </button>
          </div>
        </section>

        {/* Parsed Preview Section */}
        {hasParsed && (
          <section className="space-y-4 pt-4 border-t border-slate-800">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-white flex items-center gap-2">
                  <span>Ayrıştırılan Metinler</span>
                  <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                    {parsedItems.length} metin
                  </span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {validCount > 0 && <span className="text-emerald-400 font-medium">{validCount} geçerli</span>}
                  {validCount > 0 && errorCount > 0 && <span> · </span>}
                  {errorCount > 0 && <span className="text-rose-400 font-medium">{errorCount} hatalı</span>}
                </p>
              </div>

              {validCount > 0 && (
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      const allValid = new Set(parsedItems.filter((t) => t.isValid).map((t) => t.tempId));
                      setSelectedTempIds(allValid);
                    }}
                    className="text-slate-300 hover:text-white underline cursor-pointer"
                  >
                    Tümünü Seç
                  </button>
                  <span className="text-slate-600">·</span>
                  <button
                    type="button"
                    onClick={() => setSelectedTempIds(new Set())}
                    className="text-slate-300 hover:text-white underline cursor-pointer"
                  >
                    Seçimi Kaldır
                  </button>
                </div>
              )}
            </div>

            {/* Shared group suggestions datalist */}
            <datalist id="import-existing-groups-list">
              {allSuggestedGroups.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>

            {/* Optional 'Hepsine uygula' Row */}
            {parsedItems.length > 0 && (
              <div className="p-3.5 bg-[var(--app-surface)] border border-slate-700/80 rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Hepsine uygula (Tüm metinler için seviye ve grup)</span>
                  </span>
                  {bulkFeedback && (
                    <span className="text-xs text-emerald-400 flex items-center gap-1 font-medium animate-fadeIn">
                      <Check className="w-3.5 h-3.5" />
                      <span>{bulkFeedback}</span>
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="w-full sm:w-44">
                    <select
                      value={bulkLevel}
                      onChange={(e) => setBulkLevel(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                    >
                      <option value="__keep__">Seviyeyi değiştirme</option>
                      <option value="">Boş / Seviyesiz</option>
                      <option value="A1">A1</option>
                      <option value="A2">A2</option>
                      <option value="B1">B1</option>
                      <option value="B2">B2</option>
                      <option value="C1">C1</option>
                      <option value="C2">C2</option>
                    </select>
                  </div>

                  <div className="w-full sm:w-56">
                    <input
                      type="text"
                      value={bulkGroup}
                      onChange={(e) => setBulkGroup(e.target.value)}
                      placeholder="Grup adı..."
                      list="import-existing-groups-list"
                      className="w-full px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleApplyBulk}
                    className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 hover:border-slate-600 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Hepsine uygula
                  </button>
                </div>
              </div>
            )}

            {parsedItems.length === 0 ? (
              <div className="p-8 text-center bg-[var(--app-surface)] border border-slate-800 rounded-2xl">
                <AlertCircle className="w-8 h-8 text-amber-400 mx-auto mb-2" />
                <p className="text-sm text-slate-200 font-medium">Metin ayrıştırılamadı</p>
                <p className="text-xs text-slate-400 mt-1">
                  Lütfen girilen içeriğin EN: ve TR: formatına uygun olduğunu kontrol edin.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {parsedItems.map((item, idx) => {
                  const isTitleDuplicate = existingTitles.has(item.title.trim().toLowerCase());
                  const isChecked = selectedTempIds.has(item.tempId);
                  const isTitleEmpty = !item.title.trim();

                  return (
                    <div
                      key={item.tempId}
                      className={`p-4 rounded-2xl border transition-all ${
                        item.isValid
                          ? isChecked
                            ? 'bg-[var(--app-surface)] border-emerald-500/50 shadow-sm'
                            : 'bg-[var(--app-surface)]/70 border-slate-800 opacity-75'
                          : 'bg-rose-950/20 border-rose-800/60'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          {item.isValid ? (
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={isTitleEmpty}
                              onChange={() => toggleSelect(item.tempId)}
                              className="mt-2.5 w-4 h-4 rounded text-emerald-500 bg-slate-900 border-slate-700 focus:ring-emerald-500 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                            />
                          ) : (
                            <div className="mt-2.5 w-5 h-5 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
                              <AlertCircle className="w-3.5 h-3.5" />
                            </div>
                          )}

                          <div className="flex-1 min-w-0 space-y-3">
                            {/* Editable Header row: Title, Level, Group */}
                            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                              {/* Title input */}
                              <div className="sm:col-span-6">
                                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                                  {idx + 1}. Başlık <span className="text-rose-400">*</span>
                                </label>
                                <input
                                  type="text"
                                  value={item.title}
                                  onChange={(e) => handleUpdateItem(item.tempId, { title: e.target.value })}
                                  placeholder="Metin başlığı..."
                                  className="w-full px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs sm:text-sm font-semibold text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                                />
                                {isTitleEmpty && (
                                  <p className="text-[11px] text-rose-400 mt-1">Başlık boş bırakılamaz.</p>
                                )}
                              </div>

                              {/* Level select */}
                              <div className="sm:col-span-3">
                                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                                  Seviye
                                </label>
                                <select
                                  value={item.level}
                                  onChange={(e) => handleUpdateItem(item.tempId, { level: e.target.value as any })}
                                  className="w-full px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors"
                                >
                                  <option value="">Boş</option>
                                  <option value="A1">A1</option>
                                  <option value="A2">A2</option>
                                  <option value="B1">B1</option>
                                  <option value="B2">B2</option>
                                  <option value="C1">C1</option>
                                  <option value="C2">C2</option>
                                </select>
                              </div>

                              {/* Group input */}
                              <div className="sm:col-span-3">
                                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                                  Grup
                                </label>
                                <input
                                  type="text"
                                  value={item.group}
                                  onChange={(e) => handleUpdateItem(item.tempId, { group: e.target.value })}
                                  placeholder="Grupsuz"
                                  list="import-existing-groups-list"
                                  className="w-full px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                                />
                              </div>
                            </div>

                            {/* Sentence & Paragraph stats */}
                            <div className="flex items-center gap-3 text-xs text-slate-400">
                              <span className="flex items-center gap-1">
                                <BookOpen className="w-3 h-3 text-slate-500" />
                                {item.sentenceCount} cümle
                              </span>
                              <span>·</span>
                              <span className="flex items-center gap-1">
                                <Layers className="w-3 h-3 text-slate-500" />
                                {item.paragraphCount} paragraf
                              </span>
                            </div>

                            {/* Duplicate title warning */}
                            {isTitleDuplicate && (
                              <div className="flex items-center gap-1.5 text-xs text-amber-300/90 bg-amber-500/10 border border-amber-500/25 px-2.5 py-1 rounded-lg">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                <span>Bu başlık kütüphanenizde zaten mevcut (yine de kaydedilebilir).</span>
                              </div>
                            )}

                            {/* Warnings list */}
                            {item.warnings.length > 0 && (
                              <div className="space-y-1">
                                {item.warnings.map((w, wIdx) => (
                                  <div
                                    key={wIdx}
                                    className="flex items-start gap-1.5 text-xs text-amber-300/80"
                                  >
                                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
                                    <span>{w.message}</span>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Errors list */}
                            {item.errors.length > 0 && (
                              <div className="space-y-1">
                                {item.errors.map((e, eIdx) => (
                                  <div
                                    key={eIdx}
                                    className="flex items-start gap-1.5 text-xs text-rose-300 font-medium"
                                  >
                                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-rose-400" />
                                    <span>{e.message}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Status icon badge */}
                        <div className="shrink-0 mt-1">
                          {item.isValid ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full font-medium">
                              <CheckCircle2 className="w-3 h-3" />
                              Hazır
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-full font-medium">
                              <AlertCircle className="w-3 h-3" />
                              Hatalı
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Bottom Save Bar */}
            {validCount > 0 && (
              <div className="sticky bottom-4 z-20 p-4 rounded-2xl bg-[var(--app-surface)] border border-slate-700/80 shadow-2xl flex items-center justify-between gap-4">
                <div className="text-xs text-slate-300">
                  <span className="font-semibold text-white">{selectedCount}</span> metin kütüphaneye kaydedilecek.
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={onBack}
                    className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
                  >
                    Vazgeç
                  </button>
                  <button
                    type="button"
                    disabled={selectedCount === 0 || isSaving}
                    onClick={handleSave}
                    className="flex items-center gap-2 px-5 py-2 text-xs sm:text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl shadow-lg shadow-emerald-900/30 active:scale-[0.98] transition-all cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    <span>{isSaving ? 'Kaydediliyor...' : `${selectedCount} Metni Kaydet`}</span>
                  </button>
                </div>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
};
