/**
 * TopNav — fixed tab strip at the TOP of the screen, just below the status bar.
 * Shows New | Invoices | Products with an underline indicator.
 *
 * (Historically named BottomNav — the bar started life at the bottom of the
 * screen, then moved to the top. File and export are now both TopNav.)
 */

import { useTheme } from '../../context/ThemeContext';
import { LIGHT, DARK, ACCENT } from '../../theme';

const DRIVER_TABS = [
  { id: 'home',    label: 'Home',    tutorial: null },
  { id: 'route',   label: 'Route',   tutorial: null },
  { id: 'stores',  label: 'Stores',  tutorial: null },
  { id: 'reports', label: 'Reports', tutorial: null },
];

const OWNER_TABS = [
  { id: 'so-home',     label: 'Home',     tutorial: null },
  { id: 'so-orders',   label: 'Orders',   tutorial: null },
  { id: 'so-drivers',  label: 'Drivers',  tutorial: null },
  { id: 'so-invoices', label: 'Invoices', tutorial: null },
];

export const TOP_NAV_HEIGHT = 44; // px, not counting safe-area — 44 = minimum comfortable tap target

export default function TopNav({ currentPage, onNav, onOpenDrawer, role, badges = {}, pulse = {} }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  const TABS = role === 'store_owner' ? OWNER_TABS : DRIVER_TABS;

  const activeIdx = TABS.findIndex(t => currentPage === t.id);

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0,
      paddingTop: 0,
      background: dark ? 'rgba(10,10,10,0.96)' : 'rgba(248,248,248,0.96)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderBottom: `1px solid ${dark ? '#2a2a2a' : '#e0ddd8'}`,
      zIndex: 1000,
    }}>
      <div style={{ display: 'flex', height: TOP_NAV_HEIGHT, alignItems: 'stretch' }}>

        {/* Hamburger */}
        <button
          data-tutorial="hamburger"
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
          const count = badges[tab.id] || 0;
          const pulsing = !!pulse[tab.id];
          return (
            <button
              key={tab.id}
              data-tutorial={tab.tutorial}
              data-qs-tab={tab.id}
              onClick={() => onNav(tab.id)}
              style={{
                flex: 1,
                height: TOP_NAV_HEIGHT,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
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
              {pulsing && (
                <span
                  aria-hidden
                  style={{
                    width: 7, height: 7, borderRadius: 4, background: ACCENT, flexShrink: 0,
                    '--tut-glow': 'rgba(74,123,247,0.5)',
                    animation: 'tut-pulse 1.4s ease-in-out infinite',
                  }}
                />
              )}
              {count > 0 && (
                <span style={{
                  minWidth: 16, height: 16, padding: '0 4px', boxSizing: 'border-box',
                  borderRadius: 8, background: '#ef4444', color: '#fff',
                  fontSize: 10, fontWeight: 800, lineHeight: '16px', textAlign: 'center',
                }}>
                  {count > 9 ? '9+' : count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
