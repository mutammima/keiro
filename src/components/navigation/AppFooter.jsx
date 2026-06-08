/**
 * AppFooter — sticky footer shown on every screen with theme toggle, changelog,
 * roadmap, and the backup/restore feature.
 */

import { useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { LIGHT, DARK, ACCENT } from '../../theme';
import { useBackup } from '../../hooks/useBackup';

const WHATS_NEW = [
  { v: '3.2', notes: ['Barcode auto-lookup from product database', 'Backup & restore your data', 'Emoji-free clean UI'] },
  { v: '3.1', notes: ['Liquid glass sticky header', 'Business name shown while scrolling', 'Horizontal scroll fixed'] },
  { v: '3.0', notes: ['Dark redesign', 'Pinned stores', 'Hero summary card', 'Today / Earlier grouping'] },
  { v: '2.0', notes: ['Customer addresses', 'Notes field', 'Payment status', 'Search & filter history'] },
  { v: '1.0', notes: ['Invoice generation & PDF export', 'Barcode scanner', 'Product catalog', 'Store phone autofill'] },
];

const ROADMAP = [
  'Duplicate invoice in one tap',
  'Store profile — full balance & history per store',
  'Weekly / monthly revenue summary',
  'Default product prices (auto-fills when added)',
  'Overdue invoice alerts',
  'CSV export for bookkeeping',
];

export default function AppFooter({ onNav }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  // ── Modal visibility state ─────────────────────────────────────────────────
  const [modal, setModal] = useState(null); // 'news' | 'roadmap' | 'backup' | null

  // ── Backup logic from hook ─────────────────────────────────────────────────
  const { backupMsg, clearBackupMsg, fileInputRef, handleExport, handleImportClick, handleImportFile } = useBackup();

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <div style={{ ...s.footer, borderTopColor: C.divider }}>

        {/* Links — pipe-separated */}
        <div style={s.linkRow}>
          <FooterLink label="What's New"   onPress={() => setModal('news')}    C={C} />
          <Pipe C={C} />
          <FooterLink label="Roadmap"      onPress={() => setModal('roadmap')} C={C} />
          <Pipe C={C} />
          <FooterLink label="Backup"       onPress={() => setModal('backup')}  C={C} accent />
          <Pipe C={C} />
          <FooterLink label="About"        onPress={() => onNav?.('about')}    C={C} />
          <Pipe C={C} />
          <FooterLink label="Report a Bug" onPress={() => window.open('mailto:alomonds@gmail.com?subject=InvoGo Bug Report', '_blank')} C={C} />
        </div>

        {/* Legal links */}
        <div style={s.linkRow}>
          <FooterLink label="Privacy Policy" onPress={() => onNav?.('privacy')} C={C} />
          <Pipe C={C} />
          <FooterLink label="Terms of Service" onPress={() => onNav?.('terms')} C={C} />
        </div>

        <p style={{ ...s.version, color: C.textLight }}>InvoGo v4.0 · Cloud sync</p>
      </div>

      {/* ── Modal sheet ──────────────────────────────────────────────────── */}
      {modal && (
        <div style={s.overlay} onClick={() => { setModal(null); clearBackupMsg(); }}>
          <div style={{ ...s.sheet, background: C.card }} onClick={e => e.stopPropagation()}>
            <div style={{ ...s.sheetHandle, background: C.divider }} />
            <div style={{ ...s.sheetHeader, borderBottomColor: C.divider }}>
              <span style={{ ...s.sheetTitle, color: C.text }}>
                {modal === 'news' ? "What's New" : modal === 'roadmap' ? 'Roadmap' : 'Backup & Restore'}
              </span>
              <button style={{ ...s.sheetClose, color: C.textMuted }} onClick={() => { setModal(null); clearBackupMsg(); }}>✕</button>
            </div>

            <div style={s.sheetBody}>
              {/* What's New */}
              {modal === 'news' && WHATS_NEW.map(({ v, notes }) => (
                <div key={v} style={{ marginBottom: 20 }}>
                  <span style={{ ...s.versionTag, background: C.tagBg, color: C.textMuted }}>v{v}</span>
                  {notes.map(n => (
                    <p key={n} style={{ ...s.noteRow, color: C.textSub }}>— {n}</p>
                  ))}
                </div>
              ))}

              {/* Roadmap */}
              {modal === 'roadmap' && ROADMAP.map(label => (
                <div key={label} style={{ ...s.roadmapRow, borderBottomColor: C.divider }}>
                  <span style={{ ...s.roadmapDot, background: ACCENT }} />
                  <span style={{ ...s.roadmapLabel, color: C.textSub }}>{label}</span>
                </div>
              ))}

              {/* Backup & Restore */}
              {modal === 'backup' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <p style={{ ...s.backupDesc, color: C.textMuted }}>
                    Your data lives only on this device. Export a backup file regularly and keep it somewhere safe — your email, iCloud, Google Drive, etc. If you ever lose your data, restore from that file.
                  </p>

                  <button style={{ ...s.backupBtn, background: ACCENT, color: '#fff' }} onClick={handleExport}>
                    Export backup
                  </button>

                  <button style={{ ...s.backupBtn, background: C.nestedCard, color: C.text }} onClick={handleImportClick}>
                    Restore from file
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    style={{ display: 'none' }}
                    onChange={handleImportFile}
                  />

                  {backupMsg && (
                    <p style={{ ...s.backupMsg, color: backupMsg.includes('complete') ? '#2ECC8A' : C.textMuted }}>
                      {backupMsg}
                    </p>
                  )}

                  <div style={{ ...s.tipBox, background: C.nestedCard }}>
                    <p style={{ ...s.tipTitle, color: C.textMuted }}>When to backup</p>
                    <p style={{ ...s.tipText, color: C.textLight }}>After every batch of deliveries. Definitely before clearing app data or switching phones.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function FooterLink({ label, onPress, C, accent }) {
  return (
    <button
      style={{ ...s.footerLink, color: accent ? ACCENT : C.textMuted }}
      onClick={onPress}
    >
      {label}
    </button>
  );
}

function Pipe({ C }) {
  return <span style={{ color: C.textLight, fontSize: 12, userSelect: 'none' }}>|</span>;
}

const s = {
  footer: {
    borderTop: '1px solid',
    padding: '24px 20px',
    paddingBottom: 'max(28px, env(safe-area-inset-bottom))',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18,
    marginTop: 8,
  },
  modeRow: {
    display: 'flex', borderRadius: 12, padding: 4, gap: 4,
  },
  modeBtn: {
    background: 'none', border: 'none',
    padding: '8px 24px', borderRadius: 9,
    fontSize: 14, fontWeight: 500,
    cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
    transition: 'background 0.15s',
  },
  linkRow: {
    display: 'flex', alignItems: 'center', flexWrap: 'wrap',
    justifyContent: 'center', gap: 8,
  },
  footerLink: {
    background: 'none', border: 'none',
    fontSize: 13, fontWeight: 500,
    cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
    padding: '2px 0',
  },
  version: { fontSize: 12, margin: 0 },

  // Modal
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.65)',
    zIndex: 2000,
    display: 'flex', alignItems: 'flex-end',
  },
  sheet: {
    width: '100%', borderRadius: '20px 20px 0 0',
    maxHeight: '78dvh', display: 'flex', flexDirection: 'column',
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
  sheetBody: { overflowY: 'auto', padding: '16px 20px 36px' },

  versionTag: {
    display: 'inline-block',
    fontSize: 11, fontWeight: 700, letterSpacing: '0.05em',
    padding: '2px 8px', borderRadius: 6, marginBottom: 8,
  },
  noteRow: { fontSize: 14, margin: '4px 0', lineHeight: 1.5 },

  roadmapRow: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '13px 0', borderBottom: '1px solid',
  },
  roadmapDot: { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
  roadmapLabel: { fontSize: 14, lineHeight: 1.4 },

  // Backup
  backupDesc: { fontSize: 14, lineHeight: 1.6, margin: '0 0 4px' },
  backupBtn: {
    width: '100%', height: 50, border: 'none',
    borderRadius: 14, fontSize: 15, fontWeight: 600,
    cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
  },
  backupMsg: { fontSize: 14, textAlign: 'center', margin: '4px 0 0', fontWeight: 500 },
  tipBox: { borderRadius: 12, padding: '14px 16px', marginTop: 4 },
  tipTitle: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 6px' },
  tipText: { fontSize: 13, lineHeight: 1.5, margin: 0 },
};
