import { useTheme } from '../context/ThemeContext';
import { LIGHT, DARK, ACCENT, glassStyle } from '../theme';

export default function Settings({ onOpenDrawer }) {
  const { dark, toggleDark } = useTheme();
  const C = dark ? DARK : LIGHT;

  return (
    <div style={{ ...s.page, background: C.bg }}>
      <div style={{ ...s.header, ...glassStyle(dark) }}>
        <button style={{ ...s.hamburger, color: C.text }} onClick={onOpenDrawer}>☰</button>
        <span style={{ ...s.title, color: C.text }}>Settings</span>
        <div style={{ width: 36 }} />
      </div>

      <div style={s.body}>
        <p style={{ ...s.groupLabel, color: C.textMuted }}>Appearance</p>
        <div style={{ ...s.section, background: C.card, borderColor: C.cardBorder }}>
          <div style={s.row}>
            <div>
              <p style={{ ...s.rowLabel, color: C.text }}>Dark Mode</p>
              <p style={{ ...s.rowSub, color: C.textMuted }}>{dark ? 'On' : 'Off'}</p>
            </div>
            <button
              role="switch"
              aria-checked={dark}
              onClick={toggleDark}
              style={{ ...s.toggle, background: dark ? ACCENT : C.toggleTrack }}
            >
              <span style={{
                ...s.toggleThumb,
                transform: dark ? 'translateX(22px)' : 'translateX(2px)',
              }} />
            </button>
          </div>
        </div>

        <p style={{ ...s.groupLabel, color: C.textMuted, marginTop: 8 }}>About</p>
        <div style={{ ...s.section, background: C.card, borderColor: C.cardBorder }}>
          <div style={s.row}>
            <span style={{ ...s.rowLabel, color: C.text }}>Version</span>
            <span style={{ ...s.rowRight, color: C.textMuted }}>3.0</span>
          </div>
          <div style={{ ...s.divider, background: C.divider }} />
          <div style={s.row}>
            <span style={{ ...s.rowLabel, color: C.text }}>Storage</span>
            <span style={{ ...s.rowRight, color: C.textMuted }}>On-device only</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const s = {
  page: { minHeight: '100dvh', display: 'flex', flexDirection: 'column' },
  header: {
    padding: '12px 16px 10px',
    paddingTop: 'max(12px, env(safe-area-inset-top))',
    display: 'flex', alignItems: 'center', gap: 12,
  },
  hamburger: {
    background: 'none', border: 'none', fontSize: 22,
    cursor: 'pointer', padding: '3px 4px',
    WebkitTapHighlightColor: 'transparent', flexShrink: 0,
  },
  title: { flex: 1, fontSize: 17, fontWeight: 700, textAlign: 'center' },
  body: {
    padding: '20px 16px 48px',
    maxWidth: 480, width: '100%', margin: '0 auto', boxSizing: 'border-box',
  },
  groupLabel: {
    fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.07em', margin: '0 0 8px 4px',
  },
  section: {
    borderRadius: 12, border: '1px solid', overflow: 'hidden',
    marginBottom: 0,
  },
  row: {
    display: 'flex', alignItems: 'center',
    justifyContent: 'space-between', padding: '14px 16px', gap: 12,
  },
  rowLabel: { fontSize: 15, fontWeight: 500 },
  rowSub: { fontSize: 12, marginTop: 1 },
  rowRight: { fontSize: 14 },
  divider: { height: 1, margin: '0 16px' },
  toggle: {
    width: 48, height: 28, borderRadius: 14,
    border: 'none', cursor: 'pointer', padding: 0,
    position: 'relative', flexShrink: 0,
    transition: 'background 0.2s', WebkitTapHighlightColor: 'transparent',
  },
  toggleThumb: {
    position: 'absolute', top: 2, width: 24, height: 24,
    borderRadius: 12, background: '#ffffff',
    boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
    transition: 'transform 0.2s', display: 'block',
  },
};
