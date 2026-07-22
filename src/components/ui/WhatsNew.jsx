/**
 * WhatsNew — modal shown once per app version after an update is applied.
 * Stores the last-seen version in localStorage so it only shows once.
 */

import { useTheme } from '../../context/ThemeContext';
import { LIGHT, DARK, ACCENT } from '../../theme';
import { STORAGE_KEYS } from '../../utils/constants';

export const APP_VERSION = '5.9';

const CHANGELOG = [
  'Payment reminders — one tap sends an overdue-invoice reminder over WhatsApp, with the balance and days overdue filled in',
  'Reliable cloud sync — customer name and payment method now always save to the cloud',
  'Sync alerts — a banner warns you if something saved on your device but didn\'t reach the cloud',
  'Cross-device store orders — orders sent from the Store Owner view now reach the driver on any device',
  'Stronger backups — exports now include every part of your data, including payments and signatures',
];

const SEEN_KEY = `${STORAGE_KEYS.WHATS_NEW_SEEN_PREFIX}${APP_VERSION}`;

export function hasSeenWhatsNew() {
  return !!localStorage.getItem(SEEN_KEY);
}

export function markWhatsNewSeen() {
  localStorage.setItem(SEEN_KEY, '1');
}

export default function WhatsNew({ onClose }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  function dismiss() {
    // localStorage write can throw (private mode / quota): worst case this modal
    // reappears after the next update, so the close below must still run.
    try { markWhatsNewSeen(); } catch { /* seen-flag is best-effort */ }
    onClose();
  }

  return (
    <div
      onClick={dismiss}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 10000,
        display: 'flex', alignItems: 'flex-end',
        animation: 'page-fade 0.2s ease both',
      }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
        width: '100%',
        background: C.card,
        borderRadius: '22px 22px 0 0',
        padding: '24px 20px',
        paddingBottom: 'max(28px, env(safe-area-inset-bottom))',
        animation: 'page-from-bottom 0.3s cubic-bezier(0.25,0.46,0.45,0.94) both',
        maxHeight: '85dvh',
        overflowY: 'auto',
      }}>
        {/* Handle */}
        <div style={{
          width: 36, height: 4, borderRadius: 2,
          background: C.divider,
          margin: '-8px auto 20px',
        }} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, flexShrink: 0,
            background: dark ? 'rgba(74,123,247,0.15)' : 'rgba(74,123,247,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, fontWeight: 800, color: ACCENT,
          }}>v{APP_VERSION}</div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.text }}>
              What's New in v{APP_VERSION}
            </div>
            <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
              Keiro just updated
            </div>
          </div>
        </div>

        {/* Changelog */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          {CHANGELOG.map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <span style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.5, flexShrink: 0 }}>—</span>
              <span style={{ fontSize: 14, color: C.text, lineHeight: 1.45 }}>{item}</span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <button
          onClick={dismiss}
          style={{
            width: '100%', height: 48,
            background: ACCENT, color: '#fff',
            border: 'none', borderRadius: 14,
            fontSize: 15, fontWeight: 700,
            cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
            boxShadow: '0 4px 14px rgba(74,123,247,0.4)',
          }}
        >
          Got it
        </button>
      </div>
    </div>
  );
}
