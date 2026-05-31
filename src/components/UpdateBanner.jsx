/**
 * UpdateBanner — shown when a new app version is ready to install.
 *
 * If the user is mid-invoice (isMidInvoice = true) they get:
 *   "Update Later"  — dismiss for now (banner won't reappear this session)
 *   "Update Now"    — applies update immediately
 *
 * Otherwise just "Update Now" and a dismiss option.
 */

import { useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import { LIGHT, DARK, ACCENT } from '../theme';

export default function UpdateBanner({ onUpdate, isMidInvoice }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 'max(14px, env(safe-area-inset-top))',
      left: 12, right: 12,
      zIndex: 9000,
      background: dark ? '#141414' : '#ffffff',
      border: `1px solid ${dark ? '#2a2a2a' : '#e4e4e7'}`,
      borderRadius: 18,
      padding: '14px 16px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      // Slide down from top
      animation: 'updateBannerIn 0.35s cubic-bezier(0.32,0.72,0,1) both',
    }}>
      <style>{`
        @keyframes updateBannerIn {
          from { opacity: 0; transform: translateY(-16px); }
          to   { opacity: 1; transform: translateY(0);     }
        }
      `}</style>

      {/* Icon + text */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        {/* Update icon */}
        <div style={{
          width: 38, height: 38, flexShrink: 0,
          borderRadius: 10,
          background: dark ? 'rgba(74,123,247,0.15)' : 'rgba(74,123,247,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18,
        }}>
          ↑
        </div>

        <div style={{ flex: 1 }}>
          <p style={{ color: C.text, fontSize: 14, fontWeight: 700, margin: '0 0 3px' }}>
            Update available
          </p>
          <p style={{ color: C.textMuted, fontSize: 13, margin: 0, lineHeight: 1.45 }}>
            {isMidInvoice
              ? "A new version of InvoiceGo is ready. Finish your invoice first, or update now."
              : "A new version of InvoiceGo is ready. Reload to get the latest features and fixes."}
          </p>
        </div>
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => setDismissed(true)}
          style={{
            flex: 1,
            height: 40, border: `1px solid ${C.divider}`,
            borderRadius: 11, background: C.nestedCard,
            color: C.textMuted, fontSize: 13, fontWeight: 600,
            cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
          }}
        >
          {isMidInvoice ? 'After invoice' : 'Later'}
        </button>

        <button
          onClick={onUpdate}
          style={{
            flex: 2,
            height: 40, border: 'none',
            borderRadius: 11, background: ACCENT,
            color: '#fff', fontSize: 13, fontWeight: 700,
            cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
            boxShadow: '0 3px 12px rgba(74,123,247,0.4)',
          }}
        >
          Update now
        </button>
      </div>
    </div>
  );
}
