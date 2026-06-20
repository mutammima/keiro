/**
 * SyncToast — global toast for the cloud-sync state.
 *
 * Listens for two CustomEvents (see utils/syncNotify.js):
 *   • inv-sync-error → amber: a write saved locally but did not reach the cloud,
 *     or the retry queue gave up on an action.
 *   • inv-sync-ok    → green: the offline retry queue successfully drained
 *     pending changes ("Synced N pending changes").
 * Brief, non-blocking, auto-dismisses; tap to close early.
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../../context/ThemeContext';
import { SYNC_ERROR_EVENT, SYNC_OK_EVENT } from '../../utils/syncNotify';

export default function SyncToast() {
  const { dark } = useTheme();
  const [toast, setToast] = useState(null); // { kind: 'error' | 'ok', message }

  useEffect(() => {
    let timer;
    function show(kind, fallback) {
      return (e) => {
        setToast({ kind, message: e.detail?.message || fallback });
        clearTimeout(timer);
        timer = setTimeout(() => setToast(null), kind === 'ok' ? 4000 : 6000);
      };
    }
    const onError = show('error', 'Could not sync to the cloud.');
    const onOk    = show('ok', 'Synced pending changes.');
    window.addEventListener(SYNC_ERROR_EVENT, onError);
    window.addEventListener(SYNC_OK_EVENT, onOk);
    return () => {
      window.removeEventListener(SYNC_ERROR_EVENT, onError);
      window.removeEventListener(SYNC_OK_EVENT, onOk);
      clearTimeout(timer);
    };
  }, []);

  if (!toast) return null;

  const ok = toast.kind === 'ok';
  const palette = ok
    ? { bg: dark ? '#0D2B20' : '#f0fdf4', fg: dark ? '#2ECC8A' : '#16a34a', border: dark ? '#13402f' : '#bbf7d0', icon: '✓' }
    : { bg: dark ? '#2a1500' : '#fff7ed', fg: dark ? '#fbbf24' : '#b45309', border: dark ? '#3a2000' : '#fed7aa', icon: '⚠' };

  return createPortal(
    <div
      onClick={() => setToast(null)}
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
        background: palette.bg,
        color: palette.fg,
        border: `1px solid ${palette.border}`,
        boxShadow: '0 8px 28px rgba(0,0,0,0.25)',
        fontSize: 13,
        fontWeight: 500,
        lineHeight: 1.4,
        cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span style={{ fontSize: 15, flexShrink: 0, lineHeight: 1.3 }} aria-hidden>{palette.icon}</span>
      <span style={{ flex: 1 }}>{toast.message}</span>
    </div>,
    document.body
  );
}
