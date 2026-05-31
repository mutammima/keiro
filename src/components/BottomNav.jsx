/**
 * BottomNav — slim fixed bottom bar.
 * Height is controlled by .igo-nav / .igo-nav-row / .igo-nav-btn classes
 * defined in App.css so the size is enforced even on devices with a cached
 * older JS bundle.
 */

import { useTheme } from '../context/ThemeContext';
import { LIGHT, DARK, ACCENT } from '../theme';

const TABS = [
  { id: 'invoice',  label: 'New',      icon: '＋' },
  { id: 'history',  label: 'Invoices', icon: '≡'  },
  { id: 'products', label: 'Products', icon: '◈'  },
];

export default function BottomNav({ currentPage, onNav }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  const activeIdx = TABS.findIndex(t =>
    currentPage === t.id || (t.id === 'invoice' && currentPage === 'invoice-view')
  );

  return (
    <div
      className="igo-nav"
      style={{
        position: 'fixed',
        bottom: 0, left: 0, right: 0,
        background: dark ? 'rgba(10,10,10,0.96)' : 'rgba(240,237,232,0.96)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: `1px solid ${C.divider}`,
        zIndex: 1000,
      }}
    >
      {/* Sliding active pill */}
      {activeIdx !== -1 && (
        <div style={{
          position: 'absolute',
          top: 6,
          left: `calc(${activeIdx} * 33.333% + 6%)`,
          width: '21.333%',
          height: 28,
          background: dark ? 'rgba(74,123,247,0.13)' : 'rgba(74,123,247,0.09)',
          borderRadius: 7,
          transition: 'left 0.28s cubic-bezier(0.25,0.46,0.45,0.94)',
          pointerEvents: 'none',
        }} />
      )}

      <div className="igo-nav-row" style={{ display: 'flex', position: 'relative' }}>
        {TABS.map((tab, idx) => {
          const active = activeIdx === idx;
          return (
            <button
              key={tab.id}
              className="igo-nav-btn"
              onClick={() => onNav(tab.id)}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
                position: 'relative',
                boxSizing: 'border-box',
              }}
            >
              <span style={{
                fontSize: 13,
                color: active ? ACCENT : C.textMuted,
                lineHeight: 1,
                transition: 'color 0.2s',
                userSelect: 'none',
                pointerEvents: 'none',
              }}>
                {tab.icon}
              </span>
              <span style={{
                fontSize: 11,
                fontWeight: active ? 700 : 500,
                color: active ? ACCENT : C.textMuted,
                transition: 'color 0.2s',
                userSelect: 'none',
                pointerEvents: 'none',
              }}>
                {tab.label}
              </span>
              <div style={{
                position: 'absolute',
                bottom: 3,
                width: 3, height: 3,
                borderRadius: 2,
                background: ACCENT,
                opacity: active ? 1 : 0,
                transition: 'opacity 0.2s',
              }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
