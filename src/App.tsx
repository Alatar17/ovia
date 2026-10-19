/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { StoredText } from './types/text';
import { textStore } from './store/textStore';
import { poolStore } from './store/poolStore';
import { LibraryView } from './components/LibraryView';
import { ReadingView } from './components/ReadingView';
import { ImportView } from './components/ImportView';
import { CustomMatchesView } from './components/CustomMatchesView';
import { HighlightStyle, DesktopPanelPlacement } from './components/SettingsMenu';
import { ToastContainer, ToastMessage, ToastType } from './components/Toast';

type Screen = 'library' | 'reading' | 'import' | 'customMatches';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('library');
  const [previousScreen, setPreviousScreen] = useState<'library' | 'reading'>('library');
  const [texts, setTexts] = useState<StoredText[]>([]);
  const [selectedText, setSelectedText] = useState<StoredText | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDbAvailable, setIsDbAvailable] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);

  // Settings states preserved across views
  const [highlightStyle, setHighlightStyle] = useState<HighlightStyle>('bold-green');
  const [panelPlacement, setPanelPlacement] = useState<DesktopPanelPlacement>('side-sticky');

  // Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addNotification = useCallback((message: string, type: ToastType = 'info') => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Load texts from IndexedDB
  const loadTexts = useCallback(async () => {
    try {
      setIsLoading(true);
      const allTexts = await textStore.getAll();
      setTexts(allTexts);
      setIsDbAvailable(textStore.isIndexedDBAvailable);
      setDbError(textStore.initError);
    } catch (err: any) {
      console.error('Failed to load texts:', err);
      setIsDbAvailable(false);
      setDbError(err?.message || 'Veritabanı açılamadı.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTexts();
    poolStore.initialize().catch((err) => {
      console.warn('Failed to init poolStore:', err);
    });

    const handleNotifyEvent = (e: any) => {
      if (e.detail?.message) {
        addNotification(e.detail.message, e.detail.type || 'info');
      }
    };
    window.addEventListener('ovia-notify', handleNotifyEvent);
    return () => window.removeEventListener('ovia-notify', handleNotifyEvent);
  }, [loadTexts, addNotification]);

  // Existing titles lookup for duplicate detection in import
  const existingTitles = useMemo(() => {
    const set = new Set<string>();
    texts.forEach((t) => {
      if (t.title) {
        set.add(t.title.trim().toLowerCase());
      }
    });
    return set;
  }, [texts]);

  // Existing groups lookup for datalist suggestions in import
  const existingGroups = useMemo(() => {
    const set = new Set<string>();
    texts.forEach((t) => {
      const g = t.group ? t.group.trim() : '';
      if (g && g !== 'Grupsuz') {
        set.add(g);
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'tr'));
  }, [texts]);

  // Actions
  const handleSelectText = (text: StoredText) => {
    setSelectedText(text);
    setCurrentScreen('reading');
  };

  const handleBackToLibrary = () => {
    setCurrentScreen('library');
  };

  const handleAddTextClick = () => {
    setCurrentScreen('import');
  };

  const handleOpenCustomMatches = () => {
    if (currentScreen === 'reading' || currentScreen === 'library') {
      setPreviousScreen(currentScreen);
    }
    setCurrentScreen('customMatches');
  };

  const handleBackFromCustomMatches = () => {
    setCurrentScreen(previousScreen);
  };

  const handleImportSuccess = (addedCount: number) => {
    addNotification(`${addedCount} metin kütüphaneye başarıyla eklendi.`, 'success');
    loadTexts();
    setCurrentScreen('library');
  };

  const handleUpdateText = async (updated: StoredText) => {
    await textStore.update(updated);
    if (selectedText && selectedText.id === updated.id) {
      setSelectedText(updated);
    }
    await loadTexts();
  };

  const handleDeleteText = async (id: string) => {
    await textStore.delete(id);
    if (selectedText && selectedText.id === id) {
      setSelectedText(null);
    }
    await loadTexts();
  };

  return (
    <div className="min-h-screen bg-[var(--app-bg)] text-[var(--app-text)]">
      {/* Toast Feedback */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Screen Routing */}
      {currentScreen === 'library' && (
        <LibraryView
          texts={texts}
          isDbAvailable={isDbAvailable}
          dbError={dbError}
          onSelectText={handleSelectText}
          onAddTextClick={handleAddTextClick}
          onUpdateText={handleUpdateText}
          onDeleteText={handleDeleteText}
          onReload={loadTexts}
          onNotify={addNotification}
          highlightStyle={highlightStyle}
          onHighlightStyleChange={setHighlightStyle}
          panelPlacement={panelPlacement}
          onPanelPlacementChange={setPanelPlacement}
          onOpenCustomMatches={handleOpenCustomMatches}
        />
      )}

      {currentScreen === 'reading' && selectedText && (
        <ReadingView
          article={selectedText}
          onBackToLibrary={handleBackToLibrary}
          highlightStyle={highlightStyle}
          onHighlightStyleChange={setHighlightStyle}
          panelPlacement={panelPlacement}
          onPanelPlacementChange={setPanelPlacement}
          onReloadLibrary={loadTexts}
          onNotify={addNotification}
          onOpenCustomMatches={handleOpenCustomMatches}
        />
      )}

      {currentScreen === 'import' && (
        <ImportView
          onBack={handleBackToLibrary}
          onSuccess={handleImportSuccess}
          existingTitles={existingTitles}
          existingGroups={existingGroups}
        />
      )}

      {currentScreen === 'customMatches' && (
        <CustomMatchesView
          onBack={handleBackFromCustomMatches}
          onNotify={addNotification}
        />
      )}
    </div>
  );
}
