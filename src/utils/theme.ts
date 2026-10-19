/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type AppTheme = 'night' | 'paper' | 'neutral';

const THEME_KEY = 'ovia_theme';

export const THEME_OPTIONS: { id: AppTheme; label: string; swatch: string; accent: string }[] = [
  { id: 'night', label: 'Gece', swatch: '#1c1a17', accent: '#9ccc8f' },
  { id: 'paper', label: 'Kâğıt', swatch: '#f4ecd8', accent: '#2f6b45' },
  { id: 'neutral', label: 'Nötr', swatch: '#181818', accent: '#8fb8ff' },
];

// index.html applies the saved theme before first paint; this reads it back for the UI
export function getTheme(): AppTheme {
  const current = document.documentElement.getAttribute('data-theme');
  return current === 'paper' || current === 'neutral' ? current : 'night';
}

export function setTheme(theme: AppTheme): void {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {}
}
