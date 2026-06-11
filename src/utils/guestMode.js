/**
 * guestMode.js — freemium "guest" access for Keiro.
 *
 * A guest can use the whole app without an account. Their data lives ONLY in
 * localStorage (cloud writes fail RLS silently for an unauthenticated user),
 * so it is not backed up and does not sync across devices. To remove those
 * limits — and to unlock cloud-backed analytics — they create an account, at
 * which point `services/migration.js` uploads everything they made as a guest.
 *
 * Two hard limits while in guest mode:
 *   1. Saved entries are capped at GUEST_ENTRY_CAP (invoices + store orders).
 *   2. Cloud-only dashboard/analytics features are surfaced but locked.
 *
 * Guest state is a single localStorage flag (inv_guest_mode). It is cleared the
 * moment a real session is established (see AuthGate.handleLogin → exitGuest()).
 */

const GUEST_KEY = 'inv_guest_mode';

/** Max number of saved entries a guest may keep before an account is required. */
export const GUEST_ENTRY_CAP = 5;

/** localStorage lists that count toward a guest's saved-entry total. */
const ENTRY_KEYS = ['inv_list', 'inv_so_orders'];

export function isGuest() {
  try { return localStorage.getItem(GUEST_KEY) === 'true'; } catch { return false; }
}

export function enterGuest() {
  try { localStorage.setItem(GUEST_KEY, 'true'); } catch (e) { console.error('enterGuest failed', e); }
}

export function exitGuest() {
  try { localStorage.removeItem(GUEST_KEY); } catch (e) { console.error('exitGuest failed', e); }
}

function listLength(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(v) ? v.length : 0;
  } catch { return 0; }
}

/** Total entries a guest has saved locally (invoices + store-owner orders). */
export function guestEntryCount() {
  return ENTRY_KEYS.reduce((sum, k) => sum + listLength(k), 0);
}

/**
 * Whether the user may save another entry right now.
 * Always true for signed-in users; gated by the cap for guests.
 */
export function canSaveGuestEntry() {
  return !isGuest() || guestEntryCount() < GUEST_ENTRY_CAP;
}

/**
 * Leave guest mode and hand the user to the auth screen so they can create an
 * account / sign in. Their local data is preserved and will migrate on sign-up.
 * AuthGate renders LoginScreen whenever there is no session and no guest flag,
 * so clearing the flag + reloading lands them on the sign-up screen.
 */
export function promptAccount() {
  exitGuest();
  window.location.reload();
}
