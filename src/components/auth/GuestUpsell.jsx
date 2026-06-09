/**
 * GuestUpsell — conversion prompts shown to guest (no-account) users.
 *
 * Exports two pieces:
 *   • <GuestCapModal />  — full-screen modal shown when a guest hits the
 *     hard save cap. Portaled to document.body so an `overflow:hidden`
 *     ancestor can't clip it on iOS (see CLAUDE.md iOS gotchas).
 *   • <GuestBanner />    — slim inline banner for dashboard/analytics pages
 *     where cloud-backed features are locked for guests.
 *
 * Both route the user to account creation via promptAccount(), which clears
 * the guest flag and reloads into the sign-up screen. Local data is preserved
 * and migrates to the cloud on sign-up.
 */

import { createPortal } from 'react-dom';
import { useTheme } from '../../context/ThemeContext';
import { LIGHT, DARK, ACCENT } from '../../theme';
import { promptAccount } from '../../utils/guestMode';

export function GuestCapModal({ open, onClose }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;
  if (!open) return null;

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 360,
          background: C.card, border: `1px solid ${C.cardBorder}`,
          borderRadius: 22, padding: '26px 22px 22px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 800, color: C.text, lineHeight: 1.25 }}>
          You've reached the limit!
        </div>
        <div style={{ fontSize: 14, color: C.textSub, lineHeight: 1.6 }}>
          Create an account to save unlimited entries, back them up, and sync
          across your devices.
        </div>
        <button
          onClick={promptAccount}
          style={{
            height: 50, borderRadius: 14, border: 'none', background: ACCENT,
            color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer',
            marginTop: 4, WebkitTapHighlightColor: 'transparent',
          }}
        >
          Create Free Account
        </button>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: 'none', color: C.textMuted,
            fontSize: 14, fontWeight: 600, cursor: 'pointer',
            padding: '4px 0', WebkitTapHighlightColor: 'transparent',
          }}
        >
          Not now
        </button>
      </div>
    </div>,
    document.body
  );
}

export function GuestBanner({
  title = 'Sign up to unlock the full dashboard',
  subtitle = 'Cloud backup, cross-device sync, and long-term analytics need a free account. Your local data migrates automatically.',
  cta = 'Sign up',
}) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  return (
    <div
      style={{
        background: dark ? 'rgba(74,123,247,0.12)' : 'rgba(74,123,247,0.08)',
        border: `1px solid ${dark ? 'rgba(74,123,247,0.30)' : 'rgba(74,123,247,0.25)'}`,
        borderRadius: 16, padding: '14px 16px',
        display: 'flex', alignItems: 'center', gap: 12,
      }}
    >
      <span style={{ fontSize: 22, lineHeight: 1 }} aria-hidden="true">🔒</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, lineHeight: 1.3 }}>{title}</div>
        <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.45, marginTop: 2 }}>{subtitle}</div>
      </div>
      <button
        onClick={promptAccount}
        style={{
          flexShrink: 0, background: ACCENT, border: 'none', color: '#fff',
          fontSize: 12, fontWeight: 700, padding: '8px 14px', borderRadius: 10,
          cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
        }}
      >
        {cta}
      </button>
    </div>
  );
}
