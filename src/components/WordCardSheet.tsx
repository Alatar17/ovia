/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { PoolNote } from '../types/pool';
import { WordCard } from '../data/readingData';
import { CardHtmlRenderer } from './CardHtmlRenderer';
import { mediaStore } from '../store/mediaStore';
import { X, ChevronDown, ChevronUp } from 'lucide-react';

interface WordCardSheetProps {
  notes?: PoolNote[] | null;
  card?: WordCard | null;
  onClose: () => void;
  isSidePanel?: boolean;
  style?: React.CSSProperties;
  className?: string;
  arrow?: { left: number; placement: 'above' | 'below' } | null;
}

export const WordCardSheet: React.FC<WordCardSheetProps> = ({
  notes,
  card,
  onClose,
  isSidePanel = false,
  style,
  className = '',
  arrow,
}) => {
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [hintExpanded, setHintExpanded] = useState(false);
  const touchStartY = useRef<number | null>(null);

  // Normalize notes list (deduplicated by guid so multiple headwords of the same note never create duplicate tabs)
  const activeNotesList: PoolNote[] = React.useMemo(() => {
    if (notes && notes.length > 0) {
      const seen = new Set<string>();
      const unique: PoolNote[] = [];
      for (const n of notes) {
        if (!seen.has(n.guid)) {
          seen.add(n.guid);
          unique.push(n);
        }
      }
      return unique;
    }
    if (card) {
      return [
        {
          guid: card.id,
          notetype: '',
          deck: '',
          front: card.front,
          back: card.back,
          hint: card.hint || '',
          tags: '',
          headwords: [card.headword],
          phrase: false,
          englishSide: 'on',
          suspicious: false,
          importedAt: 0,
          updatedAt: 0,
        },
      ];
    }
    return [];
  }, [notes, card]);

  // Reset tab index and hint when notes change
  useEffect(() => {
    setActiveTabIndex(0);
    setHintExpanded(false);
  }, [activeNotesList]);

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      mediaStore.stopAllAudio();
    };
  }, [onClose]);

  if (activeNotesList.length === 0) return null;

  const currentNote = activeNotesList[activeTabIndex] || activeNotesList[0];
  const primaryHeadword = currentNote.headwords[0] || 'Kelime';

  // Section 3.1 & 8: English side always on top, divider, then the other side
  const topContent = currentNote.englishSide === 'geri' ? currentNote.back : currentNote.front;
  const bottomContent = currentNote.englishSide === 'geri' ? currentNote.front : currentNote.back;

  // Swipe-down gesture for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;
    if (deltaY > 50) {
      onClose();
    }
    touchStartY.current = null;
  };

  const baseClasses = isSidePanel
    ? 'w-full bg-[var(--app-surface)] border border-slate-700/70 rounded-2xl shadow-xl flex flex-col relative max-h-[calc(100vh-6rem)] overflow-hidden'
    : 'bottom-sheet-mobile bg-[var(--app-surface)] border-t border-slate-700/70 rounded-t-2xl flex flex-col relative';

  return (
    <div
      id={!isSidePanel ? 'mobile-bottom-sheet' : undefined}
      className={`${baseClasses} ${className}`}
      style={style}
      onClick={(e) => e.stopPropagation()}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      role="dialog"
      aria-modal="true"
    >
      {/* Optional arrow for floating placement */}
      {arrow && arrow.placement === 'below' && (
        <>
          <div
            style={{ left: `${arrow.left}px` }}
            className="absolute -top-2 -translate-x-1/2 w-0 h-0 border-x-8 border-x-transparent border-b-8 border-b-[var(--app-surface)] z-20 pointer-events-none"
          />
          <div
            style={{ left: `${arrow.left}px` }}
            className="absolute -top-[9px] -translate-x-1/2 w-0 h-0 border-x-[9px] border-x-transparent border-b-[9px] border-b-slate-700/80 z-10 pointer-events-none"
          />
        </>
      )}
      {arrow && arrow.placement === 'above' && (
        <>
          <div
            style={{ left: `${arrow.left}px` }}
            className="absolute -bottom-2 -translate-x-1/2 w-0 h-0 border-x-8 border-x-transparent border-t-8 border-t-[var(--app-surface)] z-20 pointer-events-none"
          />
          <div
            style={{ left: `${arrow.left}px` }}
            className="absolute -bottom-[9px] -translate-x-1/2 w-0 h-0 border-x-[9px] border-x-transparent border-t-[9px] border-t-slate-700/80 z-10 pointer-events-none"
          />
        </>
      )}

      {/* Mobile drag handle */}
      {!isSidePanel && (
        <div className="w-full pt-2.5 pb-1 flex justify-center cursor-grab active:cursor-grabbing">
          <div className="w-10 h-1 bg-slate-600 rounded-full" />
        </div>
      )}

      {/* Small close (×) button in top-right */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute top-2.5 right-2.5 z-10 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors cursor-pointer"
        aria-label="Kapat"
        title="Kapat"
      >
        <X className="w-4 h-4" />
      </button>

      {/* Multi-match Tabs Bar (Section 7.4 & 8: Sekme çubuğu yalnızca birden fazla not eşleştiğinde görünsün) */}
      {activeNotesList.length > 1 && (
        <div className="flex items-center gap-1 px-4 pt-3 pb-1 border-b border-slate-700/60 overflow-x-auto pr-10">
          {activeNotesList.map((n, idx) => {
            const isTabActive = idx === activeTabIndex;
            const tabTitle = n.headwords[0]
              ? n.headwords[0].charAt(0).toUpperCase() + n.headwords[0].slice(1)
              : `Kart ${idx + 1}`;

            return (
              <button
                key={n.guid || idx}
                type="button"
                onClick={() => {
                  setActiveTabIndex(idx);
                  setHintExpanded(false);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  isTabActive
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                }`}
              >
                {tabTitle}
              </button>
            );
          })}
        </div>
      )}

      {/* Card Content - Scrollable Area */}
      <div className="pt-3 px-5 pb-5 overflow-y-auto flex-1 text-slate-200">
        {/* 1. TOP (ENGLISH SIDE) */}
        <div className="text-base text-slate-100 pr-6">
          <CardHtmlRenderer html={topContent} headword={primaryHeadword} />
        </div>

        {/* 2. HORIZONTAL DIVIDER */}
        <hr className="my-4 border-slate-700/60" />

        {/* 3. BOTTOM (OTHER SIDE) */}
        <div className="text-base text-slate-200">
          <CardHtmlRenderer html={bottomContent} headword={primaryHeadword} />
        </div>

        {/* 4. COLLAPSED HINT LINK (Only if hint has text) */}
        {currentNote.hint && currentNote.hint.trim() !== '' && (
          <div className="mt-4 pt-3 border-t border-slate-700/60">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setHintExpanded((prev) => !prev);
              }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-400 hover:text-amber-300 transition-colors py-1 px-1 cursor-pointer focus:outline-none"
            >
              <span>Hint</span>
              {hintExpanded ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>

            {hintExpanded && (
              <div className="mt-2.5 p-3 rounded-xl bg-slate-900/80 border border-slate-700/70 text-sm text-slate-200">
                <CardHtmlRenderer html={currentNote.hint} headword={primaryHeadword} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
