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
  },
  drawer: {
    position: 'fixed', top: 0, left: 0, bottom: 0,
    width: 'min(200px, 58vw)', zIndex: 1600,
    transition: 'transform 1.5s cubic-bezier(0.32,0.72,0,1)',
    display: 'flex', flexDirection: 'column',
  },
  drawerHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '16px 16px 12px',
    paddingTop: 'max(16px, env(safe-area-inset-top))',
  },
  drawerTitle: { fontSize: 15, fontWeight: 700, letterSpacing: 0.2 },
  closeBtn: {
    background: 'rgba(255,255,255,0.08)', border: 'none', fontSize: 15,
    cursor: 'pointer', padding: 0, lineHeight: 1,
    width: 32, height: 32, borderRadius: 16,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
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
