/**
 * ThemeToggle — segmented Light / Dark control with a sliding pill.
 *
 * The active pill is absolutely-positioned inside the track and transitions
 * its `left` value so it smoothly slides from one side to the other.
 * Used in both AppFooter and Settings.
 */

import { useTheme } from '../../context/ThemeContext';
import { DARK, LIGHT } from '../../theme';

export default function ThemeToggle() {
  const { dark, toggleDark } = useTheme();
  const C = dark ? DARK : LIGHT;

  const trackBg  = dark ? '#1a1a1a' : '#e0e0e0';
  const pillBg   = dark ? '#2a2a2a' : '#ffffff';
  const pillShadow = dark
    ? '0 2px 8px rgba(0,0,0,0.45)'
    : '0 1px 4px rgba(0,0,0,0.15)';

  return (
    <div style={{
      position: 'relative',
      display: 'flex',
      background: trackBg,
      borderRadius: 12,
      padding: 4,
      gap: 0,
      transition: 'background 0.4s ease',
      width: '100%',
      maxWidth: 220,
    }}>
      {/* Sliding pill — moves left/right based on dark */}
      <div style={{
        position: 'absolute',
        top: 4,
        left: dark ? 'calc(50% + 0px)' : '4px',
        width: 'calc(50% - 4px)',
        bottom: 4,
        background: pillBg,
        borderRadius: 9,
        boxShadow: pillShadow,
        transition: 'left 0.25s cubic-bezier(0.34,1.3,0.64,1), background 0.4s ease, box-shadow 0.4s ease',
        pointerEvents: 'none',
      }} />

      {/* Light button */}
      <button
        onClick={() => { if (dark) toggleDark(); }}
        style={{
          flex: 1,
          position: 'relative', zIndex: 1,
          background: 'none', border: 'none',
          padding: '9px 8px',
          borderRadius: 9,
          fontSize: 14, fontWeight: 500,
          color: !dark ? '#09090b' : C.textMuted,
          cursor: dark ? 'pointer' : 'default',
          WebkitTapHighlightColor: 'transparent',
          transition: 'color 0.25s ease',
          userSelect: 'none',
        }}
      >
        ☼ Light
      </button>

      {/* Dark button */}
      <button
        onClick={() => { if (!dark) toggleDark(); }}
        style={{
          flex: 1,
          position: 'relative', zIndex: 1,
          background: 'none', border: 'none',
          padding: '9px 8px',
          borderRadius: 9,
          fontSize: 14, fontWeight: 500,
          color: dark ? '#ffffff' : C.textMuted,
          cursor: !dark ? 'pointer' : 'default',
          WebkitTapHighlightColor: 'transparent',
          transition: 'color 0.25s ease',
          userSelect: 'none',
        }}
      >
        ☾ Dark
      </button>
    </div>
  );
}
