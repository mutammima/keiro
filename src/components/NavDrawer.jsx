import { useTheme } from '../context/ThemeContext';
import { LIGHT, DARK, ACCENT } from '../theme';

const NAV_ITEMS = [
  { id: 'invoice',  label: 'New Invoice',     icon: '🧾' },
  { id: 'history',  label: 'Invoice History', icon: '📋' },
  { id: 'products', label: 'Products',         icon: '📦' },
  { id: 'settings', label: 'Settings',         icon: '⚙️' },
];

export default function NavDrawer({ open, onClose, onNav, currentPage }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  return (
    <>
      {open && (
        <div
          style={{ ...s.backdrop, background: C.drawerBg === DARK.drawerBg ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.4)' }}
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <div style={{
        ...s.drawer,
        background: C.drawerBg,
        transform: open ? 'translateX(0)' : 'translateX(-100%)',
      }}>
        <div style={{ ...s.drawerHeader, borderBottomColor: C.drawerBorder }}>
          <span style={{ ...s.drawerTitle, color: C.text }}>Menu</span>
          <button style={{ ...s.closeBtn, color: C.textMuted }} onClick={onClose} aria-label="Close menu">
            ✕
          </button>
        </div>

        <nav style={s.nav}>
          {NAV_ITEMS.map(item => {
            const active = currentPage === item.id ||
              (item.id === 'invoice' && currentPage === 'invoice-view');
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
    position: 'fixed',
    inset: 0,
    zIndex: 1500,
  },
  drawer: {
    position: 'fixed',
    top: 0,
    left: 0,
    bottom: 0,
    width: 260,
    zIndex: 1600,
    boxShadow: '4px 0 24px rgba(0,0,0,0.18)',
    transition: 'transform 0.25s ease',
    display: 'flex',
    flexDirection: 'column',
  },
  drawerHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '20px 20px 16px',
    paddingTop: 'max(20px, env(safe-area-inset-top))',
    borderBottom: '1px solid',
  },
  drawerTitle: {
    fontSize: 18,
    fontWeight: 800,
    letterSpacing: 0.5,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: 18,
    cursor: 'pointer',
    padding: 4,
    lineHeight: 1,
  },
  nav: {
    display: 'flex',
    flexDirection: 'column',
    padding: '12px 0',
    gap: 2,
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '16px 24px',
    border: 'none',
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    textAlign: 'left',
    borderRadius: 0,
    WebkitTapHighlightColor: 'transparent',
  },
  navIcon: {
    fontSize: 20,
    width: 28,
    textAlign: 'center',
  },
};
