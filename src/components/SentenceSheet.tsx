import React, { useRef, useEffect } from 'react';
import { SentenceItem } from '../data/readingData';
import { X } from 'lucide-react';

interface SentenceSheetProps {
  sentence: SentenceItem | null;
  onClose: () => void;
  isSidePanel?: boolean;
  style?: React.CSSProperties;
  className?: string;
  arrow?: { left: number; placement: 'above' | 'below' } | null;
}

export const SentenceSheet: React.FC<SentenceSheetProps> = ({
  sentence,
  onClose,
  isSidePanel = false,
  style,
  className = '',
  arrow,
}) => {
  const touchStartY = useRef<number | null>(null);

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!sentence) return null;

  // Swipe-down gesture handler
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    const touchEndY = e.changedTouches[0].clientY;
    const deltaY = touchEndY - touchStartY.current;
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

      {/* Small close (×) button in the top-right corner */}
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

      {/* Sentence Content */}
      <div className="pt-3 px-5 pb-5 overflow-y-auto flex-1">
        {/* English Sentence */}
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-1.5">
            İNGİLİZCE
          </span>
          <p className="font-reading text-lg sm:text-xl text-slate-100 leading-relaxed pr-6">
            {sentence.en}
          </p>
        </div>

        {/* Divider */}
        <hr className="my-3.5 border-slate-700/60" />

        {/* Turkish Translation */}
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400/90 block mb-1.5">
            TÜRKÇE ÇEVİRİ
          </span>
          <p className="text-base text-slate-200 leading-relaxed font-sans">
            {sentence.tr}
          </p>
        </div>
      </div>
    </div>
  );
};
