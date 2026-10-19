/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { X, CheckCircle2, FileText } from 'lucide-react';
import { WordToken } from '../utils/textParser';
import { PoolNote, PhraseMatch } from '../types/pool';

export interface MatchSummaryItem {
  tokenText: string;
  headword: string;
  rule: string;
  count: number;
  notes: PoolNote[];
}

interface MatchesModalProps {
  isOpen: boolean;
  onClose: () => void;
  tokens: WordToken[];
  phraseMatches?: PhraseMatch[];
  onSelectNotes: (notes: PoolNote[]) => void;
}

export const MatchesModal: React.FC<MatchesModalProps> = ({
  isOpen,
  onClose,
  tokens,
  phraseMatches,
  onSelectNotes,
}) => {
  if (!isOpen) return null;

  // Aggregate matches from tokens (single words)
  const matchMap = new Map<string, MatchSummaryItem>();
  const allMatchedNotesGuids = new Set<string>();
  let totalPoolWordOccurrences = 0;

  for (const t of tokens) {
    if (t.match && t.notes.length > 0 && !t.phraseMatch) {
      totalPoolWordOccurrences++;
      t.notes.forEach((n) => allMatchedNotesGuids.add(n.guid));

      const key = `${t.cleanWord}::${t.match.matchedHeadword}::${t.match.rule}`;
      const existing = matchMap.get(key);
      if (existing) {
        existing.count++;
      } else {
        matchMap.set(key, {
          tokenText: t.coreWord,
          headword: t.match.matchedHeadword,
          rule: t.match.rule,
          count: 1,
          notes: t.notes,
        });
      }
    }
  }

  // Aggregate phrase matches
  if (phraseMatches && phraseMatches.length > 0) {
    for (const pm of phraseMatches) {
      totalPoolWordOccurrences++;
      pm.notes.forEach((n) => allMatchedNotesGuids.add(n.guid));

      const key = `${pm.matchedText.toLowerCase()}::${pm.displayHeadword}::kalıp`;
      const existing = matchMap.get(key);
      if (existing) {
        existing.count++;
      } else {
        matchMap.set(key, {
          tokenText: pm.matchedText,
          headword: pm.displayHeadword,
          rule: 'kalıp',
          count: 1,
          notes: pm.notes,
        });
      }
    }
  }

  const matchList = Array.from(matchMap.values()).sort((a, b) =>
    a.tokenText.localeCompare(b.tokenText, 'tr')
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-[var(--app-surface)] border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] text-slate-200"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="matches-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-[var(--app-sunken)]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div>
              <h2 id="matches-title" className="text-base font-bold text-white leading-tight">
                Metin Eşleşmeleri Raporu
              </h2>
              <p className="text-xs text-slate-400">
                {totalPoolWordOccurrences} havuz kelimesi, {allMatchedNotesGuids.size} farklı kart
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Kapat"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content List */}
        <div className="p-4 overflow-y-auto flex-1 divide-y divide-slate-800/60">
          {matchList.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm">
              <FileText className="w-10 h-10 mx-auto text-slate-600 mb-2" />
              Bu metinde henüz eşleşen havuz kelimesi bulunamadı.
            </div>
          ) : (
            matchList.map((item, idx) => (
              <div
                key={idx}
                onClick={() => {
                  onSelectNotes(item.notes);
                  onClose();
                }}
                className="py-2.5 px-3 flex items-center justify-between hover:bg-slate-800/40 rounded-xl transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-white group-hover:text-emerald-300">
                    {item.tokenText}
                  </span>
                  <span className="text-slate-500 text-xs">→</span>
                  <span className="text-emerald-400 font-medium text-sm">
                    {item.headword}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      item.rule.includes('ek başlık')
                        ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30 font-medium'
                        : item.rule === 'kalıp' || item.rule.includes('düzensiz') || item.rule.includes('özel')
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 font-medium'
                        : 'bg-slate-800 text-slate-300 border border-slate-700/60'
                    }`}
                  >
                    {item.rule.includes('ek başlık') ? `(${item.rule})` : item.rule}
                  </span>
                </div>
                <div className="text-xs text-slate-400 font-mono">
                  {item.count > 1 ? `${item.count}×` : ''}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-[var(--app-sunken)] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium transition-colors cursor-pointer"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
};
