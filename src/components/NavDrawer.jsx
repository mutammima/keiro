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
          style={{ ...s.backdrop }}
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <div style={{
        ...s.drawer,
        background: C.drawerBg,
        borderRightColor: C.drawerBorder,
        transform: open ? 'translateX(0)' : 'translateX(-100%)',
      }}>
        <div style={{ ...s.drawerHeader, borderBottomColor: C.drawerBorder }}>
          <span style={{ ...s.drawerTitle, color: C.text }}>Menu</span>
          <button style={{ ...s.closeBtn, color: C.textMuted }} onClick={onClose}>✕</button>
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
                  borderLeftColor: active ? ACCENT : 'transparent',
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
    background: 'rgba(0,0,0,0.45)',
    zIndex: 1500,
  },
  drawer: {
    position: 'fixed', top: 0, left: 0, bottom: 0,
    width: 256, zIndex: 1600,
    borderRight: '1px solid',
    boxShadow: '8px 0 32px rgba(0,0,0,0.12)',
    transition: 'transform 0.22s ease',
    display: 'flex', flexDirection: 'column',
  },
  drawerHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '18px 18px 14px',
    paddingTop: 'max(18px, env(safe-area-inset-top))',
    borderBottom: '1px solid',
  },
  drawerTitle: { fontSize: 16, fontWeight: 700, letterSpacing: 0.3 },
  closeBtn: {
    background: 'none', border: 'none', fontSize: 16,
    cursor: 'pointer', padding: 4, lineHeight: 1,
  },
  nav: {
    display: 'flex', flexDirection: 'column',
    padding: '10px 0', gap: 1,
  },
  navItem: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '13px 18px',
    border: 'none', borderLeft: '3px solid',
    fontSize: 15, fontWeight: 500,
    cursor: 'pointer', textAlign: 'left',
    WebkitTapHighlightColor: 'transparent',
  },
  navIcon: { fontSize: 18, width: 24, textAlign: 'center' },
};
