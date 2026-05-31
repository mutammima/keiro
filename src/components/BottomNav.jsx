/**
 * BottomNav — fixed bottom navigation with a sliding active pill indicator.
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
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: dark ? 'rgba(10,10,10,0.94)' : 'rgba(240,237,232,0.94)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderTop: `1px solid ${C.divider}`,
      paddingBottom: 'env(safe-area-inset-bottom)',
      zIndex: 1000,
      // position context for the sliding pill
      overflow: 'hidden',
    }}>
      {/* Sliding active pill */}
      {activeIdx !== -1 && (
        <div style={{
          position: 'absolute',
          top: 3,
          left: `calc(${activeIdx} * 33.333% + 8%)`,
          width: '17.333%',
          height: 22,
          background: dark ? 'rgba(74,123,247,0.13)' : 'rgba(74,123,247,0.09)',
          borderRadius: 7,
          transition: 'left 0.28s cubic-bezier(0.25,0.46,0.45,0.94)',
          pointerEvents: 'none',
        }} />
      )}

      <div style={{ display: 'flex', position: 'relative', height: 44 }}>
        {TABS.map((tab, idx) => {
          const active = activeIdx === idx;
          return (
            <button
              key={tab.id}
              onClick={() => onNav(tab.id)}
              style={{
                flex: 1,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                gap: 1,
                padding: 0,
                background: 'none', border: 'none',
                cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
                position: 'relative',
              }}
            >
              <span style={{
                fontSize: 14,
                color: active ? ACCENT : C.textMuted,
                lineHeight: 1,
                transition: 'color 0.2s, transform 0.2s',
                transform: active ? 'scale(1.1)' : 'scale(1)',
              }}>
                {tab.icon}
              </span>
              <span style={{
                fontSize: 9,
                fontWeight: active ? 700 : 500,
                color: active ? ACCENT : C.textMuted,
                letterSpacing: '0.02em',
                transition: 'color 0.2s',
              }}>
                {tab.label}
              </span>
              <div style={{
                position: 'absolute',
                bottom: 2,
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
