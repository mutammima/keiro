/**
 * BottomNav — 49px tall (iOS native tab bar standard, same as TikTok).
 * On Safari (not installed), shows an "Add to Home Screen" tip so the
 * browser toolbar goes away and the nav sits flush at the bottom.
 */

import { useState, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
import { LIGHT, DARK, ACCENT } from '../theme';

const TABS = [
  { id: 'invoice',  label: 'New',      icon: '＋' },
  { id: 'history',  label: 'Invoices', icon: '≡'  },
  { id: 'products', label: 'Products', icon: '◈'  },
];

/** True when running as an installed PWA (no browser chrome) */
function isInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;
}

/** True on iOS Safari (not Chrome/Firefox on iOS) */
function isIOSSafari() {
  const ua = window.navigator.userAgent;
  return /iP(hone|ad|od)/.test(ua) && /WebKit/.test(ua) && !/CriOS|FxiOS|OPiOS/.test(ua);
}

export default function BottomNav({ currentPage, onNav }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;
  const [showPWATip, setShowPWATip] = useState(false);

  useEffect(() => {
    // Show tip only on iOS Safari browser (not already installed)
    if (isIOSSafari() && !isInstalled()) {
      const dismissed = localStorage.getItem('inv_pwa_tip_dismissed');
      if (!dismissed) setShowPWATip(true);
    }
  }, []);

  function dismissTip() {
    localStorage.setItem('inv_pwa_tip_dismissed', '1');
    setShowPWATip(false);
  }

  const activeIdx = TABS.findIndex(t =>
    currentPage === t.id || (t.id === 'invoice' && currentPage === 'invoice-view')
  );

  return (
    <>
      {/* Add to Home Screen tip for Safari users */}
      {showPWATip && (
        <div style={{
          position: 'fixed',
          bottom: `calc(49px + env(safe-area-inset-bottom) + 8px)`,
          left: 12, right: 12,
          zIndex: 1100,
          background: dark ? '#1c1c1e' : '#ffffff',
          border: `1px solid ${dark ? '#3a3a3c' : '#e5e5ea'}`,
          borderRadius: 16,
          padding: '12px 14px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.25)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <span style={{ fontSize: 22, flexShrink: 0 }}>⬆️</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 2 }}>
              Add to Home Screen
            </div>
            <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.4 }}>
              Tap <strong>Share</strong> then <strong>"Add to Home Screen"</strong> to hide the Safari bar and get the full app experience.
            </div>
          </div>
          <button
            onClick={dismissTip}
            style={{
              background: 'none', border: 'none',
              fontSize: 18, color: C.textMuted,
              cursor: 'pointer', padding: '0 4px', flexShrink: 0,
              WebkitTapHighlightColor: 'transparent',
            }}
          >✕</button>
        </div>
      )}

      {/* Nav bar — 49px matches iOS native tab bar & TikTok */}
      <div style={{
        position: 'fixed',
        bottom: 0, left: 0, right: 0,
        height: `calc(49px + env(safe-area-inset-bottom))`,
        background: dark ? 'rgba(10,10,10,0.97)' : 'rgba(248,248,248,0.97)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: `1px solid ${dark ? '#2a2a2a' : '#c8c8cc'}`,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'stretch',
        overflow: 'hidden',
      }}>
        {TABS.map((tab, idx) => {
          const active = activeIdx === idx;
          const isLast = idx === TABS.length - 1;
          return (
            <button
              key={tab.id}
              onClick={() => onNav(tab.id)}
              style={{
                flex: 1,
                height: 49,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 3,
                padding: 0,
                background: active
                  ? (dark ? 'rgba(74,123,247,0.12)' : 'rgba(74,123,247,0.08)')
                  : 'transparent',
                border: 'none',
                borderRight: isLast ? 'none' : `1px solid ${dark ? '#2a2a2a' : '#c8c8cc'}`,
                cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
                transition: 'background 0.15s',
                WebkitAppearance: 'none',
                appearance: 'none',
                boxSizing: 'border-box',
              }}
            >
              <span style={{
                fontSize: 20,
                color: active ? ACCENT : C.textMuted,
                lineHeight: 1,
                transition: 'color 0.15s',
              }}>
                {tab.icon}
              </span>
              <span style={{
                fontSize: 10,
                fontWeight: active ? 700 : 500,
                color: active ? ACCENT : C.textMuted,
                letterSpacing: '0.01em',
                transition: 'color 0.15s',
                lineHeight: 1,
              }}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}
