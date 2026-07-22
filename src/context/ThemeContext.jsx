/**
 * ThemeContext — dark/light + dynamic accent color.
 * Accent is stored as a CSS variable on :root so every component using
 * 'var(--accent)' reacts without re-render.
 */

import { createContext, useContext, useState, useEffect } from 'react';
import { STORAGE_KEYS } from '../utils/constants';

const ThemeContext = createContext({ dark: false, toggleDark: () => {}, accent: '#4A7BF7', setAccent: () => {} });

export const DEFAULT_ACCENT = '#4A7BF7';

function applyThemeColor(dark) {
  const color = dark ? '#000000' : '#f0ede8';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
  document.documentElement.style.background = color;
  document.body.style.background = color;
}

export function applyAccent(color) {
  document.documentElement.style.setProperty('--accent', color);
}

export function ThemeProvider({ children }) {
  const [dark, setDark] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.DARK_MODE);
      return saved === null ? true : saved === 'true'; // default dark
    } catch { return true; }
  });

  const [accent, setAccentState] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEYS.ACCENT_COLOR) || DEFAULT_ACCENT; } catch { return DEFAULT_ACCENT; }
  });

  // Apply on mount and whenever values change
  useEffect(() => { applyThemeColor(dark); }, [dark]);
  useEffect(() => { applyAccent(accent); }, [accent]);

  function toggleDark() {
    setDark(d => {
      const next = !d;
      try { localStorage.setItem(STORAGE_KEYS.DARK_MODE, String(next)); } catch { /* storage blocked (private mode / quota) — persisting the preference is optional, the toggle still applies for this session */ }
      return next;
    });
  }

  function setAccent(color) {
    setAccentState(color);
    try { localStorage.setItem(STORAGE_KEYS.ACCENT_COLOR, color); } catch { /* storage blocked (private mode / quota) — the accent is already in state and on :root, so only the next-launch restore is lost */ }
    applyAccent(color);
  }

  return (
    <ThemeContext.Provider value={{ dark, toggleDark, accent, setAccent }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
