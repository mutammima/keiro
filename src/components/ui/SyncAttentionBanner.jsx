/**
 * SyncAttentionBanner — persistent notice for set-aside changes.
 *
 * The sync queue sets a change aside (utils/syncQueue.js) when the server has
 * rejected it MAX_RETRIES times. It is kept, not deleted, so this banner stays
 * up until the list is empty, and "Try again" puts those changes back in the
 * queue. Unlike SyncToast it never auto-dismisses: an unsaved change is not
 * something to forget about.
 * Uploads held for the free plan's limit show here too, with Upgrade.
 *
 * Sits above the bottom-pinned OfflineBanner (App.jsx) so both can show at once,
 * and BENEATH every bottom sheet, dialog and the drawer (z-index 150; sheets
 * start at 200), so an open sheet's backdrop covers it rather than the banner
 * covering the sheet's inputs and buttons. "Later" hides it until another
 * change is set aside or held.
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../../context/ThemeContext';
import { SYNC_ATTENTION_EVENT, getFailedSyncs, getHeldSyncs, retryFailedSyncs, processSyncQueue } from '../../utils/syncQueue';
import { EVENTS, PLAN_COPY } from '../../utils/constants';

export default function SyncAttentionBanner() {
  const { dark } = useTheme();
  const [count, setCount] = useState(() => getFailedSyncs().length);
  const [held, setHeld] = useState(() => getHeldSyncs().length);
  const [hiddenAt, setHiddenAt] = useState(null); // total when "Later" was tapped

  useEffect(() => {
    const refresh = () => {
      const n = getFailedSyncs().length;
      const h = getHeldSyncs().length;
      setCount(n);
      setHeld(h);
      if (n + h === 0) setHiddenAt(null); // a later one is news again
    };
    window.addEventListener(SYNC_ATTENTION_EVENT, refresh);
    return () => window.removeEventListener(SYNC_ATTENTION_EVENT, refresh);
  }, []);

  const total = count + held;
  if (total === 0 || (hiddenAt !== null && total <= hiddenAt)) return null;

  function tryAgain() {
    retryFailedSyncs();
    processSyncQueue();
  }

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
      <span style={{ flex: 1 }}>
        {count > 0 && `${count} change${count === 1 ? '' : 's'} couldn't be saved`}
        {count > 0 && held > 0 && ' · '}
        {held > 0 && PLAN_COPY.heldLine(held)}
      </span>
      <button onClick={() => setHiddenAt(total)} style={{ ...s.btn, color: fg, border: 'none', padding: '0 6px' }}>Later</button>
      {count > 0 && <button onClick={tryAgain} style={{ ...s.btn, color: fg, borderColor: fg }}>Try again</button>}
      {held > 0 && (
        <button onClick={() => window.dispatchEvent(new CustomEvent(EVENTS.OPEN_UPGRADE))} style={{ ...s.btn, color: fg, borderColor: fg }}>
          {PLAN_COPY.upgrade}
        </button>
      )}
    </div>,
    document.body
  );
}

const s = {
  bar: {
    position: 'fixed',
    // Above the OfflineBanner (bottom: 0, ~40px tall) so the two never overlap.
    bottom: 'calc(env(safe-area-inset-bottom, 0px) + 52px)',
    // Centered over the content column, past the desktop rail — as SyncToast.
    left: 'calc(var(--app-inset-left, 0px) + (100% - var(--app-inset-left, 0px)) / 2)',
    transform: 'translateX(-50%)',
    width: 'calc(100% - var(--app-inset-left, 0px) - 32px)',
    maxWidth: 420,
    zIndex: 150, // beneath sheets (200+), dialogs and the drawer (1500); see header
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
