/**
 * syncNotify.js — bridges the non-React storage layer to a global UI toast.
 *
 * Critical cloud writes (invoice saves, payment logs, backups) call
 * notifySyncError() when a Supabase write fails so the user gets visible
 * feedback instead of a silent console.error. A <SyncToast/> mounted in App
 * listens for the event and renders the message.
 *
 * Data is already safe in localStorage; these messages tell the user whether it
 * has reached the cloud. The offline outbox (utils/syncQueue.js) also uses these
 * to confirm a successful drain or report an action it had to give up on.
 */

export const SYNC_ERROR_EVENT = 'inv-sync-error';
/** Fired by the retry queue when pending actions successfully drain. */
export const SYNC_OK_EVENT = 'inv-sync-ok';

/** Default message for a failed critical cloud write. Honest about retry:
 *  there is no background queue — new entries re-sync on the next signed-in
 *  app load (migration); nothing retries silently in the meantime. */
export const DEFAULT_SYNC_ERROR_MSG =
  'Saved on this device but could not reach the cloud. It will sync the next time you open the app signed in.';

/**
 * Dispatches a sync-error event that the global SyncToast renders.
 * Safe to call from non-React modules (storage helpers, hooks).
 * @param {string} [message] - User-facing message. Falls back to a default.
 */
export function notifySyncError(message = DEFAULT_SYNC_ERROR_MSG) {
  try {
    window.dispatchEvent(new CustomEvent(SYNC_ERROR_EVENT, { detail: { message } }));
  } catch {
    // SSR / no-DOM safety — nothing to do.
  }
}

/**
 * Confirms the retry queue drained `count` pending actions to the cloud.
 * @param {number} count
 */
export function notifySyncSuccess(count) {
  try {
    const n = Number(count) || 0;
    const message = `Synced ${n} pending ${n === 1 ? 'change' : 'changes'}.`;
    window.dispatchEvent(new CustomEvent(SYNC_OK_EVENT, { detail: { message, count: n } }));
  } catch {
    // SSR / no-DOM safety — nothing to do.
  }
}
