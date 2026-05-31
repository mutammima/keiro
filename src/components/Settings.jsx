import { useTheme } from '../context/ThemeContext';
import { LIGHT, DARK, ACCENT } from '../theme';

export default function Settings({ onOpenDrawer }) {
  const { dark, toggleDark } = useTheme();
  const C = dark ? DARK : LIGHT;

  return (
    <div style={{ ...s.page, background: C.bg }}>
      {/* Header */}
      <div style={{ ...s.header, background: C.header, borderBottomColor: C.headerBorder }}>
        <button style={{ ...s.hamburger, color: C.text }} onClick={onOpenDrawer} aria-label="Open menu">
          ☰
        </button>
        <span style={{ ...s.title, color: C.text }}>Settings</span>
        <div style={{ width: 36 }} />
      </div>

      <div style={s.body}>
        {/* Appearance */}
        <div style={{ ...s.section, background: C.card }}>
          <p style={{ ...s.sectionTitle, color: C.textMuted }}>Appearance</p>

          <div style={s.row}>
            <div style={s.rowLeft}>
              <span style={{ ...s.rowLabel, color: C.text }}>Dark Mode</span>
              <span style={{ ...s.rowSub, color: C.textMuted }}>
                {dark ? 'On — using dark theme' : 'Off — using light theme'}
              </span>
            </div>
            <button
              role="switch"
              aria-checked={dark}
              onClick={toggleDark}
              style={{
                ...s.toggle,
                background: dark ? ACCENT : C.toggleTrack || '#e0e0e0',
              }}
            >
              <span style={{
                ...s.toggleThumb,
                transform: dark ? 'translateX(22px)' : 'translateX(2px)',
              }} />
            </button>
          </div>
        </div>

        {/* About */}
        <div style={{ ...s.section, background: C.card }}>
          <p style={{ ...s.sectionTitle, color: C.textMuted }}>About</p>
          <div style={s.row}>
            <span style={{ ...s.rowLabel, color: C.text }}>InvoiceGo</span>
            <span style={{ ...s.rowSub2, color: C.textMuted }}>v2</span>
          </div>
          <div style={{ ...s.divider, background: C.divider }} />
          <div style={s.row}>
            <span style={{ ...s.rowLabel, color: C.text }}>Data Storage</span>
            <span style={{ ...s.rowSub2, color: C.textMuted }}>On-device only</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const s = {
  page: {
    minHeight: '100dvh',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    borderBottom: '1px solid',
    padding: '14px 16px 12px',
    paddingTop: 'max(14px, env(safe-area-inset-top))',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  hamburger: {
    background: 'none',
    border: 'none',
    fontSize: 24,
    cursor: 'pointer',
    padding: '2px 4px',
    WebkitTapHighlightColor: 'transparent',
    flexShrink: 0,
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: 800,
    textAlign: 'center',
  },
  body: {
    padding: '20px 16px 48px',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    maxWidth: 480,
    width: '100%',
    margin: '0 auto',
    boxSizing: 'border-box',
  },
  section: {
    borderRadius: 16,
    overflow: 'hidden',
    boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    margin: 0,
    padding: '14px 18px 6px',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 18px',
    gap: 12,
  },
  rowLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    flex: 1,
  },
  rowLabel: {
    fontSize: 16,
    fontWeight: 600,
  },
  rowSub: {
    fontSize: 12,
  },
  rowSub2: {
    fontSize: 14,
  },
  divider: {
    height: 1,
    margin: '0 18px',
  },
  toggle: {
    width: 48,
    height: 28,
    borderRadius: 14,
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    position: 'relative',
    flexShrink: 0,
    transition: 'background 0.2s',
    WebkitTapHighlightColor: 'transparent',
  },
  toggleThumb: {
    position: 'absolute',
    top: 2,
    width: 24,
    height: 24,
    borderRadius: 12,
    background: '#ffffff',
    boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
    transition: 'transform 0.2s',
    display: 'block',
  },
};
