import { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext({ dark: false, toggleDark: () => {} });

function applyThemeColor(dark) {
  const color = dark ? '#000000' : '#f4f4f5';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
  document.body.style.background = dark ? '#000000' : '#f4f4f5';
}

export function ThemeProvider({ children }) {
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem('inv_dark_mode') === 'true'; } catch { return false; }
  });

  useEffect(() => { applyThemeColor(dark); }, [dark]);

  function toggleDark() {
    setDark(d => {
      const next = !d;
      try { localStorage.setItem('inv_dark_mode', String(next)); } catch {}
      return next;
    });
  }

  return (
    <ThemeContext.Provider value={{ dark, toggleDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
