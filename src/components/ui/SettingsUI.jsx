/**
 * SettingsUI — shared primitive components used across the Settings screen.
 *
 * Extracted from Settings.jsx so they can be reused in other screens
 * (e.g. a future per-section settings page) without re-defining them.
 *
 * Components:
 *   <Toggle on={bool} onChange={fn} />         — iOS-style toggle switch
 *   <Row label="…" sub="…">children</Row>      — label-left / control-right row
 *   <Divider />                                 — 1px horizontal rule
 *   <Section title="…" defaultOpen={bool}>      — collapsible card section
 */

import { useState } from 'react';
import { ACCENT } from '../../theme';

// ── Toggle ────────────────────────────────────────────────────────────────────

export function Toggle({ on, onChange, dark }) {
  return (
    <button
      onClick={() => onChange(!on)}
      style={{
        width: 44, height: 26, borderRadius: 13,
        background: on ? ACCENT : (dark ? '#2a2a2a' : '#d4d4d8'),
        border: 'none', padding: 3, cursor: 'pointer',
        transition: 'background 0.25s',
        WebkitTapHighlightColor: 'transparent',
        flexShrink: 0,
        position: 'relative',
      }}
    >
      <div style={{
        width: 20, height: 20, borderRadius: 10, background: '#fff',
        transform: `translateX(${on ? 18 : 0}px)`,
        transition: 'transform 0.25s cubic-bezier(0.34,1.56,0.64,1)',
        boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
      }} />
    </button>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

export function Row({ label, sub, C, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 0', gap: 12 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: C.text, fontSize: 14, fontWeight: 500 }}>{label}</div>
        {sub && <div style={{ color: C.textMuted, fontSize: 12, marginTop: 2, lineHeight: 1.4 }}>{sub}</div>}
      </div>
      {children}
    </div>
  );
}

// ── Divider ───────────────────────────────────────────────────────────────────

export function Divider({ C }) {
  return <div style={{ height: 1, background: C.divider }} />;
}

// ── Section ───────────────────────────────────────────────────────────────────

export function Section({ title, C, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderRadius: 18, overflow: 'hidden', border: `1px solid ${C.cardBorder || C.divider}`, background: C.card }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', background: 'none', border: 'none', cursor: 'pointer',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <span style={{ color: C.textMuted, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{title}</span>
        <span style={{ color: C.textMuted, fontSize: 13, transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
      </button>
      {open && (
        <div style={{ padding: '0 18px 16px', display: 'flex', flexDirection: 'column', gap: 0 }}>
          {children}
        </div>
      )}
    </div>
  );
}
