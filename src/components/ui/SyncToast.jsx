/**
 * SyncToast — global toast that surfaces failed critical cloud writes.
 *
 * Listens for the `inv-sync-error` CustomEvent (see utils/syncNotify.js) and
 * shows a brief, non-blocking banner so the user knows their data saved locally
 * but did not reach the cloud. Auto-dismisses; tap to close early.
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../../context/ThemeContext';
import { SYNC_ERROR_EVENT } from '../../utils/syncNotify';

export default function SyncToast() {
  const { dark } = useTheme();
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    let timer;
    function handler(e) {
      setMsg(e.detail?.message || 'Could not sync to the cloud.');
      clearTimeout(timer);
      timer = setTimeout(() => setMsg(null), 6000);
    }
    window.addEventListener(SYNC_ERROR_EVENT, handler);
    return () => { window.removeEventListener(SYNC_ERROR_EVENT, handler); clearTimeout(timer); };
  }, []);

  if (!msg) return null;

  return createPortal(
    <div
      onClick={() => setMsg(null)}
      style={{
        position: 'fixed',
        top: 'max(12px, env(safe-area-inset-top))',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'calc(100% - 32px)',
        maxWidth: 420,
        zIndex: 9000,
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '12px 14px',
        borderRadius: 14,
        background: dark ? '#2a1500' : '#fff7ed',
        color: dark ? '#fbbf24' : '#b45309',
        border: `1px solid ${dark ? '#3a2000' : '#fed7aa'}`,
        boxShadow: '0 8px 28px rgba(0,0,0,0.25)',
        fontSize: 13,
        fontWeight: 500,
        lineHeight: 1.4,
        cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span style={{ fontSize: 15, flexShrink: 0, lineHeight: 1.3 }} aria-hidden>⚠️</span>
      <span style={{ flex: 1 }}>{msg}</span>
    </div>,
    document.body
  );
}
