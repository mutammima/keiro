/**
 * TopNav (exported as BottomNav for compatibility) —
 * Fixed tab strip at the TOP of the screen, just below the status bar.
 * Shows New | Invoices | Products with an underline indicator.
 */

import { useTheme } from '../context/ThemeContext';
import { LIGHT, DARK, ACCENT } from '../theme';

const TABS = [
  { id: 'invoice',  label: 'New'      },
  { id: 'history',  label: 'Invoices' },
  { id: 'products', label: 'Products' },
];

export const TOP_NAV_HEIGHT = 40; // px, not counting safe-area

export default function BottomNav({ currentPage, onNav, onOpenDrawer }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  const activeIdx = TABS.findIndex(t =>
    currentPage === t.id || (t.id === 'invoice' && currentPage === 'invoice-view')
  );

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0,
      paddingTop: 'env(safe-area-inset-top)',
      background: dark ? 'rgba(10,10,10,0.96)' : 'rgba(248,248,248,0.96)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderBottom: `1px solid ${dark ? '#2a2a2a' : '#e0ddd8'}`,
      zIndex: 1000,
    }}>
      <div style={{ display: 'flex', height: TOP_NAV_HEIGHT, alignItems: 'stretch' }}>

        {/* Hamburger */}
        <button
          onClick={onOpenDrawer}
          style={{
            width: 48,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'none',
            border: 'none',
            borderBottom: '2.5px solid transparent',
            cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
            fontSize: 18,
            color: C.textMuted,
            padding: 0,
          }}
        >
          ☰
        </button>

        {/* Divider */}
        <div style={{ width: 1, background: dark ? '#2a2a2a' : '#e0ddd8', flexShrink: 0, margin: '8px 0' }} />

        {/* Tabs */}
        {TABS.map((tab, idx) => {
          const active = activeIdx === idx;
          return (
            <button
              key={tab.id}
              onClick={() => onNav(tab.id)}
              style={{
                flex: 1,
                height: TOP_NAV_HEIGHT,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'none',
                border: 'none',
                borderBottom: active ? `2.5px solid ${ACCENT}` : '2.5px solid transparent',
                padding: 0,
                cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
                transition: 'border-color 0.2s',
                WebkitAppearance: 'none',
              }}
            >
              <span style={{
                fontSize: 13,
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
    </div>
  );
}
