/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { SAMPLE_ARTICLE, SentenceItem } from '../data/readingData';
import { StoredText } from '../types/text';
import { PoolNote, PhraseMatch } from '../types/pool';
import { tokenizeSentence, WordToken } from '../utils/textParser';
import { WordCardSheet } from './WordCardSheet';
import { SentenceSheet } from './SentenceSheet';
import { SettingsMenu, HighlightStyle, DesktopPanelPlacement } from './SettingsMenu';
import { MatchesModal } from './MatchesModal';
import { PoolSettingsModal } from './PoolSettingsModal';
import { ClearPoolModal } from './ClearPoolModal';
import { poolStore } from '../store/poolStore';
import { Settings, ArrowLeft, ListFilter, Eye, EyeOff } from 'lucide-react';

const HIDE_HIGHLIGHTS_KEY = 'ovia_hide_highlights';

function loadHideHighlights(): boolean {
  try {
    return localStorage.getItem(HIDE_HIGHLIGHTS_KEY) === '1';
  } catch {
    return false;
  }
}

interface ReadingViewProps {
  article?: StoredText;
  onBackToLibrary?: () => void;
  highlightStyle: HighlightStyle;
  onHighlightStyleChange: (style: HighlightStyle) => void;
  panelPlacement: DesktopPanelPlacement;
  onPanelPlacementChange: (placement: DesktopPanelPlacement) => void;
  onReloadLibrary?: () => void;
  onNotify?: (message: string, type?: 'success' | 'error' | 'info') => void;
  onOpenCustomMatches?: () => void;
}

export const ReadingView: React.FC<ReadingViewProps> = ({
  article,
  onBackToLibrary,
  highlightStyle,
  onHighlightStyleChange,
  panelPlacement,
  onPanelPlacementChange,
  onReloadLibrary,
  onNotify,
  onOpenCustomMatches,
}) => {
  const currentArticle = article || (SAMPLE_ARTICLE as unknown as StoredText);

  // Settings dropdown visibility
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPoolSettingsOpen, setIsPoolSettingsOpen] = useState(false);
  const [isMatchesModalOpen, setIsMatchesModalOpen] = useState(false);
  const [isClearPoolOpen, setIsClearPoolOpen] = useState(false);

  // Hide pool highlights (words stay clickable, only the styling is removed)
  const [hideHighlights, setHideHighlights] = useState<boolean>(loadHideHighlights);

  const toggleHideHighlights = () => {
    setHideHighlights((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(HIDE_HIGHLIGHTS_KEY, next ? '1' : '0');
      } catch {
        // storage unavailable: keep in memory only
      }
      return next;
    });
  };

  // Desktop shortcut: W toggles highlights (ignored while typing)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyW' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) {
        return;
      }
      e.preventDefault();
      toggleHideHighlights();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  // Subscription to poolStore updates
  const [poolRevision, setPoolRevision] = useState(0);
  useEffect(() => {
    return poolStore.subscribe(() => {
      setPoolRevision((r) => r + 1);
    });
  }, []);

  // Active interaction states
  const [selectedWordId, setSelectedWordId] = useState<string | null>(null);
  const [selectedPhraseId, setSelectedPhraseId] = useState<string | null>(null);
  const [activeSentenceIndex, setActiveSentenceIndex] = useState<number | null>(null);
  const [activeWordNotes, setActiveWordNotes] = useState<PoolNote[] | null>(null);
  const [activeSentence, setActiveSentence] = useState<SentenceItem | null>(null);

  // Dynamic bottom sheet height on narrow screens (< 1100px)
  const [sheetHeight, setSheetHeight] = useState<number>(0);

  // Floating card position for Option B ("Kelimenin yanında") on desktop (>= 1100px)
  const [floatingPos, setFloatingPos] = useState<{
    left: number;
    top: number;
    width: number;
    arrowLeft: number;
    placement: 'above' | 'below';
  } | null>(null);

  const desktopCardRef = useRef<HTMLDivElement>(null);

  // Parse paragraphs and assign sequential global sentence index
  const parsedParagraphs = useMemo(() => {
    const poolIndex = poolStore.getActivePoolIndex();
    const irregularMap = poolStore.getIrregularVerbMap();
    const phraseIndex = poolStore.getShowPhrases() ? poolStore.getActivePhraseIndex() : null;
    let globalIdx = 0;
    const paragraphsList = currentArticle.paragraphs || [];

    return paragraphsList.map((para) => {
      return para.map((sentence) => {
        const sentenceIndex = globalIdx++;
        return {
          sentence,
          sentenceIndex,
          tokens: tokenizeSentence(sentence.en, sentenceIndex, poolIndex, irregularMap, phraseIndex),
        };
      });
    });
  }, [currentArticle, poolRevision]);

  // Flat sentence list for quick lookup
  const flatSentences = useMemo(() => {
    return parsedParagraphs.flat();
  }, [parsedParagraphs]);

  // All tokens in text
  const allTokens = useMemo(() => {
    const list: WordToken[] = [];
    parsedParagraphs.forEach((para) => {
      para.forEach(({ tokens }) => {
        tokens.forEach((t) => list.push(t));
      });
    });
    return list;
  }, [parsedParagraphs]);

  // All distinct phrase matches occurring in this text
  const allPhraseMatches = useMemo(() => {
    const seen = new Set<string>();
    const list: PhraseMatch[] = [];
    allTokens.forEach((t) => {
      if (t.phraseMatch && !seen.has(t.phraseMatch.id)) {
        seen.add(t.phraseMatch.id);
        list.push(t.phraseMatch);
      }
    });
    return list;
  }, [allTokens]);

  // Count pool words occurring in this text (single words + phrases)
  const poolMatchesInText = useMemo(() => {
    const singleMatches = allTokens.filter((t) => t.match && t.notes.length > 0 && !t.phraseMatch).length;
    return singleMatches + allPhraseMatches.length;
  }, [allTokens, allPhraseMatches]);

  const activePoolHeadwordsCount = poolStore.getActivePoolIndex().size;
  const isAnyPanelOpen = Boolean((activeWordNotes && activeWordNotes.length > 0) || activeSentence);

  // Measure bottom sheet height on narrow screens
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!isAnyPanelOpen || window.innerWidth >= 1100) {
      setSheetHeight(0);
      return;
    }

    const updateHeight = () => {
      const sheetEl = document.getElementById('mobile-bottom-sheet');
      if (sheetEl) {
        const height = sheetEl.offsetHeight || sheetEl.getBoundingClientRect().height;
        if (height > 0) {
          setSheetHeight(height);
        }
      }
    };

    updateHeight();
    const rafId = requestAnimationFrame(updateHeight);

    const sheetEl = document.getElementById('mobile-bottom-sheet');
    let observer: ResizeObserver | null = null;
    if (sheetEl && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const height = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
          if (height > 0) {
            setSheetHeight(height);
          }
        }
      });
      observer.observe(sheetEl);
    }

    return () => {
      cancelAnimationFrame(rafId);
      if (observer) observer.disconnect();
    };
  }, [isAnyPanelOpen, activeWordNotes, activeSentence?.id]);

  // Auto-scroll on mobile when sentence or word is obscured
  useEffect(() => {
    if (typeof window === 'undefined' || window.innerWidth >= 1100) {
      return;
    }

    if ((!selectedWordId && !selectedPhraseId && activeSentenceIndex === null) || sheetHeight <= 0) {
      return;
    }

    let targetEl: HTMLElement | null = null;
    if (selectedPhraseId) {
      targetEl = document.getElementById(selectedPhraseId);
    } else if (selectedWordId) {
      targetEl = document.getElementById(selectedWordId);
    } else if (activeSentenceIndex !== null) {
      targetEl = document.getElementById(`sentence-item-${activeSentenceIndex}`);
    }
    if (!targetEl) return;

    const targetRect = targetEl.getBoundingClientRect();
    const sheetTop = window.innerHeight - sheetHeight;
    const desiredBottom = sheetTop - 16;

    if (targetRect.bottom > desiredBottom) {
      const diff = targetRect.bottom - desiredBottom;
      if (diff > 0) {
        window.scrollTo({
          top: window.scrollY + diff,
          behavior: 'smooth',
        });
      }
    }
  }, [activeSentenceIndex, selectedWordId, selectedPhraseId, sheetHeight]);

  // Floating placement calculation on desktop
  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      window.innerWidth < 1100 ||
      panelPlacement !== 'floating' ||
      !isAnyPanelOpen
    ) {
      setFloatingPos(null);
      return;
    }

    const updateFloating = () => {
      let targetEl: HTMLElement | null = null;
      if (selectedPhraseId) {
        targetEl = document.getElementById(selectedPhraseId);
      } else if (selectedWordId) {
        targetEl = document.getElementById(selectedWordId);
      } else if (activeSentenceIndex !== null) {
        targetEl =
          document.getElementById(`s${activeSentenceIndex}-w0`) ||
          document.getElementById(`sentence-item-${activeSentenceIndex}`);
      }

      if (!targetEl) return;

      const targetRect = targetEl.getBoundingClientRect();
      const cardWidth = Math.min(420, window.innerWidth - 32);
      const targetCenterX = targetRect.left + targetRect.width / 2;

      const idealLeft = targetCenterX - cardWidth / 2;
      const clampedLeft = Math.max(16, Math.min(idealLeft, window.innerWidth - cardWidth - 16));
      const arrowLeft = Math.max(20, Math.min(targetCenterX - clampedLeft, cardWidth - 20));

      const cardEl = desktopCardRef.current;
      const cardHeight = cardEl ? cardEl.offsetHeight : 340;

      const spaceBelow = window.innerHeight - targetRect.bottom;
      const spaceAbove = targetRect.top;

      if (spaceBelow < Math.min(cardHeight + 20, 320) && spaceAbove > spaceBelow) {
        const cardTop = Math.max(16, targetRect.top - 8 - cardHeight);
        setFloatingPos({
          left: clampedLeft,
          top: cardTop,
          width: cardWidth,
          arrowLeft,
          placement: 'above',
        });
      } else {
        const cardTop = targetRect.bottom + 8;
        setFloatingPos({
          left: clampedLeft,
          top: cardTop,
          width: cardWidth,
          arrowLeft,
          placement: 'below',
        });
      }
    };

    updateFloating();
    const rafId = requestAnimationFrame(updateFloating);

    window.addEventListener('scroll', updateFloating, { passive: true });
    window.addEventListener('resize', updateFloating, { passive: true });

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', updateFloating);
      window.removeEventListener('resize', updateFloating);
    };
  }, [
    selectedWordId,
    selectedPhraseId,
    activeSentenceIndex,
    activeWordNotes,
    activeSentence?.id,
    panelPlacement,
    isAnyPanelOpen,
  ]);

  // Handle word click
  const handleWordClick = (token: WordToken) => {
    if (token.phraseMatch) {
      handlePhraseClick(token.phraseMatch);
      return;
    }

    if (token.match && token.notes.length > 0) {
      // Pool word: Show word card, DO NOT box/highlight the sentence
      setSelectedWordId(token.id);
      setSelectedPhraseId(null);
      setActiveSentenceIndex(null);
      setActiveWordNotes(token.notes);
      setActiveSentence(null);
    } else {
      // Non-pool word: User wants sentence translation, box the whole sentence
      setSelectedWordId(null);
      setSelectedPhraseId(null);
      setActiveSentenceIndex(token.sentenceIndex);
      setActiveSentence(flatSentences[token.sentenceIndex]?.sentence || null);
      setActiveWordNotes(null);
    }
  };

  // Handle phrase click: clicking any word of the phrase opens that phrase note's card
  const handlePhraseClick = (pm: PhraseMatch) => {
    setSelectedPhraseId(pm.id);
    setSelectedWordId(null);
    setActiveSentenceIndex(null);
    setActiveWordNotes(pm.notes);
    setActiveSentence(null);
  };

  const handleDismiss = () => {
    setSelectedWordId(null);
    setSelectedPhraseId(null);
    setActiveSentenceIndex(null);
    setActiveWordNotes(null);
    setActiveSentence(null);
  };

  const getPoolWordBaseClass = () => {
    if (hideHighlights) return 'text-slate-200';
    switch (highlightStyle) {
      case 'bold':
        return 'font-bold text-slate-100';
      case 'green':
        return 'font-normal text-[var(--pool-word)]';
      case 'bold-green':
      default:
        return 'font-bold text-[var(--pool-word)]';
    }
  };

  const readingAreaPaddingBottom =
    sheetHeight > 0 && typeof window !== 'undefined' && window.innerWidth < 1100
      ? `${sheetHeight + 16}px`
      : undefined;

  const isFloatingMode = panelPlacement === 'floating';

  return (
    <div
      className="min-h-screen bg-[var(--app-bg)] text-slate-100 flex flex-col relative"
      onClick={handleDismiss}
    >
      {/* Top Navigation Bar */}
      <header
        className="reading-layout sticky top-0 z-30 bg-[var(--app-bg)] border-b border-slate-800/80 px-4 sm:px-8 py-3 transition-colors relative"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="reading-column max-w-[700px] mx-auto flex items-center justify-between">
          {/* Left: Back button */}
          <div className="flex items-center gap-3">
            {onBackToLibrary && (
              <button
                type="button"
                onClick={onBackToLibrary}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700 text-xs sm:text-sm font-medium transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Kütüphane</span>
              </button>
            )}
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-2.5 relative">
            {/* Highlight visibility toggle */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleHideHighlights();
              }}
              className={`p-2 rounded-lg border transition-colors cursor-pointer ${
                hideHighlights
                  ? 'text-slate-400 hover:text-white hover:bg-slate-800/70 border-transparent hover:border-slate-700/50'
                  : 'text-emerald-400 hover:bg-slate-800/70 border-transparent hover:border-slate-700/50'
              }`}
              aria-pressed={!hideHighlights}
              aria-label={hideHighlights ? 'Vurguları göster' : 'Vurguları gizle'}
              title={hideHighlights ? 'Vurguları göster (W)' : 'Vurguları gizle (W)'}
            >
              {hideHighlights ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>

            {/* Settings Trigger */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsSettingsOpen((prev) => !prev);
              }}
              className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/70 border border-transparent hover:border-slate-700/50 transition-colors cursor-pointer"
              aria-label="Ayarlar"
              title="Ayarlar"
            >
              <Settings className="w-4 h-4" />
            </button>

            {/* Settings Popover Menu */}
            <SettingsMenu
              isOpen={isSettingsOpen}
              onClose={() => setIsSettingsOpen(false)}
              highlightStyle={highlightStyle}
              onHighlightStyleChange={onHighlightStyleChange}
              panelPlacement={panelPlacement}
              onPanelPlacementChange={onPanelPlacementChange}
              onShowPhrasesChange={() => setPoolRevision((r) => r + 1)}
              onOpenPoolSettings={() => setIsPoolSettingsOpen(true)}
              onOpenCustomMatches={onOpenCustomMatches}
              onClearPoolClick={() => setIsClearPoolOpen(true)}
              onDataChanged={onReloadLibrary}
              onNotify={onNotify}
            />
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div
        className="reading-layout relative w-full px-4 sm:px-8 pt-8 pb-16 flex-1"
      >
        {/* Left Column: Reading Text */}
        <main
          className="reading-column w-full max-w-[700px] mx-auto transition-[padding] duration-150"
          style={{ paddingBottom: readingAreaPaddingBottom }}
        >
          {/* Article Header */}
          <div className="mb-8" onClick={(e) => e.stopPropagation()}>
            <h1 className="font-serif text-3xl sm:text-4xl font-bold text-white tracking-tight">
              {currentArticle.title}
            </h1>

            {/* Meta line: level · pool words · Section 7.5 Eşleşmeler */}
            <div className="flex items-center gap-2 mt-2 flex-wrap text-sm text-slate-400">
              {currentArticle.level && (
                <>
                  <span className="font-medium text-slate-300">{currentArticle.level}</span>
                  <span className="text-slate-600">·</span>
                </>
              )}
              <span>
                {poolMatchesInText > 0
                  ? `${poolMatchesInText} havuz kelimesi`
                  : `${activePoolHeadwordsCount} havuz kelimesi aktif`}
              </span>
              {poolMatchesInText > 0 && (
                <>
                  <span className="text-slate-600">·</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsMatchesModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1 text-slate-400 hover:text-white underline-offset-4 hover:underline transition-colors cursor-pointer"
                    title="Metindeki eşleşen kuralları ve kartları göster"
                  >
                    <ListFilter className="w-3.5 h-3.5" />
                    <span>Eşleşmeler</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Reading Article */}
          <article onClick={(e) => e.stopPropagation()}>
            {parsedParagraphs.map((paraSentences, pIdx) => (
              <p
                key={`paragraph-${pIdx}`}
                className="reading-paragraph text-slate-200 mb-[1.2em] last:mb-0 indent-0"
              >
                {paraSentences.map(({ sentence, sentenceIndex, tokens }) => {
                  const isSentenceActive = Boolean(activeSentence && activeSentenceIndex === sentenceIndex);

                  // Group tokens into single tokens and multi-word phrase units
                  const renderUnits: Array<
                    | { type: 'single'; token: WordToken }
                    | { type: 'phrase'; phraseMatch: PhraseMatch; tokens: WordToken[] }
                  > = [];

                  let tIdx = 0;
                  while (tIdx < tokens.length) {
                    const currentToken = tokens[tIdx];
                    if (
                      currentToken.phraseMatch &&
                      currentToken.phraseMatch.startIndex === currentToken.wordIndex
                    ) {
                      const pm = currentToken.phraseMatch;
                      const phraseToks = tokens.slice(pm.startIndex, pm.endIndex + 1);
                      renderUnits.push({
                        type: 'phrase',
                        phraseMatch: pm,
                        tokens: phraseToks,
                      });
                      tIdx = pm.endIndex + 1;
                    } else {
                      renderUnits.push({
                        type: 'single',
                        token: currentToken,
                      });
                      tIdx++;
                    }
                  }

                  return (
                    <span
                      key={sentence.id}
                      id={`sentence-item-${sentenceIndex}`}
                      className={`inline ${isSentenceActive ? 'sentence-highlight text-white' : ''}`}
                    >
                      {renderUnits.map((unit) => {
                        if (unit.type === 'phrase') {
                          const { phraseMatch, tokens: phraseTokens } = unit;
                          const isPhraseSelected = selectedPhraseId === phraseMatch.id;
                          const firstToken = phraseTokens[0];
                          const lastToken = phraseTokens[phraseTokens.length - 1];

                          const phraseCoreClass = isPhraseSelected
                            ? `${getPoolWordBaseClass()} word-pill-selected`
                            : getPoolWordBaseClass();

                          return (
                            <React.Fragment key={phraseMatch.id}>
                              {firstToken.leading && <span>{firstToken.leading}</span>}
                              <span
                                id={phraseMatch.id}
                                role="button"
                                tabIndex={0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePhraseClick(phraseMatch);
                                }}
                                className="cursor-pointer select-none inline"
                              >
                                <span className={phraseCoreClass}>
                                  {phraseTokens.map((t, idx) => (
                                    <React.Fragment key={t.id}>
                                      {idx > 0 && ' '}
                                      <span>{t.coreWord}</span>
                                    </React.Fragment>
                                  ))}
                                </span>
                              </span>
                              {lastToken.trailing && <span>{lastToken.trailing}</span>}
                              {' '}
                            </React.Fragment>
                          );
                        }

                        const token = unit.token;
                        const isSelected = selectedWordId === token.id;
                        const isPool = Boolean(token.match && token.notes.length > 0);

                        let wordClasses = 'text-slate-200';
                        if (isPool) {
                          wordClasses = isSelected
                            ? `${getPoolWordBaseClass()} word-pill-selected`
                            : getPoolWordBaseClass();
                        }

                        return (
                          <React.Fragment key={token.id}>
                            <span
                              id={token.id}
                              role="button"
                              tabIndex={0}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleWordClick(token);
                              }}
                              className="cursor-pointer select-none inline"
                            >
                              {token.leading && <span>{token.leading}</span>}
                              <span className={wordClasses}>{token.coreWord}</span>
                              {token.trailing && <span>{token.trailing}</span>}
                            </span>
                            {' '}
                          </React.Fragment>
                        );
                      })}
                    </span>
                  );
                })}
              </p>
            ))}
          </article>
        </main>

        {/* Option A: "Yan sütun (sabit)" (DEFAULT) */}
        {!isFloatingMode && (
          <aside
            className="reading-side hidden min-[1100px]:block"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-20">
            {activeWordNotes && activeWordNotes.length > 0 && (
              <WordCardSheet
                notes={activeWordNotes}
                onClose={handleDismiss}
                isSidePanel={true}
                className="max-h-[calc(100vh-6rem)]"
              />
            )}
            {activeSentence && (
              <SentenceSheet
                sentence={activeSentence}
                onClose={handleDismiss}
                isSidePanel={true}
                className="max-h-[calc(100vh-6rem)]"
              />
            )}
            </div>
          </aside>
        )}
      </div>

      {/* Option B: "Kelimenin yanında" - Floating card anchored below/above tapped word (>= 1100px) */}
      {isFloatingMode && isAnyPanelOpen && floatingPos && (
        <div
          ref={desktopCardRef}
          className="hidden min-[1100px]:block animate-fadeIn"
          style={{
            position: 'fixed',
            left: `${floatingPos.left}px`,
            top: `${floatingPos.top}px`,
            width: `${floatingPos.width}px`,
            maxHeight: '60vh',
            zIndex: 50,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {activeWordNotes && activeWordNotes.length > 0 && (
            <WordCardSheet
              notes={activeWordNotes}
              onClose={handleDismiss}
              isSidePanel={true}
              className="max-h-[60vh] overflow-y-auto"
              arrow={{ left: floatingPos.arrowLeft, placement: floatingPos.placement }}
            />
          )}
          {activeSentence && (
            <SentenceSheet
              sentence={activeSentence}
              onClose={handleDismiss}
              isSidePanel={true}
              className="max-h-[60vh] overflow-y-auto"
              arrow={{ left: floatingPos.arrowLeft, placement: floatingPos.placement }}
            />
          )}
        </div>
      )}

      {/* Narrow Screen (< 1100px): Bottom Sheet rendered at root level */}
      <div className="min-[1100px]:hidden">
        {activeWordNotes && activeWordNotes.length > 0 && (
          <WordCardSheet
            notes={activeWordNotes}
            onClose={handleDismiss}
            isSidePanel={false}
          />
        )}

        {activeSentence && (
          <SentenceSheet
            sentence={activeSentence}
            onClose={handleDismiss}
            isSidePanel={false}
          />
        )}
      </div>

      {/* Matches Report Modal (Section 7.5) */}
      <MatchesModal
        isOpen={isMatchesModalOpen}
        onClose={() => setIsMatchesModalOpen(false)}
        tokens={allTokens}
        phraseMatches={allPhraseMatches}
        onSelectNotes={(notes) => {
          setActiveWordNotes(notes);
          setActiveSentence(null);
        }}
      />

      {/* Pool Settings Modal */}
      <PoolSettingsModal
        isOpen={isPoolSettingsOpen}
        onClose={() => setIsPoolSettingsOpen(false)}
        onNotify={onNotify}
        onPoolChanged={() => {
          setPoolRevision((r) => r + 1);
          onReloadLibrary?.();
        }}
      />

      {/* Clear Pool Modal (Ayarlar > Kelime Havuzu > Havuzu temizle) */}
      <ClearPoolModal
        isOpen={isClearPoolOpen}
        notesCount={poolStore.getAllNotes().length}
        onClose={() => setIsClearPoolOpen(false)}
        onConfirm={async (resetSettings) => {
          await poolStore.clearPool(resetSettings);
          onNotify?.('Kelime havuzu temizlendi.', 'success');
          setPoolRevision((r) => r + 1);
          onReloadLibrary?.();
        }}
      />
    </div>
  );
};
