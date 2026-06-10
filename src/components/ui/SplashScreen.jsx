/**
 * SplashScreen — shown on first paint, fades out after ~1.6 s.
 * Reads the saved theme from localStorage (same key as ThemeContext: inv_dark_mode)
 * so the background matches the user's chosen theme before React even hydrates.
 */

import { useEffect, useState } from 'react';
import { ACCENT, LIGHT, DARK } from '../../theme';
import KeiroWordmark from './KeiroWordmark';

// Must match the default logic in ThemeContext.jsx (null → dark by default)
function getSavedDark() {
  try {
    const saved = localStorage.getItem('inv_dark_mode');
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
      gap: 20,
      opacity: phase === 'fading' ? 0 : 1,
      transition: 'opacity 0.6s ease',
      pointerEvents: phase === 'fading' ? 'none' : 'auto',
    }}>

      {/* ── Logo mark — same SVG as AppLogoSVG exported below ── */}
      <div style={{
        width: 80, height: 80,
        borderRadius: 22,
        background: ACCENT,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: `0 16px 48px ${ACCENT}55`,
        animation: 'splash-pop 0.5s cubic-bezier(0.34,1.56,0.64,1) both',
      }}>
        <AppLogoSVG size={44} />
      </div>

      {/* ── Word mark ── */}
      <div style={{ textAlign: 'center', animation: 'splash-rise 0.5s 0.15s ease both' }}>
        <div style={{
          fontSize: 36,
          fontWeight: 900,
          letterSpacing: '-1.5px',
          lineHeight: 1,
          fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif",
        }}>
          <KeiroWordmark C={C} />
        </div>
        <div style={{
          color: C.textMuted,
          fontSize: 13,
          fontWeight: 500,
          marginTop: 5,
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
        animation: 'splash-rise 0.5s 0.35s ease both',
      }}>
        Developed by Mutammim
      </div>

      <style>{`
        @keyframes splash-pop {
          from { transform: scale(0.6); opacity: 0; }
          to   { transform: scale(1);   opacity: 1; }
        }
        @keyframes splash-rise {
          from { transform: translateY(10px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}

/**
 * Shared logo SVG — document with a checkmark badge.
 * Exported so other components (e.g. auth screens, about page) can reuse
 * the exact same mark without duplicating the SVG.
 */
export function AppLogoSVG({ size = 44 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" fill="none">
      {/* Document body */}
      <rect x="8" y="4" width="24" height="32" rx="4" fill="white" fillOpacity="0.22" />
      <rect x="8" y="4" width="24" height="32" rx="4" stroke="white" strokeWidth="2.2" />
      {/* Text lines */}
      <line x1="14" y1="14" x2="26" y2="14" stroke="white" strokeWidth="2"   strokeLinecap="round" />
      <line x1="14" y1="20" x2="26" y2="20" stroke="white" strokeWidth="2"   strokeLinecap="round" />
      <line x1="14" y1="26" x2="20" y2="26" stroke="white" strokeWidth="2"   strokeLinecap="round" />
      {/* Check badge */}
      <circle cx="32" cy="34" r="7"  fill={ACCENT} />
      <circle cx="32" cy="34" r="7"  stroke="white" strokeWidth="1.5" />
      <polyline
        points="28.5,34 31,36.5 35.5,31.5"
        stroke="white" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
