/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef } from 'react';
import {
  X,
  Upload,
  Search,
  FolderTree,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Check,
  Minus,
  BookOpen,
  Loader2,
  Trash2,
  HelpCircle,
  ArrowLeft,
  Sparkles,
  Volume2,
  FileArchive,
  CheckCircle2,
  Copy,
  Layers,
} from 'lucide-react';
import { PoolNote, PoolSettings, ImportSummary, DeckTreeNode, RenameCandidate } from '../types/pool';
import { MediaStorageSummary, MediaImportStats, ApkgImportProgress } from '../types/media';
import { poolStore } from '../store/poolStore';
import { mediaStore } from '../store/mediaStore';
import { parseAnkiPlainText, stripHtmlAndSound, cleanAndClassifyHeadword, extractRawHeadword } from '../utils/ankiParser';
import { parsePhraseHeading } from '../utils/phraseMatcher';
import { importApkgMedia } from '../utils/apkgParser';
import { buildDeckTree, getNodeCheckState, toggleNodeDecks, isDeckDisabledByDefault, isDeckOrAncestorDisabled } from '../utils/deckTree';
import { WordCardSheet } from './WordCardSheet';
import { ClearPoolModal } from './ClearPoolModal';
import { AnkiExportGuideModal } from './AnkiExportGuideModal';
import { DeleteMediaModal } from './DeleteMediaModal';

interface PoolSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNotify?: (message: string, type?: 'success' | 'error' | 'info') => void;
  onPoolChanged?: () => void;
}

interface PreviewState {
  fileName: string;
  parsedNotes: PoolNote[];
  allDecksInFile: string[];
  topLevelDecks: string[];
  fileDeckCounts: Map<string, number>;
  // Selections
  selectedRootDeck: string;
  isFirstRootSelection: boolean;
  // Disabled decks in preview
  disabledDecks: Set<string>;
  newDecksSet: Set<string>;
  // Rename detection candidates
  renameCandidates: RenameCandidate[];
  renameAnswers: Record<string, boolean>; // key: `${oldDeck}:::${newDeck}`
}

function findRenameCandidates(
  existingNotes: PoolNote[],
  incomingNotes: PoolNote[]
): RenameCandidate[] {
  const existingDeckGuids = new Map<string, Set<string>>();
  for (const n of existingNotes) {
    if (!existingDeckGuids.has(n.deck)) {
      existingDeckGuids.set(n.deck, new Set());
    }
    existingDeckGuids.get(n.deck)!.add(n.guid);
  }

  const incomingDeckGuids = new Map<string, Set<string>>();
  for (const n of incomingNotes) {
    if (!incomingDeckGuids.has(n.deck)) {
      incomingDeckGuids.set(n.deck, new Set());
    }
    incomingDeckGuids.get(n.deck)!.add(n.guid);
  }

  const disappearedDecks = Array.from(existingDeckGuids.keys()).filter(
    (deck) => !incomingDeckGuids.has(deck)
  );
  const newDecksInFile = Array.from(incomingDeckGuids.keys()).filter(
    (deck) => !existingDeckGuids.has(deck)
  );

  if (disappearedDecks.length === 0 || newDecksInFile.length === 0) {
    return [];
  }

  const candidates: RenameCandidate[] = [];

  for (const oldDeck of disappearedDecks) {
    const oldGuids = existingDeckGuids.get(oldDeck)!;
    if (oldGuids.size === 0) continue;

    for (const newDeck of newDecksInFile) {
      const newGuids = incomingDeckGuids.get(newDeck)!;
      if (newGuids.size === 0) continue;

      let matchCount = 0;
      for (const g of newGuids) {
        if (oldGuids.has(g)) {
          matchCount++;
        }
      }

      const ratio = matchCount / newGuids.size;
      // Requirement 4: at least 80% (ratio >= 0.8)
      if (ratio >= 0.8) {
        candidates.push({
          oldDeck,
          newDeck,
          ratio,
          matchCount,
          totalNew: newGuids.size,
        });
      }
    }
  }

  candidates.sort((a, b) => b.ratio - a.ratio);

  const usedOld = new Set<string>();
  const usedNew = new Set<string>();
  const result: RenameCandidate[] = [];

  for (const cand of candidates) {
    if (!usedOld.has(cand.oldDeck) && !usedNew.has(cand.newDeck)) {
      usedOld.add(cand.oldDeck);
      usedNew.add(cand.newDeck);
      result.push(cand);
    }
  }

  return result;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fallback below
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return Boolean(ok);
  } catch {
    return false;
  }
}

export const PoolSettingsModal: React.FC<PoolSettingsModalProps> = ({
  isOpen,
  onClose,
  onNotify,
  onPoolChanged,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isParsingFile, setIsParsingFile] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [importProgressText, setImportProgressText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);

  // Preview state (Requirement 1)
  const [previewState, setPreviewState] = useState<PreviewState | null>(null);

  // Clear pool confirmation modal state (Requirement 7)
  const [isClearPoolModalOpen, setIsClearPoolModalOpen] = useState(false);
  const [isExportGuideOpen, setIsExportGuideOpen] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [inspectedNotes, setInspectedNotes] = useState<PoolNote[] | null>(null);

  // Expand / collapse map for deck tree
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});

  // Collapsible sections
  const [showSuspiciousList, setShowSuspiciousList] = useState(false);
  const [showPhraseList, setShowPhraseList] = useState(false);
  const [showSkippedPhraseList, setShowSkippedPhraseList] = useState(false);
  const [isCopiedSuspicious, setIsCopiedSuspicious] = useState(false);
  const [isCopiedSkipped, setIsCopiedSkipped] = useState(false);
  const [confirmDeleteMissing, setConfirmDeleteMissing] = useState(false);

  // Phase 3: Media import & storage states
  const apkgFileInputRef = useRef<HTMLInputElement>(null);
  const apkgAbortControllerRef = useRef<AbortController | null>(null);
  const [mediaSummary, setMediaSummary] = useState<MediaStorageSummary | null>(null);
  const [isImportingApkg, setIsImportingApkg] = useState(false);
  const [apkgProgress, setApkgProgress] = useState<ApkgImportProgress | null>(null);
  const [apkgResultReport, setApkgResultReport] = useState<MediaImportStats | null>(null);
  const [showMissingMediaList, setShowMissingMediaList] = useState(false);
  const [isDeleteMediaModalOpen, setIsDeleteMediaModalOpen] = useState(false);

  // Force re-render trigger on poolStore updates
  const [, setTick] = useState(0);
  const forceUpdate = () => setTick((t) => t + 1);

  // Fetch current poolStore data unconditionally for hooks
  const settings: PoolSettings = poolStore.getSettings();
  const allNotes: PoolNote[] = poolStore.getAllNotes();

  // Search results memoized unconditionally before any early return
  const searchResults = useMemo(() => {
    if (!isOpen) return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];

    return allNotes
      .filter((n) => {
        return (
          n.headwords.some((hw) => hw.toLowerCase().includes(q)) ||
          n.front.toLowerCase().includes(q) ||
          n.back.toLowerCase().includes(q)
        );
      })
      .slice(0, 30);
  }, [allNotes, searchQuery, isOpen]);

  // Compute live preview summary unconditionally
  const previewSummary = useMemo(() => {
    if (!previewState) return null;
    const effectiveRoot = previewState.selectedRootDeck;

    const acceptedRenameMap = new Map<string, string>();
    previewState.renameCandidates.forEach((c) => {
      const key = `${c.oldDeck}:::${c.newDeck}`;
      if (previewState.renameAnswers[key]) {
        acceptedRenameMap.set(c.oldDeck, c.newDeck);
      }
    });

    const notesToSave = previewState.parsedNotes.filter((n) => {
      return n.deck === effectiveRoot || n.deck.startsWith(`${effectiveRoot}::`);
    });

    const existingMap = new Map<string, PoolNote>();
    for (const n of allNotes) {
      existingMap.set(n.guid, n);
    }

    let newCount = 0;
    let updatedCount = 0;
    let unchangedCount = 0;

    for (const note of notesToSave) {
      const existing = existingMap.get(note.guid);
      if (!existing) {
        newCount++;
      } else {
        let existingDeck = existing.deck;
        if (acceptedRenameMap.has(existingDeck)) {
          existingDeck = acceptedRenameMap.get(existingDeck)!;
        }

        const isIdentical =
          existing.front === note.front &&
          existing.back === note.back &&
          existing.hint === note.hint &&
          existingDeck === note.deck &&
          existing.tags === note.tags &&
          existing.notetype === note.notetype;

        if (isIdentical) {
          unchangedCount++;
        } else {
          updatedCount++;
        }
      }
    }

    return {
      newCount,
      updatedCount,
      unchangedCount,
      notesToSaveCount: notesToSave.length,
      excludedCount: previewState.parsedNotes.length - notesToSave.length,
    };
  }, [previewState, allNotes]);

  // Preview deck tree unconditionally
  const previewDeckTree = useMemo(() => {
    if (!previewState) return [];
    return buildDeckTree(
      previewState.parsedNotes,
      previewState.newDecksSet,
      previewState.selectedRootDeck
    );
  }, [previewState]);

  const disabledDecksSet = useMemo(() => new Set(settings.disabledDecks), [settings.disabledDecks]);
  const missingNotesCount = allNotes.filter((n) => n.missingFromLastImport).length;
  const lastStats = settings.lastImportStats;

  // Requirement 5: Big number is active pool words (non-phrase notes in open/enabled decks)
  const activePoolNotesCount = useMemo(() => {
    return allNotes.filter(
      (n) => !isDeckOrAncestorDisabled(n.deck, disabledDecksSet) && !n.phrase
    ).length;
  }, [allNotes, disabledDecksSet]);

  const activePhraseNotesCount = poolStore.getActivePhraseNotesCount();

  // Build deck tree for main screen
  const mainTreeSource = (settings.fileDecksSummary && settings.fileDecksSummary.length > 0)
    ? settings.fileDecksSummary
    : allNotes;
  const newDecksSet = new Set(settings.newDecks || []);
  const mainDeckTree: DeckTreeNode[] = buildDeckTree(
    mainTreeSource,
    newDecksSet,
    settings.englishRootDeck || '**İngilizce kelimeler'
  );

  // 1. Şüpheli Başlıklar: notes from ENABLED decks where NO headword could be extracted and which are not phrases
  const resolvedSuspiciousList = useMemo(() => {
    if (allNotes.length > 0) {
      return allNotes
        .filter((note) => {
          if (isDeckOrAncestorDisabled(note.deck, disabledDecksSet)) return false;
          if (note.phrase) return false;
          const hasHw = note.headwords && note.headwords.length > 0 && Boolean(note.headwords[0]?.trim());
          return note.suspicious || !hasHw;
        })
        .map((note) => {
          const frontPlain = stripHtmlAndSound(note.front);
          const backPlain = stripHtmlAndSound(note.back);
          const englishSide = note.englishSide || 'on';
          const englishPlain = englishSide === 'on' ? frontPlain : backPlain;
          const otherPlain = englishSide === 'on' ? backPlain : frontPlain;

          let reasons = (note.suspiciousReasons || []).filter(
            (r) => !/IPA|ses etiketi|sound/i.test(r) && !/Kalıp/i.test(r)
          );
          if (reasons.length === 0) {
            reasons = ['Başlık bulunamadı (ilk satır boş veya liste)'];
          }

          return {
            guid: note.guid,
            deck: note.deck,
            headwords: note.headwords || [],
            reasons,
            englishSide,
            englishPreview: englishPlain.slice(0, 80),
            otherPreview: otherPlain.slice(0, 60),
            frontPreview: frontPlain.slice(0, 80),
            backPreview: backPlain.slice(0, 60),
            note,
          };
        });
    }

    if (!lastStats?.suspiciousList || lastStats.suspiciousList.length === 0) return [];
    return lastStats.suspiciousList
      .filter((item) => {
        if (isDeckOrAncestorDisabled(item.deck, disabledDecksSet)) return false;
        if (item.phrase) return false;
        const hasHw = item.headwords && item.headwords.length > 0 && Boolean(item.headwords[0]?.trim());
        return !hasHw;
      })
      .map((item) => {
        let reasons = (item.reasons || [item.reason || 'Başlık bulunamadı (ilk satır boş veya liste)']).filter(
          (r) => !/IPA|ses etiketi|sound/i.test(r) && !/Kalıp/i.test(r)
        );
        if (reasons.length === 0) {
          reasons = ['Başlık bulunamadı (ilk satır boş veya liste)'];
        }
        return {
          guid: item.guid,
          deck: item.deck,
          headwords: item.headwords || [],
          reasons,
          englishSide: item.englishSide || 'on',
          englishPreview: (item.englishPreview || item.frontPreview || '').slice(0, 80),
          otherPreview: (item.otherPreview || item.backPreview || '').slice(0, 60),
          frontPreview: (item.frontPreview || '').slice(0, 80),
          backPreview: (item.backPreview || '').slice(0, 60),
          note: undefined,
        };
      });
  }, [allNotes, disabledDecksSet, lastStats?.suspiciousList]);

  // 2. Kalıplar (bilgi): Multi-word phrase notes from ENABLED decks with active/skipped status
  const resolvedPhraseList = useMemo(() => {
    if (allNotes.length > 0) {
      return allNotes
        .filter((note) => {
          if (isDeckOrAncestorDisabled(note.deck, disabledDecksSet)) return false;
          const rawHw = (note.headwords && note.headwords.length > 0 ? note.headwords[0] : '') || '';
          return Boolean(note.phrase || (rawHw && /\s/.test(rawHw.trim())));
        })
        .map((note) => {
          const frontPlain = stripHtmlAndSound(note.front);
          const backPlain = stripHtmlAndSound(note.back);
          const englishSide = note.englishSide || 'on';
          const englishPlain = englishSide === 'on' ? frontPlain : backPlain;
          const otherPlain = englishSide === 'on' ? backPlain : frontPlain;
          const rawHw = (note.headwords && note.headwords.length > 0 ? note.headwords[0] : '') || '';

          const parseRes = parsePhraseHeading(rawHw);
          const isActive = parseRes.valid && Boolean(parseRes.patterns && parseRes.patterns.length > 0);

          return {
            guid: note.guid,
            deck: note.deck,
            headwords: note.headwords || [],
            reasons: isActive ? ['Aktif kalıp'] : [parseRes.reason || 'Kalıp olarak işlenemedi'],
            englishSide,
            englishPreview: englishPlain.slice(0, 80),
            otherPreview: otherPlain.slice(0, 60),
            frontPreview: frontPlain.slice(0, 80),
            backPreview: backPlain.slice(0, 60),
            isActive,
            skipReason: !isActive ? (parseRes.reason || 'Kalıp olarak işlenemedi') : undefined,
            note,
          };
        });
    }

    if (!lastStats?.suspiciousList || lastStats.suspiciousList.length === 0) return [];
    return lastStats.suspiciousList
      .filter((item) => {
        if (isDeckOrAncestorDisabled(item.deck, disabledDecksSet)) return false;
        return Boolean(item.phrase);
      })
      .map((item) => {
        const rawHw = (item.headwords && item.headwords.length > 0 ? item.headwords[0] : '') || '';
        const parseRes = parsePhraseHeading(rawHw);
        const isActive = parseRes.valid && Boolean(parseRes.patterns && parseRes.patterns.length > 0);

        return {
          guid: item.guid,
          deck: item.deck,
          headwords: item.headwords || [],
          reasons: isActive ? ['Aktif kalıp'] : [parseRes.reason || 'Kalıp olarak işlenemedi'],
          englishSide: item.englishSide || 'on',
          englishPreview: (item.englishPreview || item.frontPreview || '').slice(0, 80),
          otherPreview: (item.otherPreview || item.backPreview || '').slice(0, 60),
          frontPreview: (item.frontPreview || '').slice(0, 80),
          backPreview: (item.backPreview || '').slice(0, 60),
          isActive,
          skipReason: !isActive ? (parseRes.reason || 'Kalıp olarak işlenemedi') : undefined,
          note: undefined,
        };
      });
  }, [allNotes, disabledDecksSet, lastStats?.suspiciousList]);

  // 3. Kalıp olarak işlenemedi (Skipped Phrases only)
  const resolvedSkippedPhraseList = useMemo(() => {
    return resolvedPhraseList.filter((item) => !item.isActive);
  }, [resolvedPhraseList]);

  const sortedSkippedPhraseList = useMemo(() => {
    return [...resolvedSkippedPhraseList].sort((a, b) => {
      const hwA = a.headwords[0] || '';
      const hwB = b.headwords[0] || '';
      return hwA.localeCompare(hwB, 'tr');
    });
  }, [resolvedSkippedPhraseList]);

  const sortedSuspiciousList = useMemo(() => {
    return [...resolvedSuspiciousList].sort((a, b) => {
      const reasonA = a.reasons.join(', ');
      const reasonB = b.reasons.join(', ');
      const cmpReason = reasonA.localeCompare(reasonB, 'tr');
      if (cmpReason !== 0) return cmpReason;
      const hwA = a.headwords[0] || '';
      const hwB = b.headwords[0] || '';
      return hwA.localeCompare(hwB, 'tr');
    });
  }, [resolvedSuspiciousList]);

  const sortedPhraseList = useMemo(() => {
    return [...resolvedPhraseList].sort((a, b) => {
      const hwA = a.headwords[0] || '';
      const hwB = b.headwords[0] || '';
      return hwA.localeCompare(hwB, 'tr');
    });
  }, [resolvedPhraseList]);

  const handleCopySuspiciousList = async () => {
    if (sortedSuspiciousList.length === 0) return;

    const lines = sortedSuspiciousList.map((item) => {
      const reasonsStr = item.reasons.join(', ');
      const hwStr = item.headwords.join(', ') || '(Yok)';
      return `${item.guid} | ${item.deck} | ${reasonsStr} | ${hwStr} | ${item.frontPreview} | ${item.backPreview}`;
    });

    const fullText = lines.join('\n');
    const ok = await copyToClipboard(fullText);
    if (ok) {
      setIsCopiedSuspicious(true);
      setTimeout(() => setIsCopiedSuspicious(false), 2500);
      onNotify?.('Kopyalandı', 'success');
    } else {
      onNotify?.('Kopyalama başarısız oldu.', 'error');
    }
  };

  const handleCopySkippedPhraseList = async () => {
    if (sortedSkippedPhraseList.length === 0) return;
    const lines = sortedSkippedPhraseList.map((item, idx) => {
      const parts = [
        `${idx + 1}. [${item.skipReason}] Başlık: ${item.headwords.join(', ') || '(Yok)'}`,
        `   Deste: ${item.deck}`,
        `   guid: ${item.guid}`,
      ];
      if (item.englishPreview) parts.push(`   İngilizce: ${item.englishPreview}`);
      if (item.otherPreview) parts.push(`   Diğer: ${item.otherPreview}`);
      return parts.join('\n');
    });

    const textToCopy =
      `KALIP OLARAK İŞLENEMEYENLER (${sortedSkippedPhraseList.length} Not):\n\n` + lines.join('\n\n');
    const ok = await copyToClipboard(textToCopy);
    if (ok) {
      setIsCopiedSkipped(true);
      setTimeout(() => setIsCopiedSkipped(false), 2500);
      onNotify?.(`${sortedSkippedPhraseList.length} işlenemeyen kalıp panoya kopyalandı.`, 'success');
    } else {
      onNotify?.('Kopyalama başarısız oldu.', 'error');
    }
  };

  // 1. File Selected -> Parse and create Preview (Requirement 1, 2, 4)
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsParsingFile(true);
      setImportError(null);
      setImportProgressText('Dosya okunuyor...');

      const content = await file.text();
      setImportProgressText('Anki notları ayrıştırılıyor...');
      await new Promise((r) => setTimeout(r, 40));

      const parsed = await parseAnkiPlainText(content);

      // Collect deck counts and top level decks
      const deckCounts = new Map<string, number>();
      for (const n of parsed.notes) {
        deckCounts.set(n.deck, (deckCounts.get(n.deck) || 0) + 1);
      }

      const topLevelSet = new Set<string>();
      for (const d of parsed.allDecksInFile) {
        const top = d.split('::')[0].trim();
        if (top) topLevelSet.add(top);
      }
      const topLevelDecks = Array.from(topLevelSet).sort((a, b) => a.localeCompare(b, 'tr'));

      // Check rename candidates (Requirement 4)
      const renameCandidates = findRenameCandidates(allNotes, parsed.notes);
      const renameAnswers: Record<string, boolean> = {};
      renameCandidates.forEach((c) => {
        renameAnswers[`${c.oldDeck}:::${c.newDeck}`] = true; // default to true (suggest rename)
      });

      // English Root Deck (Requirement 2)
      let selectedRootDeck = settings.englishRootDeck || '';
      let isFirstRootSelection = !settings.englishRootDeck;

      // If root was saved previously, check if it was renamed
      if (settings.englishRootDeck) {
        const rootRename = renameCandidates.find((c) => c.oldDeck === settings.englishRootDeck);
        if (rootRename) {
          selectedRootDeck = rootRename.newDeck;
        } else if (!topLevelDecks.includes(settings.englishRootDeck) && !parsed.allDecksInFile.some((d) => d === settings.englishRootDeck || d.startsWith(`${settings.englishRootDeck}::`))) {
          // Saved root is no longer found and not renamed
          isFirstRootSelection = true;
          selectedRootDeck = '';
        }
      }

      if (!selectedRootDeck) {
        const defaultRoot = topLevelDecks.find((d) => d === '**İngilizce kelimeler' || d.startsWith('**İngilizce kelimeler')) || topLevelDecks[0] || '';
        selectedRootDeck = defaultRoot;
      }

      // Compute initial disabled decks for preview
      const previewDisabled = new Set<string>();
      const existingKnown = new Set(settings.knownDecks);
      const existingDisabled = new Set(settings.disabledDecks);
      const previewNewDecks = new Set<string>();

      for (const deckPath of parsed.allDecksInFile) {
        // Ancestors and full paths
        const parts = deckPath.split('::').map((p) => p.trim()).filter(Boolean);
        let acc = '';
        for (const part of parts) {
          acc = acc ? `${acc}::${part}` : part;
          if (existingKnown.has(acc)) {
            if (existingDisabled.has(acc)) {
              previewDisabled.add(acc);
            }
          } else {
            // Check if renamed from old deck
            const matchRename = renameCandidates.find((c) => c.newDeck === acc);
            if (matchRename && existingKnown.has(matchRename.oldDeck)) {
              if (existingDisabled.has(matchRename.oldDeck)) {
                previewDisabled.add(acc);
              }
            } else {
              previewNewDecks.add(acc);
              // Decks under selected English root deck start enabled by default
              if (isDeckDisabledByDefault(acc, selectedRootDeck)) {
                previewDisabled.add(acc);
              }
            }
          }
        }
      }

      // Automatically expand top root in preview
      setExpandedNodes((prev) => ({
        ...prev,
        [selectedRootDeck]: true,
      }));

      setPreviewState({
        fileName: file.name,
        parsedNotes: parsed.notes,
        allDecksInFile: parsed.allDecksInFile,
        topLevelDecks,
        fileDeckCounts: deckCounts,
        selectedRootDeck,
        isFirstRootSelection,
        disabledDecks: previewDisabled,
        newDecksSet: previewNewDecks,
        renameCandidates,
        renameAnswers,
      });
    } catch (err: any) {
      console.error('Anki import failed:', err);
      const errMsg = err?.message || 'Dosya içe aktarılırken bir hata oluştu.';
      setImportError(errMsg);
      onNotify?.(errMsg, 'error');
    } finally {
      setIsParsingFile(false);
      setImportProgressText('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Toggle rename answer (Evet / Hayır)
  const handleToggleRenameAnswer = (key: string, value: boolean) => {
    if (!previewState) return;
    const [oldDeck, newDeck] = key.split(':::');
    const newAnswers = { ...previewState.renameAnswers, [key]: value };

    // Update effective root deck if oldDeck was root deck
    let newRoot = previewState.selectedRootDeck;
    if (value && previewState.selectedRootDeck === oldDeck) {
      newRoot = newDeck;
    } else if (!value && previewState.selectedRootDeck === newDeck) {
      // Revert to default root
      newRoot = previewState.topLevelDecks.find((d) => d.includes('İngilizce')) || previewState.topLevelDecks[0] || '';
    }

    // Update disabled status for newDeck
    const newDisabled = new Set(previewState.disabledDecks);
    const newNewDecks = new Set(previewState.newDecksSet);
    if (value) {
      // Inherit old deck status
      newNewDecks.delete(newDeck);
      if (settings.disabledDecks.includes(oldDeck)) {
        newDisabled.add(newDeck);
      } else {
        newDisabled.delete(newDeck);
      }
    } else {
      newNewDecks.add(newDeck);
      if (isDeckDisabledByDefault(newDeck, newRoot)) {
        newDisabled.add(newDeck);
      } else {
        newDisabled.delete(newDeck);
      }
    }

    setPreviewState({
      ...previewState,
      renameAnswers: newAnswers,
      selectedRootDeck: newRoot,
      disabledDecks: newDisabled,
      newDecksSet: newNewDecks,
    });
  };

  // Toggle deck in preview tree
  const handleTogglePreviewDeck = (node: DeckTreeNode) => {
    if (!previewState) return;
    const newDisabledArray = toggleNodeDecks(node, Array.from(previewState.disabledDecks));
    setPreviewState({
      ...previewState,
      disabledDecks: new Set(newDisabledArray),
    });
  };

  // Toggle deck on main screen
  const handleToggleMainDeck = async (node: DeckTreeNode) => {
    const newDisabled = toggleNodeDecks(node, settings.disabledDecks);
    await poolStore.saveSettings({ disabledDecks: newDisabled });
    onPoolChanged?.();
    forceUpdate();
  };

  const handleToggleExpand = (path: string) => {
    setExpandedNodes((prev) => ({
      ...prev,
      [path]: !prev[path],
    }));
  };

  // Execute Save to Database (Requirement 1 "Havuza aktar")
  const handleCommitPreview = async () => {
    if (!previewState) return;

    try {
      setIsCommitting(true);
      const effectiveRoot = previewState.selectedRootDeck;

      // Accepted renames
      const acceptedRenames: Array<{ oldDeck: string; newDeck: string }> = [];
      previewState.renameCandidates.forEach((c) => {
        const key = `${c.oldDeck}:::${c.newDeck}`;
        if (previewState.renameAnswers[key]) {
          acceptedRenames.push({ oldDeck: c.oldDeck, newDeck: c.newDeck });
        }
      });

      // Requirement 3: Only save notes belonging to the selected English root deck and its subdecks
      const notesToSave = previewState.parsedNotes.filter((n) => {
        return n.deck === effectiveRoot || n.deck.startsWith(`${effectiveRoot}::`);
      });

      const fileDecksSummary = Array.from(previewState.fileDeckCounts.entries()).map(
        ([path, noteCount]) => ({ path, noteCount })
      );

      const summary = await poolStore.commitImport({
        notesToSave,
        allDecksInFile: previewState.allDecksInFile,
        fileDecksSummary,
        englishRootDeck: effectiveRoot,
        disabledDecks: Array.from(previewState.disabledDecks),
        newDecksList: Array.from(previewState.newDecksSet),
        renamedDecks: acceptedRenames,
      });

      const msg = `${summary.newCount} yeni eklendi, ${summary.updatedCount} güncellendi, ${summary.unchangedCount} değişmedi.`;
      onNotify?.(msg, 'success');
      setPreviewState(null);
      onPoolChanged?.();
      forceUpdate();
    } catch (err: any) {
      console.error('Commit import error:', err);
      onNotify?.(err?.message || 'Havuza aktarılırken hata oluştu.', 'error');
    } finally {
      setIsCommitting(false);
    }
  };

  // Cancel Preview (Requirement 1 "İptal")
  const handleCancelPreview = () => {
    setPreviewState(null);
    setImportError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Delete missing notes handler
  const handleDeleteMissingNotes = async () => {
    try {
      const deletedCount = await poolStore.removeMissingNotes();
      onNotify?.(`${deletedCount} adet eksik not veritabanından kaldırıldı.`, 'success');
      setConfirmDeleteMissing(false);
      onPoolChanged?.();
      forceUpdate();
    } catch (err: any) {
      onNotify?.(err?.message || 'Notlar silinirken hata oluştu.', 'error');
    }
  };

  // Clear pool handler (Requirement 7)
  const handleClearPoolConfirm = async (resetSettings: boolean) => {
    try {
      await poolStore.clearPool(resetSettings);
      onNotify?.('Kelime havuzu temizlendi.', 'success');
      onPoolChanged?.();
      forceUpdate();
    } catch (err: any) {
      onNotify?.(err?.message || 'Havuz temizlenirken hata oluştu.', 'error');
    }
  };

  // Media summary refresh and subscription (Phase 3)
  const refreshMediaSummary = React.useCallback(async () => {
    try {
      const summary = await mediaStore.getStorageSummary();
      setMediaSummary(summary);
    } catch (err) {
      console.warn('Failed to load media storage summary:', err);
    }
  }, []);

  React.useEffect(() => {
    if (isOpen) {
      refreshMediaSummary();
    }
    const unsub = mediaStore.subscribe(() => {
      refreshMediaSummary();
    });
    return () => unsub();
  }, [isOpen, refreshMediaSummary]);

  // Handle .apkg file import (Phase 3)
  const handleApkgFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ''; // Reset input to allow selecting same file again

    if (allNotes.length === 0) {
      onNotify?.('Önce All_Decks.txt ile havuzu yükleyin.', 'error');
      return;
    }

    const abortController = new AbortController();
    apkgAbortControllerRef.current = abortController;
    setIsImportingApkg(true);
    setApkgResultReport(null);

    try {
      const result = await importApkgMedia({
        file,
        allNotes,
        abortSignal: abortController.signal,
        onProgress: (p) => {
          setApkgProgress(p);
        },
      });

      setMediaSummary(result.storage);
      setApkgResultReport(result.stats);

      if (result.cancelled) {
        onNotify?.(
          `İçe aktarma iptal edildi. ${result.stats.addedCount} medya dosyası kaydedildi.`,
          'info'
        );
      } else {
        const msg = `${result.stats.addedCount} dosya eklendi, ${result.stats.alreadyExistedCount} zaten vardı.`;
        onNotify?.(msg, 'success');
      }
    } catch (err: any) {
      console.error('Apkg media import error:', err);
      onNotify?.(err?.message || 'Medya dosyası içe aktarılırken hata oluştu.', 'error');
    } finally {
      setIsImportingApkg(false);
      setApkgProgress(null);
      apkgAbortControllerRef.current = null;
    }
  };

  const handleCancelApkgImport = () => {
    if (apkgAbortControllerRef.current) {
      apkgAbortControllerRef.current.abort();
    }
  };

  // Delete all media handler (Phase 3)
  const handleDeleteMediaConfirm = async () => {
    try {
      await mediaStore.clearAllMedia();
      await refreshMediaSummary();
      setApkgResultReport(null);
      onNotify?.('Tüm medya dosyaları başarıyla silindi.', 'success');
    } catch (err: any) {
      console.error('Delete media error:', err);
      onNotify?.(err?.message || 'Medya dosyaları silinirken bir hata oluştu.', 'error');
    }
  };

  // Recursive deck tree item renderer
  const renderTreeItem = (
    node: DeckTreeNode,
    depth: number = 0,
    isPreview: boolean = false,
    currentDisabledSet: Set<string> = disabledDecksSet
  ) => {
    const isExpanded = Boolean(expandedNodes[node.path]);
    const checkState = getNodeCheckState(node, currentDisabledSet);
    const hasChildren = node.children && node.children.length > 0;

    const onToggle = () => {
      if (isPreview) {
        handleTogglePreviewDeck(node);
      } else {
        handleToggleMainDeck(node);
      }
    };

    return (
      <div key={node.path} className="select-none">
        <div
          className={`flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-slate-800/60 transition-colors text-xs ${
            depth > 0 ? 'ml-4' : ''
          }`}
        >
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            {hasChildren ? (
              <button
                type="button"
                onClick={() => handleToggleExpand(node.path)}
                className="p-1 rounded text-slate-400 hover:text-white cursor-pointer"
              >
                {isExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )}
              </button>
            ) : (
              <span className="w-5" />
            )}

            {/* Checkbox / Badge (Requirement 3: Outside decks have NO checkbox) */}
            {node.isOutsideRoot ? (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 font-medium shrink-0" title="Kök deste dışı - kaydedilmez">
                Kaydedilmez
              </span>
            ) : (
              <button
                type="button"
                onClick={onToggle}
                className={`w-4 h-4 rounded flex items-center justify-center border transition-colors cursor-pointer shrink-0 ${
                  checkState === 'checked'
                    ? 'bg-emerald-500 border-emerald-500 text-white'
                    : checkState === 'indeterminate'
                    ? 'bg-emerald-500/30 border-emerald-500 text-emerald-300'
                    : 'bg-slate-900 border-slate-600 text-transparent hover:border-slate-500'
                }`}
                aria-label={`${node.name} destesini aç veya kapat`}
              >
                {checkState === 'checked' && <Check className="w-3 h-3 stroke-[3]" />}
                {checkState === 'indeterminate' && <Minus className="w-3 h-3 stroke-[3]" />}
              </button>
            )}

            {/* Name */}
            <span
              onClick={() => (hasChildren ? handleToggleExpand(node.path) : (!node.isOutsideRoot ? onToggle() : undefined))}
              className={`truncate font-medium ${
                node.isOutsideRoot
                  ? 'text-slate-400'
                  : 'text-slate-200 hover:text-white cursor-pointer'
              }`}
            >
              {node.name}
            </span>

            {/* New badge */}
            {node.isNew && (
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shrink-0">
                yeni
              </span>
            )}
          </div>

          {/* Note count */}
          <span className="text-[11px] font-mono text-slate-400 ml-2 shrink-0">
            ({node.noteCount})
          </span>
        </div>

        {/* Children */}
        {hasChildren && isExpanded && (
          <div className="border-l border-slate-800 ml-3.5 pl-1">
            {node.children.map((c) =>
              renderTreeItem(c, depth + 1, isPreview, currentDisabledSet)
            )}
          </div>
        )}
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-[var(--app-surface)] border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-slate-200"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pool-settings-title"
      >
        {/* Hidden file input */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".txt"
          className="hidden"
        />

        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-[var(--app-sunken)]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <FolderTree className="w-4 h-4" />
            </div>
            <div>
              <h2 id="pool-settings-title" className="text-base font-bold text-white leading-tight">
                {previewState ? 'İçe Aktarma Önizlemesi' : 'Kelime Havuzu & Anki'}
              </h2>
              <p className="text-xs text-slate-400">
                {previewState
                  ? `${previewState.fileName} dosyasından ayrıştırılan desteler`
                  : allNotes.length > 0
                  ? `Aktif havuz: ${activePoolNotesCount} kelime, ${activePhraseNotesCount} kalıp (${allNotes.length} kayıtlı not)`
                  : 'Henüz havuz yüklenmedi'}
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

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-6">
          {/* ========================================================= */}
          {/* MODE A: PREVIEW SCREEN (Requirement 1, 2, 3, 4)           */}
          {/* ========================================================= */}
          {previewState ? (
            <div className="space-y-5 animate-fadeIn">
              {/* Requirement 4: Renamed deck detection cards */}
              {previewState.renameCandidates.length > 0 && (
                <div className="space-y-2.5">
                  <div className="text-xs font-semibold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Deste Adı Değişikliği Tespit Edildi</span>
                  </div>

                  {previewState.renameCandidates.map((cand) => {
                    const key = `${cand.oldDeck}:::${cand.newDeck}`;
                    const isYes = previewState.renameAnswers[key] !== false;

                    return (
                      <div
                        key={key}
                        className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-slate-200 space-y-2.5"
                      >
                        <p className="leading-relaxed">
                          <strong className="text-amber-300 font-semibold">"{cand.oldDeck}"</strong> desteyi{' '}
                          <strong className="text-emerald-300 font-semibold">"{cand.newDeck}"</strong> olarak mı yeniden adlandırdın?
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleToggleRenameAnswer(key, true)}
                            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                              isYes
                                ? 'bg-emerald-600 text-white shadow-sm'
                                : 'bg-slate-800 text-slate-300 hover:text-white border border-slate-700'
                            }`}
                          >
                            Evet (ayarları taşı)
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleRenameAnswer(key, false)}
                            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                              !isYes
                                ? 'bg-amber-600 text-white shadow-sm'
                                : 'bg-slate-800 text-slate-300 hover:text-white border border-slate-700'
                            }`}
                          >
                            Hayır (yeni deste say)
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Requirement 2: Root Deck Selection */}
              {previewState.isFirstRootSelection && (
                <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3.5">
                  <div className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Deste Yapılandırması (İlk Yükleme)</span>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Hangi üst deste İngilizce kelimelerdir?
                    </label>
                    <select
                      value={previewState.selectedRootDeck}
                      onChange={(e) => {
                        const val = e.target.value;
                        setPreviewState({
                          ...previewState,
                          selectedRootDeck: val,
                        });
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs sm:text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                    >
                      {previewState.topLevelDecks.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Requirement 1: Summary Banner */}
              {previewSummary && (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/25">
                  <div className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                    Özet
                  </div>
                  <div className="text-base font-bold text-white mt-1">
                    <span className="text-emerald-300">{previewSummary.newCount}</span> yeni,{' '}
                    <span className="text-blue-300">{previewSummary.updatedCount}</span> güncellenecek,{' '}
                    <span className="text-slate-300">{previewSummary.unchangedCount}</span> değişmedi
                  </div>
                  <div className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Seçilen kök destedeki <strong>{previewSummary.notesToSaveCount}</strong> not havuza kaydedilecek.
                    {previewSummary.excludedCount > 0 && (
                      <span> Kök deste dışındaki <strong>{previewSummary.excludedCount}</strong> not kaydedilmeyecek.</span>
                    )}
                  </div>
                </div>
              )}

              {/* Requirement 1: Deck Tree with interactive checkboxes */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Deste Ağacı (Önizleme & Seçim)
                  </div>
                  <span className="text-[11px] text-slate-400">
                    Kutucukları açıp kapatabilirsiniz
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 max-h-64 overflow-y-auto">
                  {previewDeckTree.map((rootNode) =>
                    renderTreeItem(rootNode, 0, true, previewState.disabledDecks)
                  )}
                </div>
              </div>

              {/* Action Buttons in Preview */}
              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between gap-3">
                <button
                  type="button"
                  disabled={isCommitting}
                  onClick={handleCancelPreview}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs sm:text-sm font-medium transition-colors cursor-pointer disabled:opacity-50"
                >
                  İptal
                </button>

                <button
                  type="button"
                  disabled={isCommitting}
                  onClick={handleCommitPreview}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-semibold transition-colors shadow-lg shadow-emerald-950/40 cursor-pointer disabled:opacity-50"
                >
                  {isCommitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Kaydediliyor...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Havuza aktar</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            /* ========================================================= */
            /* MODE B: MAIN VIEW OF POOL MODAL                           */
            /* ========================================================= */
            <div className="space-y-6">
              {/* Requirement 5: Big number Aktif havuz, small line Kalıp: M, secondary Kayıtlı not */}
              <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="text-2xl sm:text-3xl font-extrabold text-emerald-400 tracking-tight">
                    Aktif havuz: {activePoolNotesCount} kelime
                  </div>
                  <div className="text-sm font-medium text-emerald-300/90 mt-0.5">
                    Kalıp: {activePhraseNotesCount}
                  </div>
                  <div className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                    <span className="text-slate-300 font-medium">Kayıtlı not: {allNotes.length}</span>
                    <span className="text-slate-600">•</span>
                    <span>açık destelerdeki aktif kartlar</span>
                  </div>
                </div>

                {allNotes.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setIsClearPoolModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-medium transition-colors cursor-pointer shrink-0 self-start sm:self-auto"
                    title="Havuzu Temizle"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Havuzu temizle</span>
                  </button>
                )}
              </div>

              {/* Import Actions Card */}
              <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800/80">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white flex items-center gap-1.5">
                      <Upload className="w-4 h-4 text-emerald-400" />
                      <span>Anki Dışa Aktarma Dosyası Yükle</span>
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      Anki'den dışa aktarılan <span className="font-mono text-emerald-400">All_Decks.txt</span> dosyasını seçin.
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsExportGuideOpen(true)}
                      className="mt-1.5 inline-flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 underline underline-offset-2 cursor-pointer"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                      <span>Anki'den nasıl dışa aktarılır?</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    disabled={isParsingFile}
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white font-medium text-sm transition-colors cursor-pointer shadow-md disabled:cursor-not-allowed"
                  >
                    {isParsingFile ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                        <span>Ayrıştırılıyor...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        <span>Dosya Seç (.txt)</span>
                      </>
                    )}
                  </button>
                </div>

                {isParsingFile && importProgressText && (
                  <div className="mt-3 text-xs text-emerald-400 flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>{importProgressText}</span>
                  </div>
                )}

                {importError && (
                  <div className="mt-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400">
                    {importError}
                  </div>
                )}

                {/* Last import stats pill */}
                {lastStats && (
                  <div className="mt-3 pt-3 border-t border-slate-800/80 flex flex-wrap gap-2 text-xs">
                    <span className="text-slate-400">Son içe aktarma:</span>
                    <span className="text-emerald-400 font-medium">
                      {lastStats.totalInFile} not
                    </span>
                    <span className="text-slate-500">•</span>
                    <span className="text-emerald-300 font-medium">
                      {lastStats.newCount} yeni
                    </span>
                    <span className="text-slate-500">•</span>
                    <span className="text-blue-300 font-medium">
                      {lastStats.updatedCount} güncellendi
                    </span>
                    <span className="text-slate-500">•</span>
                    <span className="text-slate-300">
                      {lastStats.unchangedCount} değişmedi
                    </span>
                  </div>
                )}

                {/* Missing notes removal button */}
                {missingNotesCount > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between">
                    <div className="text-xs text-amber-400 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>Anki dosyasında artık bulunmayan {missingNotesCount} not var.</span>
                    </div>
                    {!confirmDeleteMissing ? (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteMissing(true)}
                        className="text-xs text-red-400 hover:text-red-300 underline cursor-pointer"
                      >
                        Kaldır...
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleDeleteMissingNotes}
                          className="px-2.5 py-1 rounded bg-red-600 hover:bg-red-500 text-white text-xs font-semibold cursor-pointer"
                        >
                          Evet, {missingNotesCount} notu sil
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteMissing(false)}
                          className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs cursor-pointer"
                        >
                          İptal
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Medya Bölümü (Aşama 3: Medya içe aktarma) */}
              <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800/80 space-y-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white flex items-center gap-1.5">
                      <Volume2 className="w-4 h-4 text-emerald-400" />
                      <span>Medya (Ses ve Resimler)</span>
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      Anki'den dışa aktarılan <span className="font-mono text-emerald-400">.apkg</span> paketinden kartların ses ve resimlerini içe aktarın.
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      ref={apkgFileInputRef}
                      onChange={handleApkgFileChange}
                      accept=".apkg"
                      className="hidden"
                    />
                    <button
                      type="button"
                      disabled={isImportingApkg || isParsingFile}
                      onClick={() => {
                        if (allNotes.length === 0) {
                          onNotify?.('Önce All_Decks.txt ile havuzu yükleyin.', 'error');
                          return;
                        }
                        apkgFileInputRef.current?.click();
                      }}
                      className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-white font-medium text-sm transition-colors cursor-pointer shadow-md disabled:cursor-not-allowed ${
                        allNotes.length === 0
                          ? 'bg-slate-800 text-slate-500 opacity-60'
                          : 'bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800'
                      }`}
                      title={allNotes.length === 0 ? 'Önce All_Decks.txt ile havuzu yükleyin' : 'Medya içe aktar'}
                    >
                      {isImportingApkg ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-white" />
                          <span>İçe aktarılıyor...</span>
                        </>
                      ) : (
                        <>
                          <FileArchive className="w-4 h-4" />
                          <span>Medya içe aktar (.apkg)</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Status Summary */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/70 text-xs">
                  <div className="flex items-center gap-2 text-slate-300">
                    <span className="font-medium text-white">Medya:</span>
                    <span>
                      {mediaSummary ? (
                        <>
                          <strong className="text-emerald-400 font-semibold">{mediaSummary.totalFiles}</strong> dosya,{' '}
                          <strong className="text-emerald-400 font-semibold">
                            {(mediaSummary.totalBytes / (1024 * 1024)).toFixed(1)} MB
                          </strong>{' '}
                          <span className="text-slate-400">
                            (ses {mediaSummary.audioCount}, resim {mediaSummary.imageCount})
                          </span>
                        </>
                      ) : (
                        <span className="text-slate-500">Yükleniyor...</span>
                      )}
                    </span>
                  </div>

                  {mediaSummary && (mediaSummary.usageBytes !== undefined || mediaSummary.quotaBytes !== undefined) && (
                    <div className="text-[11px] text-slate-400">
                      Depolama:{' '}
                      <span className="text-slate-300">
                        {mediaSummary.usageBytes !== undefined
                          ? `${(mediaSummary.usageBytes / (1024 * 1024)).toFixed(1)} MB`
                          : ''}
                        {mediaSummary.quotaBytes !== undefined
                          ? ` / ${(mediaSummary.quotaBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
                          : ''}
                      </span>
                    </div>
                  )}
                </div>

                {/* Progress Indicator */}
                {isImportingApkg && apkgProgress && (
                  <div className="p-3 rounded-xl bg-slate-950/70 border border-emerald-500/30 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 text-emerald-400 font-medium">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>
                          {apkgProgress.phase === 'reading-index'
                            ? 'Arşiv ve medya indeksi okunuyor...'
                            : apkgProgress.phase === 'analyzing'
                            ? 'Kartlardaki medya taranıyor...'
                            : 'Dosyalar ayıklanıyor ve kaydediliyor...'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleCancelApkgImport}
                        className="px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-[11px] font-semibold transition-colors cursor-pointer"
                      >
                        İptal
                      </button>
                    </div>

                    {apkgProgress.totalNeededCount > 0 && (
                      <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-emerald-500 h-full transition-all duration-150 rounded-full"
                          style={{
                            width: `${Math.min(
                              100,
                              Math.round((apkgProgress.processedCount / apkgProgress.totalNeededCount) * 100)
                            )}%`,
                          }}
                        />
                      </div>
                    )}

                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span className="truncate max-w-[280px]">
                        {apkgProgress.currentFileName || ''}
                      </span>
                      <span className="font-mono">
                        {apkgProgress.processedCount} / {apkgProgress.totalNeededCount} dosya
                        {apkgProgress.processedBytes > 0 &&
                          ` (${(apkgProgress.processedBytes / (1024 * 1024)).toFixed(1)} MB)`}
                      </span>
                    </div>
                  </div>
                )}

                {/* Result Report */}
                {apkgResultReport && (
                  <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                    <div className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>İçe Aktarma Raporu</span>
                    </div>

                    <div className="flex flex-wrap gap-2 text-xs text-slate-300">
                      <span className="font-medium text-emerald-300">
                        {apkgResultReport.addedCount} dosya eklendi
                      </span>
                      <span className="text-slate-600">•</span>
                      <span className="text-slate-400">
                        {apkgResultReport.alreadyExistedCount} zaten vardı
                      </span>
                      <span className="text-slate-600">•</span>
                      <span className="text-slate-400">
                        {apkgResultReport.unusedSkippedCount} kullanılmayan medya atlandı
                      </span>
                      {apkgResultReport.missingInApkgCount > 0 && (
                        <>
                          <span className="text-slate-600">•</span>
                          <span className="text-amber-400 font-medium">
                            {apkgResultReport.missingInApkgCount} dosya kartlarda geçiyor ama .apkg içinde bulunamadı
                          </span>
                        </>
                      )}
                    </div>

                    {/* Missing files accordion */}
                    {apkgResultReport.missingList.length > 0 && (
                      <div className="pt-2 border-t border-slate-800/80">
                        <button
                          type="button"
                          onClick={() => setShowMissingMediaList((prev) => !prev)}
                          className="w-full flex items-center justify-between text-xs font-semibold text-amber-400 hover:text-amber-300 cursor-pointer py-1"
                        >
                          <div className="flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>Bulunamayan Medya Dosyaları ({apkgResultReport.missingList.length})</span>
                          </div>
                          {showMissingMediaList ? (
                            <ChevronDown className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5" />
                          )}
                        </button>

                        {showMissingMediaList && (
                          <div className="mt-2 p-2.5 rounded-lg bg-slate-900 border border-slate-800 max-h-44 overflow-y-auto space-y-1.5 text-xs">
                            {apkgResultReport.missingList.map((m, idx) => (
                              <div
                                key={idx}
                                className="p-1.5 rounded bg-slate-800/40 border border-slate-700/40 flex items-center justify-between"
                              >
                                <div className="min-w-0 pr-2">
                                  <div className="font-mono text-amber-300 text-[11px] truncate">
                                    {m.fileName}
                                  </div>
                                  <div className="text-[10px] text-slate-400 truncate">
                                    {m.headword ? `Kart: ${m.headword}` : ''}{' '}
                                    {m.deck ? `(${m.deck})` : ''}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Delete Media Files button */}
                {mediaSummary && mediaSummary.totalFiles > 0 && (
                  <div className="pt-2 border-t border-slate-800/70 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setIsDeleteMediaModalOpen(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-medium transition-colors cursor-pointer"
                      title="Medya dosyalarını sil"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Medya dosyalarını sil</span>
                    </button>
                  </div>
                )}
              </div>

              {/* If pool is completely empty (Requirement 7: Temizlik bitince bu duruma dönsün) */}
              {allNotes.length === 0 && (
                <div className="py-8 text-center text-slate-400 text-sm bg-slate-900/30 rounded-xl border border-dashed border-slate-800">
                  <BookOpen className="w-10 h-10 mx-auto text-slate-600 mb-2" />
                  <div className="font-semibold text-slate-300 mb-1">
                    Henüz havuz yok, <span className="font-mono text-emerald-400">All_Decks.txt</span> yükleyin
                  </div>
                  <div className="text-xs text-slate-500 max-w-sm mx-auto">
                    Anki uygulamanızdan kartlarınızı sekmeyle ayrılmış düz metin olarak dışa aktarıp yukarıdan yükleyebilirsiniz.
                  </div>
                </div>
              )}

              {/* Deste Ağacı (Deck Tree) */}
              {allNotes.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Deste Ağacı (Havuza dahil edilecekler)
                    </div>
                    <span className="text-[11px] text-slate-500">
                      İşaretli olanlar metinlerde aranır
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 max-h-64 overflow-y-auto">
                    {mainDeckTree.map((rootNode) => renderTreeItem(rootNode, 0, false, disabledDecksSet))}
                  </div>
                </div>
              )}

              {/* Arama Kutusu (Search Box) */}
              {allNotes.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Havuzda Kelime Ara
                  </div>
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Kelime veya kart içeriği ara (örn. breathe, leave, rain)..."
                      className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-700/80 rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  {searchQuery.trim() && (
                    <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-800 max-h-52 overflow-y-auto divide-y divide-slate-800/60">
                      {searchResults.length === 0 ? (
                        <div className="p-3 text-center text-xs text-slate-400">
                          Eşleşen kart bulunamadı.
                        </div>
                      ) : (
                        searchResults.map((note) => {
                          const isDisabled = disabledDecksSet.has(note.deck);
                          return (
                            <div
                              key={note.guid}
                              onClick={() => setInspectedNotes([note])}
                              className="p-2 hover:bg-slate-800/60 rounded-lg cursor-pointer transition-colors flex items-center justify-between"
                            >
                              <div className="min-w-0 pr-2">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-white text-sm">
                                    {note.headwords[0] || 'Kelime'}
                                  </span>
                                  {isDisabled && (
                                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                      kapalı deste
                                    </span>
                                  )}
                                  {note.phrase && (
                                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300">
                                      kalıp
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-400 truncate">
                                  {note.deck}
                                </div>
                              </div>
                              <span className="text-xs text-emerald-400 underline">İncele</span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Bölüm A: Şüpheli Başlıklar (Suspicious Headwords - Gerçek Sorunlar) */}
              {sortedSuspiciousList.length > 0 && (
                <div className="pt-2 border-t border-slate-800/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setShowSuspiciousList((prev) => !prev)}
                      className="flex items-center gap-1.5 text-xs font-semibold text-amber-400 hover:text-amber-300 cursor-pointer py-1"
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Şüpheli Başlıklar ({sortedSuspiciousList.length})</span>
                      {showSuspiciousList ? (
                        <ChevronDown className="w-3.5 h-3.5 ml-1" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 ml-1" />
                      )}
                    </button>

                    {showSuspiciousList && (
                      <button
                        type="button"
                        onClick={handleCopySuspiciousList}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition-colors cursor-pointer"
                        title="Tüm şüpheli notları panoya kopyala"
                      >
                        {isCopiedSuspicious ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-emerald-400 font-semibold">Kopyalandı</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-slate-400" />
                            <span>Listeyi kopyala</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {showSuspiciousList && (
                    <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 max-h-80 overflow-y-auto space-y-2.5 text-xs">
                      {sortedSuspiciousList.map((item, idx) => (
                        <div
                          key={item.guid || idx}
                          onClick={() => {
                            if (item.note) {
                              setInspectedNotes([item.note]);
                            }
                          }}
                          className={`p-3 rounded-xl bg-slate-800/50 border border-slate-700/60 transition-colors ${
                            item.note ? 'hover:bg-slate-800/80 cursor-pointer' : ''
                          }`}
                        >
                          {/* Reason(s) badge(s) */}
                          <div className="flex flex-wrap items-center gap-1.5 mb-2">
                            {item.reasons.map((r, rIdx) => (
                              <span
                                key={rIdx}
                                className="px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-300 font-medium text-[11px]"
                              >
                                {r}
                              </span>
                            ))}
                          </div>

                          {/* Extracted Headword & Guid */}
                          <div className="flex items-center justify-between gap-2 text-white font-semibold">
                            <span className="text-emerald-400">
                              Çıkarılan Başlık: {item.headwords.join(', ') || '(Yok)'}
                            </span>
                            <span className="text-[11px] text-slate-500 font-mono shrink-0">
                              guid: {item.guid}
                            </span>
                          </div>

                          {/* English side ~80 chars & other side ~60 chars */}
                          <div className="mt-2 space-y-1 bg-slate-950/40 p-2 rounded-lg border border-slate-800/60 text-[11px]">
                            <div className="text-slate-300 leading-relaxed">
                              <span className="text-slate-400 font-medium">
                                İngilizce ({item.englishSide === 'on' ? 'Ön' : 'Geri'}):
                              </span>{' '}
                              <span>{item.englishPreview || '(Boş)'}</span>
                            </div>
                            <div className="text-slate-400 leading-relaxed">
                              <span className="text-slate-500 font-medium">
                                Diğer ({item.englishSide === 'on' ? 'Geri' : 'Ön'}):
                              </span>{' '}
                              <span>{item.otherPreview || '(Boş)'}</span>
                            </div>
                          </div>

                          {/* Deck path & inspect link */}
                          <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2 pt-1.5 border-t border-slate-700/40">
                            <span className="truncate pr-2">Deste: {item.deck}</span>
                            {item.note && (
                              <span className="text-emerald-400 underline shrink-0 text-[11px]">
                                Karta bak
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Bölüm B: Kalıplar (bilgi) (Multi-word phrase notes) */}
              {sortedPhraseList.length > 0 && (
                <div className="pt-2 border-t border-slate-800/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setShowPhraseList((prev) => !prev)}
                      className="flex items-center gap-1.5 text-xs font-semibold text-purple-400 hover:text-purple-300 cursor-pointer py-1"
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>Kalıplar (bilgi) ({sortedPhraseList.length})</span>
                      {showPhraseList ? (
                        <ChevronDown className="w-3.5 h-3.5 ml-1" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 ml-1" />
                      )}
                    </button>
                    <span className="text-[11px] text-slate-500">
                      Çok kelimeli kalıplar ({sortedPhraseList.filter((p) => p.isActive).length} aktif, metinde eşleşir)
                    </span>
                  </div>

                  {showPhraseList && (
                    <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 max-h-80 overflow-y-auto space-y-2.5 text-xs">
                      {sortedPhraseList.map((item, idx) => (
                        <div
                          key={item.guid || idx}
                          onClick={() => {
                            if (item.note) {
                              setInspectedNotes([item.note]);
                            }
                          }}
                          className={`p-3 rounded-xl bg-slate-800/50 border border-slate-700/60 transition-colors ${
                            item.note ? 'hover:bg-slate-800/80 cursor-pointer' : ''
                          }`}
                        >
                          {/* Reason badge showing active phrase or skipped */}
                          <div className="flex flex-wrap items-center gap-1.5 mb-2">
                            {item.isActive ? (
                              <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-medium text-[11px] flex items-center gap-1">
                                <Check className="w-3 h-3 text-emerald-400" />
                                <span>Aktif kalıp (metinde eşleşir)</span>
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-md bg-rose-500/15 border border-rose-500/30 text-rose-300 font-medium text-[11px]">
                                İşlenemedi: {item.skipReason}
                              </span>
                            )}
                          </div>

                          {/* Extracted Headword & Guid */}
                          <div className="flex items-center justify-between gap-2 text-white font-semibold">
                            <span className={item.isActive ? 'text-emerald-400' : 'text-purple-300'}>
                              Kalıp: {item.headwords.join(', ') || '(Yok)'}
                            </span>
                            <span className="text-[11px] text-slate-500 font-mono shrink-0">
                              guid: {item.guid}
                            </span>
                          </div>

                          {/* English side ~80 chars & other side ~60 chars */}
                          <div className="mt-2 space-y-1 bg-slate-950/40 p-2 rounded-lg border border-slate-800/60 text-[11px]">
                            <div className="text-slate-300 leading-relaxed">
                              <span className="text-slate-400 font-medium">
                                İngilizce ({item.englishSide === 'on' ? 'Ön' : 'Geri'}):
                              </span>{' '}
                              <span>{item.englishPreview || '(Boş)'}</span>
                            </div>
                            <div className="text-slate-400 leading-relaxed">
                              <span className="text-slate-500 font-medium">
                                Diğer ({item.englishSide === 'on' ? 'Geri' : 'Ön'}):
                              </span>{' '}
                              <span>{item.otherPreview || '(Boş)'}</span>
                            </div>
                          </div>

                          {/* Deck path & inspect link */}
                          <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2 pt-1.5 border-t border-slate-700/40">
                            <span className="truncate pr-2">Deste: {item.deck}</span>
                            {item.note && (
                              <span className="text-purple-400 underline shrink-0 text-[11px]">
                                Karta bak
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Bölüm C: Kalıp olarak işlenemedi (Skipped Phrases) */}
              {sortedSkippedPhraseList.length > 0 && (
                <div className="pt-2 border-t border-slate-800/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setShowSkippedPhraseList((prev) => !prev)}
                      className="flex items-center gap-1.5 text-xs font-semibold text-rose-400 hover:text-rose-300 cursor-pointer py-1"
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Kalıp olarak işlenemedi ({sortedSkippedPhraseList.length})</span>
                      {showSkippedPhraseList ? (
                        <ChevronDown className="w-3.5 h-3.5 ml-1" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 ml-1" />
                      )}
                    </button>

                    {showSkippedPhraseList && (
                      <button
                        type="button"
                        onClick={handleCopySkippedPhraseList}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition-colors cursor-pointer"
                        title="Tüm işlenemeyen kalıpları panoya kopyala"
                      >
                        {isCopiedSkipped ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-emerald-400 font-semibold">Kopyalandı</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-slate-400" />
                            <span>Listeyi kopyala</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {showSkippedPhraseList && (
                    <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 max-h-80 overflow-y-auto space-y-2.5 text-xs">
                      {sortedSkippedPhraseList.map((item, idx) => (
                        <div
                          key={item.guid || idx}
                          onClick={() => {
                            if (item.note) {
                              setInspectedNotes([item.note]);
                            }
                          }}
                          className={`p-3 rounded-xl bg-slate-800/50 border border-slate-700/60 transition-colors ${
                            item.note ? 'hover:bg-slate-800/80 cursor-pointer' : ''
                          }`}
                        >
                          {/* Reason badge */}
                          <div className="flex flex-wrap items-center gap-1.5 mb-2">
                            <span className="px-2 py-0.5 rounded-md bg-rose-500/15 border border-rose-500/30 text-rose-300 font-medium text-[11px]">
                              {item.skipReason}
                            </span>
                          </div>

                          {/* Extracted Headword & Guid */}
                          <div className="flex items-center justify-between gap-2 text-white font-semibold">
                            <span className="text-rose-300">
                              Kalıp: {item.headwords.join(', ') || '(Yok)'}
                            </span>
                            <span className="text-[11px] text-slate-500 font-mono shrink-0">
                              guid: {item.guid}
                            </span>
                          </div>

                          {/* English side ~80 chars & other side ~60 chars */}
                          <div className="mt-2 space-y-1 bg-slate-950/40 p-2 rounded-lg border border-slate-800/60 text-[11px]">
                            <div className="text-slate-300 leading-relaxed">
                              <span className="text-slate-400 font-medium">
                                İngilizce ({item.englishSide === 'on' ? 'Ön' : 'Geri'}):
                              </span>{' '}
                              <span>{item.englishPreview || '(Boş)'}</span>
                            </div>
                            <div className="text-slate-400 leading-relaxed">
                              <span className="text-slate-500 font-medium">
                                Diğer ({item.englishSide === 'on' ? 'Geri' : 'Ön'}):
                              </span>{' '}
                              <span>{item.otherPreview || '(Boş)'}</span>
                            </div>
                          </div>

                          {/* Deck path & inspect link */}
                          <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2 pt-1.5 border-t border-slate-700/40">
                            <span className="truncate pr-2">Deste: {item.deck}</span>
                            {item.note && (
                              <span className="text-rose-400 underline shrink-0 text-[11px]">
                                Karta bak
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
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

      {/* Pop-up sheet when inspecting a search note */}
      {inspectedNotes && (
        <WordCardSheet
          notes={inspectedNotes}
          onClose={() => setInspectedNotes(null)}
          isSidePanel={false}
        />
      )}

      {/* Clear Pool Confirmation Modal (Requirement 7) */}
      <ClearPoolModal
        isOpen={isClearPoolModalOpen}
        notesCount={allNotes.length}
        onClose={() => setIsClearPoolModalOpen(false)}
        onConfirm={handleClearPoolConfirm}
      />

      {/* Anki export settings guide */}
      <AnkiExportGuideModal
        isOpen={isExportGuideOpen}
        rootDeck={settings.englishRootDeck || '**İngilizce kelimeler'}
        onClose={() => setIsExportGuideOpen(false)}
      />

      {/* Delete Media Confirmation Modal (Phase 3) */}
      <DeleteMediaModal
        isOpen={isDeleteMediaModalOpen}
        totalFiles={mediaSummary?.totalFiles || 0}
        totalSizeMb={((mediaSummary?.totalBytes || 0) / (1024 * 1024)).toFixed(1)}
        onClose={() => setIsDeleteMediaModalOpen(false)}
        onConfirm={handleDeleteMediaConfirm}
      />
    </div>
  );
};
