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
      {/* Sliding active pill — sits behind the labels */}
      {activeIdx !== -1 && (
        <div style={{
          position: 'absolute',
          top: 6,
          left: `calc(${activeIdx} * 33.333% + 8%)`,
          width: '17.333%',
          height: 36,
          background: dark ? 'rgba(74,123,247,0.13)' : 'rgba(74,123,247,0.09)',
          borderRadius: 12,
          transition: 'left 0.28s cubic-bezier(0.25,0.46,0.45,0.94)',
          pointerEvents: 'none',
        }} />
      )}

      <div style={{ display: 'flex', position: 'relative' }}>
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
                gap: 3,
                padding: '10px 0 9px',
                background: 'none', border: 'none',
                cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
                position: 'relative',
              }}
            >
              <span style={{
                fontSize: 20,
                color: active ? ACCENT : C.textMuted,
                lineHeight: 1,
                transition: 'color 0.2s, transform 0.2s',
                transform: active ? 'scale(1.1)' : 'scale(1)',
              }}>
                {tab.icon}
              </span>
              <span style={{
                fontSize: 10,
                fontWeight: active ? 700 : 500,
                color: active ? ACCENT : C.textMuted,
                letterSpacing: '0.02em',
                transition: 'color 0.2s',
              }}>
                {tab.label}
              </span>
              {/* Active dot */}
              <div style={{
                position: 'absolute',
                bottom: 3,
                width: 4, height: 4,
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
