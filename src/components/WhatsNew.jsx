/**
 * WhatsNew — modal shown once per app version after an update is applied.
 * Stores the last-seen version in localStorage so it only shows once.
 */

import { useTheme } from '../context/ThemeContext';
import { LIGHT, DARK, ACCENT } from '../theme';

export const APP_VERSION = '5.5';

const CHANGELOG = [
  { emoji: '🏠', text: 'New Dashboard — overview of balance, pinned stores & top products' },
  { emoji: '🌙', text: 'End of Day summary — today\'s invoices, collected & outstanding' },
  { emoji: '💬', text: 'WhatsApp share — one tap sends the invoice to your customer' },
  { emoji: '⚠️', text: 'Overdue flagging — unpaid invoices older than 7 days are highlighted' },
  { emoji: '✍️', text: 'Signature capture — sign invoices and embed in the PDF' },
  { emoji: '🔄', text: 'Instant updates — all devices now reload automatically when a new version is available' },
  { emoji: '📐', text: 'Slimmer bottom nav — takes much less screen space' },
];

const SEEN_KEY = `inv_whats_new_seen_${APP_VERSION}`;

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
    markWhatsNewSeen();
    onClose();
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.55)',
      zIndex: 10000,
      display: 'flex', alignItems: 'flex-end',
      animation: 'page-fade 0.2s ease both',
    }}>
      <div style={{
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
            fontSize: 22,
          }}>🎉</div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.text }}>
              What's New in v{APP_VERSION}
            </div>
            <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
              InvoiceGo just updated
            </div>
          </div>
        </div>

        {/* Changelog */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
          {CHANGELOG.map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span style={{ fontSize: 18, lineHeight: 1.3, flexShrink: 0 }}>{item.emoji}</span>
              <span style={{ fontSize: 14, color: C.text, lineHeight: 1.45 }}>{item.text}</span>
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
          Got it 🚀
        </button>
      </div>
    </div>
  );
}
