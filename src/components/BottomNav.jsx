/**
 * BottomNav — bold, full-height bottom bar with distinct bordered buttons.
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
      position: 'fixed',
      bottom: 0, left: 0, right: 0,
      paddingBottom: 'env(safe-area-inset-bottom)',
      background: dark ? '#0a0a0a' : '#f0ede8',
      borderTop: `2px solid ${dark ? '#2a2a2a' : '#d4d0cb'}`,
      zIndex: 1000,
      display: 'flex',
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
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
              padding: '10px 0 10px',
              background: active
                ? (dark ? 'rgba(74,123,247,0.15)' : 'rgba(74,123,247,0.1)')
                : 'transparent',
              border: 'none',
              borderRight: isLast ? 'none' : `1.5px solid ${dark ? '#2a2a2a' : '#d4d0cb'}`,
              cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
              transition: 'background 0.15s',
            }}
          >
            <span style={{
              fontSize: 18,
              color: active ? ACCENT : C.textMuted,
              lineHeight: 1,
              transition: 'color 0.2s',
            }}>
              {tab.icon}
            </span>
            <span style={{
              fontSize: 12,
              fontWeight: active ? 700 : 500,
              color: active ? ACCENT : C.textMuted,
              letterSpacing: '0.01em',
              transition: 'color 0.2s',
            }}>
              {tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
