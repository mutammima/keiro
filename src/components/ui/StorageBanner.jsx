/**
 * StorageBanner — this phone's storage for Keiro is full (or nearly, for a guest).
 *
 * Listens for EVENTS.STORAGE_FULL / STORAGE_OK from utils/storageRoom.js. While
 * full it stays up — a save that did not happen is not something to forget —
 * and goes by itself once a later save succeeds. On mount it runs
 * checkStorageOnLaunch(): a signed-in user near the limit gets room freed
 * quietly; a guest near it is asked to create an account, since a guest's phone
 * is their only copy. Placed like SyncAttentionBanner (beneath every sheet,
 * z-index 150), one row higher so both can show at once.
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../../context/ThemeContext';
import { EVENTS } from '../../utils/constants';
import { isStorageFull, checkStorageOnLaunch } from '../../utils/storageRoom';
import { promptAccount } from '../../utils/guestMode';

export default function StorageBanner() {
  const { dark } = useTheme();
  const [full, setFull] = useState(() => isStorageFull());
  // The launch check runs once, as this state is created (it is idempotent, so
  // StrictMode's double call in development is harmless).
  const [guestNotice, setGuestNotice] = useState(() => checkStorageOnLaunch() === 'guest-near-full');

  useEffect(() => {
    const onFull = () => setFull(true);
    const onOk = () => setFull(false);
    window.addEventListener(EVENTS.STORAGE_FULL, onFull);
    window.addEventListener(EVENTS.STORAGE_OK, onOk);
    return () => {
      window.removeEventListener(EVENTS.STORAGE_FULL, onFull);
      window.removeEventListener(EVENTS.STORAGE_OK, onOk);
    };
  }, []);

  if (!full && !guestNotice) return null;

  const fg = dark ? '#fbbf24' : '#b45309';
  return createPortal(
    <div
      role="status"
      style={{
        ...s.bar,
        background: dark ? '#2a1500' : '#fff7ed',
        color: fg,
        border: `1px solid ${dark ? '#3a2000' : '#fed7aa'}`,
      }}
    >
      <span aria-hidden style={{ fontSize: 15, flexShrink: 0 }}>⚠</span>
      {full ? (
        <span style={{ flex: 1 }}>Not saved on this phone: Keiro's storage here is full.</span>
      ) : (
        <>
          <span style={{ flex: 1 }}>Create a free account so your invoices are backed up and this phone has room for more.</span>
          <button onClick={() => setGuestNotice(false)} style={{ ...s.btn, color: fg, border: 'none', padding: '0 6px' }}>Later</button>
          <button onClick={promptAccount} style={{ ...s.btn, color: fg, borderColor: fg }}>Create account</button>
        </>
      )}
    </div>,
    document.body
  );
}

const s = {
  bar: {
    position: 'fixed',
    // One row above SyncAttentionBanner (bottom + 52px) so both can show.
    bottom: 'calc(env(safe-area-inset-bottom, 0px) + 112px)',
    left: 'calc(var(--app-inset-left, 0px) + (100% - var(--app-inset-left, 0px)) / 2)',
    transform: 'translateX(-50%)',
    width: 'calc(100% - var(--app-inset-left, 0px) - 32px)',
    maxWidth: 420,
    zIndex: 150, // beneath sheets (200+), dialogs and the drawer (1500)
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 8px 8px 14px',
    borderRadius: 14,
    boxShadow: '0 8px 28px rgba(0,0,0,0.25)',
    fontSize: 13,
    fontWeight: 600,
  },
  btn: {
    minHeight: 44,
    padding: '0 14px',
    borderRadius: 10,
    border: '1px solid',
    background: 'transparent',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
    flexShrink: 0,
  },
};
