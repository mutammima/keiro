const ACCENT = '#1a73e8';

const NAV_ITEMS = [
  { id: 'invoice',  label: 'New Invoice',      icon: '🧾' },
  { id: 'history',  label: 'Invoice History',  icon: '📋' },
  { id: 'products', label: 'Products',          icon: '📦' },
];

export default function NavDrawer({ open, onClose, onNav, currentPage }) {
  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          style={styles.backdrop}
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Drawer panel */}
      <div style={{
        ...styles.drawer,
        transform: open ? 'translateX(0)' : 'translateX(-100%)',
      }}>
        <div style={styles.drawerHeader}>
          <span style={styles.drawerTitle}>Menu</span>
          <button style={styles.closeBtn} onClick={onClose} aria-label="Close menu">✕</button>
        </div>

        <nav style={styles.nav}>
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              style={{
                ...styles.navItem,
                ...(currentPage === item.id ? styles.navItemActive : {}),
              }}
              onClick={() => onNav(item.id)}
            >
              <span style={styles.navIcon}>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </div>
    </>
  );
}

const styles = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.4)',
    zIndex: 1500,
  },
  drawer: {
    position: 'fixed',
    top: 0,
    left: 0,
    bottom: 0,
    width: 260,
    background: '#fff',
    zIndex: 1600,
    boxShadow: '4px 0 24px rgba(0,0,0,0.15)',
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
    borderBottom: '1px solid #f0f0f0',
  },
  drawerTitle: {
    fontSize: 18,
    fontWeight: 800,
    color: '#111',
    letterSpacing: 0.5,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: 18,
    color: '#aaa',
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
    background: 'none',
    border: 'none',
    fontSize: 16,
    fontWeight: 600,
    color: '#333',
    cursor: 'pointer',
    textAlign: 'left',
    borderRadius: 0,
    WebkitTapHighlightColor: 'transparent',
  },
  navItemActive: {
    color: ACCENT,
    background: '#e8f0fe',
  },
  navIcon: {
    fontSize: 20,
    width: 28,
    textAlign: 'center',
  },
};
