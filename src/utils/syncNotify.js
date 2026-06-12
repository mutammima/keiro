/**
 * syncNotify.js — bridges the non-React storage layer to a global UI toast.
 *
 * Critical cloud writes (invoice saves, payment logs, backups) call
 * notifySyncError() when a Supabase write fails so the user gets visible
 * feedback instead of a silent console.error. A <SyncToast/> mounted in App
 * listens for the event and renders the message.
 *
 * This is feedback only — not a retry queue. Data is already safe in
 * localStorage; the message tells the user it hasn't reached the cloud yet.
 */

export const SYNC_ERROR_EVENT = 'inv-sync-error';

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
