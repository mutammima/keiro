import { useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import { LIGHT, DARK, ACCENT } from '../theme';

const WHATS_NEW = [
  { v: '3.1', notes: ['Liquid glass sticky header', 'Business name shown while scrolling', 'Horizontal scroll fixed'] },
  { v: '3.0', notes: ['Daimun-inspired dark redesign', 'Pinned stores', 'Hero summary card', 'Today / Earlier grouping'] },
  { v: '2.0', notes: ['Customer addresses', 'Notes field', 'Payment status (Paid / Partial / Unpaid)', 'Search & filter history'] },
  { v: '1.0', notes: ['Invoice generation & PDF export', 'Barcode scanner', 'Product catalog', 'Store phone autofill'] },
];

const ROADMAP = [
  { status: '🔜', label: 'Duplicate invoice in one tap' },
  { status: '🔜', label: 'Store profile — balance + full history per store' },
  { status: '🔜', label: 'Backup & restore (export / import your data)' },
  { status: '🔜', label: 'Weekly / monthly revenue summary' },
  { status: '🔜', label: 'Default product prices (auto-fills when added)' },
  { status: '🔜', label: 'Overdue invoice alerts' },
  { status: '🔜', label: 'CSV export for bookkeeping' },
];

export default function AppFooter() {
  const { dark, toggleDark } = useTheme();
  const C = dark ? DARK : LIGHT;
  const [modal, setModal] = useState(null); // 'news' | 'roadmap' | null

  return (
    <>
      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <div style={{ ...s.footer, borderTopColor: C.divider }}>

        {/* Dark / Light toggle pill */}
        <div style={{ ...s.modeRow, background: dark ? '#1a1a1a' : '#e4e4e7' }}>
          <button
            style={{ ...s.modeBtn, ...(dark ? {} : s.modeBtnActive), color: dark ? C.textMuted : C.text }}
            onClick={() => { if (dark) toggleDark(); }}
          >
            ☀️  Light
          </button>
          <button
            style={{ ...s.modeBtn, ...(dark ? s.modeBtnActive : {}), color: dark ? C.text : C.textMuted }}
            onClick={() => { if (!dark) toggleDark(); }}
          >
            🌙  Dark
          </button>
        </div>

        {/* Link grid */}
        <div style={s.linkGrid}>
          <FooterLink label="What's New"    icon="✨" onPress={() => setModal('news')}    C={C} />
          <FooterLink label="Roadmap"       icon="🗺️" onPress={() => setModal('roadmap')} C={C} />
          <FooterLink label="Report a Bug"  icon="🐛" onPress={() => window.open('mailto:alomonds@gmail.com?subject=InvoiceGo Bug Report', '_blank')} C={C} />
          <FooterLink label="Contact"       icon="✉️" onPress={() => window.open('mailto:alomonds@gmail.com', '_blank')} C={C} />
        </div>

        <p style={{ ...s.version, color: C.textLight }}>InvoiceGo v3.1 · On-device storage</p>
      </div>

      {/* ── Modal sheet ────────────────────────────────────────────────── */}
      {modal && (
        <div style={s.overlay} onClick={() => setModal(null)}>
          <div
            style={{ ...s.sheet, background: C.card, borderColor: C.cardBorder }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ ...s.sheetHandle, background: C.divider }} />
            <div style={{ ...s.sheetHeader, borderBottomColor: C.divider }}>
              <span style={{ ...s.sheetTitle, color: C.text }}>
                {modal === 'news' ? "What's New" : 'Roadmap'}
              </span>
              <button style={{ ...s.sheetClose, color: C.textMuted }} onClick={() => setModal(null)}>✕</button>
            </div>
            <div style={s.sheetBody}>
              {modal === 'news' && WHATS_NEW.map(({ v, notes }) => (
                <div key={v} style={{ marginBottom: 20 }}>
                  <span style={{ ...s.versionTag, background: C.tagBg, color: C.textMuted }}>v{v}</span>
                  {notes.map(n => (
                    <p key={n} style={{ ...s.noteRow, color: C.textSub }}>· {n}</p>
                  ))}
                </div>
              ))}
              {modal === 'roadmap' && ROADMAP.map(({ status, label }) => (
                <div key={label} style={{ ...s.roadmapRow, borderBottomColor: C.divider }}>
                  <span style={s.roadmapIcon}>{status}</span>
                  <span style={{ ...s.roadmapLabel, color: C.textSub }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function FooterLink({ label, icon, onPress, C }) {
  return (
    <button style={{ ...s.footerLink, color: C.textSub }} onClick={onPress}>
      <span style={s.footerLinkIcon}>{icon}</span>
      <span style={s.footerLinkLabel}>{label}</span>
    </button>
  );
}

const s = {
  footer: {
    borderTop: '1px solid',
    padding: '24px 20px',
    paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20,
    marginTop: 8,
  },
  modeRow: {
    display: 'flex', borderRadius: 12, padding: 4, gap: 4,
  },
  modeBtn: {
    background: 'none', border: 'none',
    padding: '8px 20px', borderRadius: 9,
    fontSize: 14, fontWeight: 500,
    cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
    transition: 'background 0.15s',
  },
  modeBtnActive: {
    background: '#3a3a3a',
    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
  },
  linkGrid: {
    display: 'grid', gridTemplateColumns: '1fr 1fr',
    gap: 10, width: '100%', maxWidth: 340,
  },
  footerLink: {
    background: 'none', border: 'none',
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '10px 14px', borderRadius: 10,
    fontSize: 14, fontWeight: 500,
    cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
    textAlign: 'left',
  },
  footerLinkIcon: { fontSize: 16 },
  footerLinkLabel: {},
  version: { fontSize: 12, marginTop: 4 },

  // Modal
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.6)',
    zIndex: 2000,
    display: 'flex', alignItems: 'flex-end',
  },
  sheet: {
    width: '100%', borderRadius: '20px 20px 0 0',
    border: '1px solid', borderBottom: 'none',
    maxHeight: '75dvh', display: 'flex', flexDirection: 'column',
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2,
    margin: '12px auto 0', flexShrink: 0,
  },
  sheetHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 20px 12px', borderBottom: '1px solid', flexShrink: 0,
  },
  sheetTitle: { fontSize: 17, fontWeight: 700 },
  sheetClose: {
    background: 'none', border: 'none', fontSize: 16,
    cursor: 'pointer', padding: 4,
  },
  sheetBody: { overflowY: 'auto', padding: '16px 20px 32px' },
  versionTag: {
    display: 'inline-block',
    fontSize: 11, fontWeight: 700, letterSpacing: '0.05em',
    padding: '2px 8px', borderRadius: 6, marginBottom: 8,
  },
  noteRow: { fontSize: 14, margin: '4px 0', lineHeight: 1.5 },
  roadmapRow: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '12px 0', borderBottom: '1px solid',
  },
  roadmapIcon: { fontSize: 18, flexShrink: 0 },
  roadmapLabel: { fontSize: 14, lineHeight: 1.4 },
};
