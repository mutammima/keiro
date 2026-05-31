/**
 * NavDrawer — slide-in navigation sidebar.
 * Opens from the left; closes via the back arrow or backdrop tap.
 */

import { useTheme } from '../context/ThemeContext';
import { LIGHT, DARK, ACCENT } from '../theme';

const NAV_ITEMS = [
  { id: 'invoice',  label: 'New Invoice',     icon: '+' },
  { id: 'history',  label: 'Invoice History', icon: '≡' },
  { id: 'products', label: 'Products',         icon: '◈' },
];

export default function NavDrawer({ open, onClose, onNav, currentPage }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  return (
    <>
      {/* Dimmed backdrop — fades in/out with the drawer */}
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          ...s.backdrop,
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
        }}
      />

      {/* Drawer panel */}
      <div style={{
        ...s.drawer,
        background: C.drawerBg,
        transform: open ? 'translateX(0)' : 'translateX(-100%)',
      }}>
        {/* Header — just the back arrow, no "Menu" title */}
        <div style={{ ...s.drawerHeader }}>
          <button style={{ ...s.closeBtn, color: C.textMuted }} onClick={onClose}>
            ←
          </button>
        </div>

        <nav style={s.nav}>
          {NAV_ITEMS.map(item => {
            const active = currentPage === item.id || (item.id === 'invoice' && currentPage === 'invoice-view');
            return (
              <button
                key={item.id}
                style={{
                  ...s.navItem,
                  color: active ? C.navActiveText : C.navText,
                  background: active ? C.navActive : 'none',
                }}
                onClick={() => onNav(item.id)}
              >
                <span style={s.navIcon}>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </>
  );
}

const s = {
  backdrop: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.6)',
    zIndex: 1500,
    transition: 'opacity 2.5s ease-in-out',
  },
  drawer: {
    position: 'fixed', top: 0, left: 0, bottom: 0,
    width: 'min(200px, 58vw)', zIndex: 1600,
    transition: 'transform 2.5s ease-in-out',
    display: 'flex', flexDirection: 'column',
  },
  drawerHeader: {
    display: 'flex', alignItems: 'center',
    padding: '16px 16px 12px',
    paddingTop: 'max(16px, env(safe-area-inset-top))',
  },
  closeBtn: {
    background: 'none', border: 'none',
    fontSize: 22, fontWeight: 300,
    cursor: 'pointer', padding: '0 4px', lineHeight: 1,
    WebkitTapHighlightColor: 'transparent',
  },
  nav: {
    display: 'flex', flexDirection: 'column',
    padding: '6px 10px', gap: 2,
  },
  navItem: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '11px 12px',
    border: 'none', borderRadius: 12,
    fontSize: 14, fontWeight: 500,
    cursor: 'pointer', textAlign: 'left',
    WebkitTapHighlightColor: 'transparent',
    transition: 'background 0.15s',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  navIcon: { fontSize: 16, width: 20, textAlign: 'center', flexShrink: 0 },
};
