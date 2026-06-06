/**
 * ThemeContext — dark/light + dynamic accent color.
 * Accent is stored as a CSS variable on :root so every component using
 * 'var(--accent)' reacts without re-render.
 */

import { createContext, useContext, useState, useEffect } from 'react';

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
      const saved = localStorage.getItem('inv_dark_mode');
      return saved === null ? true : saved === 'true'; // default dark
    } catch { return true; }
  });

  const [accent, setAccentState] = useState(() => {
    try { return localStorage.getItem('inv_accent_color') || DEFAULT_ACCENT; } catch { return DEFAULT_ACCENT; }
  });

  // Apply on mount and whenever values change
  useEffect(() => { applyThemeColor(dark); }, [dark]);
  useEffect(() => { applyAccent(accent); }, [accent]);

  function toggleDark() {
    setDark(d => {
      const next = !d;
      try { localStorage.setItem('inv_dark_mode', String(next)); } catch {}
      return next;
    });
  }

  function setAccent(color) {
    setAccentState(color);
    try { localStorage.setItem('inv_accent_color', color); } catch {}
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
