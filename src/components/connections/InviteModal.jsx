/**
 * InviteModal — generate + share an invite code/link to connect with the other
 * role. A driver invites a store; a store invites a driver.
 *
 * On open it reuses the most recent still-pending invite for the role (so the
 * code stays stable across opens) or creates a fresh one. Portaled to body per
 * the project's iOS fixed-modal rule.
 */

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../../context/ThemeContext';
import { LIGHT, DARK, ACCENT } from '../../theme';
import { getOrCreateInvite, inviteLink } from '../../utils/connectionStorage';
import { getBusinessName } from '../../utils/storage';
import { isGuest } from '../../utils/guestMode';
import { GuestCapModal } from '../auth/GuestUpsell';

export default function InviteModal({ role, inviterName = '', onClose }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  const guest = isGuest();
  const [conn,   setConn]   = useState(null);
  const [copied, setCopied] = useState('');

  useEffect(() => {
    if (guest) return; // guests can't create a cloud invite — gated below
    let alive = true;
    // Carry a display name so the other side knows who they connected with.
    getOrCreateInvite(role, inviterName || getBusinessName() || '').then(c => { if (alive) setConn(c); });
    return () => { alive = false; };
  }, []); // eslint-disable-line

  // An invite generated without a session never reaches the cloud, so the other
  // party could never redeem it. Hard-block: show the account gate instead.
  if (guest) {
    return (
      <GuestCapModal
        open
        onClose={onClose}
        title="Account required"
        subtitle={`You need a free account to invite a ${role === 'driver' ? 'store' : 'driver'} and connect. Your local data comes with you.`}
      />
    );
  }

  const code = conn?.inviteCode || '······';
  const link = conn ? inviteLink(conn.inviteCode) : '';
  const target = role === 'driver' ? 'store' : 'driver';

  async function copy(text, which) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(''), 1600);
    } catch {
      setCopied(which);
      setTimeout(() => setCopied(''), 1600);
    }
  }

  async function share() {
    if (!link) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Join me on Keiro', text: `Connect with me on Keiro — invite code ${code}`, url: link });
        return;
      } catch { /* user cancelled or unsupported — fall through to copy */ }
    }
    copy(link, 'link');
  }

  return createPortal(
    <div style={s.overlay} onClick={onClose}>
      <div style={{ ...s.modal, background: C.card, border: `1px solid ${C.cardBorder}` }} onClick={e => e.stopPropagation()}>

        <div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginBottom: 4 }}>Invite a {target}</div>
        <p style={{ fontSize: 13, color: C.textMuted, margin: '0 0 18px', lineHeight: 1.5 }}>
          Share this code or link. When they join Keiro with it, you'll be connected automatically.
        </p>

        {/* Code */}
        <div data-tip="invite-link" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderRadius: 14, background: dark ? '#0d1a3a' : '#eef3ff', border: `1px solid ${dark ? '#1a2f5a' : '#c7d8ff'}` }}>
          <span style={{ flex: 1, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 26, fontWeight: 800, letterSpacing: '0.16em', color: C.text }}>{code}</span>
          <button onClick={() => copy(code, 'code')} style={{ ...s.smallBtn, background: ACCENT, color: '#fff' }}>
            {copied === 'code' ? 'Copied' : 'Copy'}
          </button>
        </div>

        {/* Link actions */}
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button onClick={share} style={{ ...s.actionBtn, background: ACCENT, color: '#fff', border: 'none' }}>
            Share link
          </button>
          <button onClick={() => copy(link, 'link')} style={{ ...s.actionBtn, background: 'none', color: C.text, border: `1px solid ${C.inputBorder}` }}>
            {copied === 'link' ? 'Copied' : 'Copy link'}
          </button>
        </div>

        <button onClick={onClose} style={{ ...s.doneBtn, color: C.textMuted }}>Done</button>
      </div>
    </div>,
    document.body
  );
}

const s = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 9000,
    background: 'rgba(0,0,0,0.55)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  modal: {
    width: '100%', maxWidth: 360, borderRadius: 20,
    padding: '22px 20px 14px', boxShadow: '0 16px 48px rgba(0,0,0,0.35)',
  },
  smallBtn: {
    flexShrink: 0, height: 36, padding: '0 16px', border: 'none', borderRadius: 10,
    fontSize: 13, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
  },
  actionBtn: {
    flex: 1, height: 46, borderRadius: 12,
    fontSize: 14, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
  },
  doneBtn: {
    width: '100%', marginTop: 6, height: 42, background: 'none', border: 'none',
    fontSize: 14, fontWeight: 600, cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
  },
};
