/**
 * SplashScreen — shown on first paint, fades out after ~1.6 s.
 * Reads the saved theme from localStorage (same key as ThemeContext: inv_dark_mode)
 * so the background matches the user's chosen theme before React even hydrates.
 */

import { useEffect, useState } from 'react';
import { STORAGE_KEYS } from '../../utils/constants';
import { LIGHT, DARK } from '../../theme';
import KeiroWordmark from './KeiroWordmark';

// Must match the default logic in ThemeContext.jsx (null → dark by default)
function getSavedDark() {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.DARK_MODE);
    return saved === null ? true : saved === 'true';
  } catch { return true; }
}

export default function SplashScreen({ onDone }) {
  const [phase, setPhase] = useState('visible');

  // Read theme synchronously so we never flash the wrong colour
  const dark = getSavedDark();
  const C    = dark ? DARK : LIGHT;

  useEffect(() => {
    const hold = setTimeout(() => setPhase('fading'), 1500);
    const done = setTimeout(() => onDone(),           2100);
    return () => { clearTimeout(hold); clearTimeout(done); };
  }, [onDone]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: C.bg,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 12,
      opacity: phase === 'fading' ? 0 : 1,
      transition: 'opacity 0.6s ease',
      pointerEvents: phase === 'fading' ? 'none' : 'auto',
    }}>

      {/* ── Word mark ── */}
      <div style={{ textAlign: 'center', animation: 'splash-rise 0.5s ease both' }}>
        <div style={{
          fontSize: 48,
          fontWeight: 900,
          letterSpacing: '-2px',
          lineHeight: 1,
          fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif",
        }}>
          <KeiroWordmark C={C} />
        </div>
        <div style={{
          color: C.textMuted,
          fontSize: 13,
          fontWeight: 500,
          marginTop: 8,
          letterSpacing: 0.3,
        }}>
          Streamlining the way you do business.
        </div>
      </div>

      {/* ── Developer credit ── */}
      <div style={{
        position: 'absolute',
        bottom: 'max(24px, env(safe-area-inset-bottom, 24px))',
        left: 0, right: 0,
        textAlign: 'center',
        color: C.textMuted,
        fontSize: 11,
        fontWeight: 400,
        opacity: 0.45,
        letterSpacing: 0.2,
        animation: 'splash-rise 0.5s 0.2s ease both',
      }}>
        Developed by Mutammim
      </div>

      <style>{`
        @keyframes splash-rise {
          from { transform: translateY(10px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}
