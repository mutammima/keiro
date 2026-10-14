/**
 * tutorialProgress.js — persistent state for onboarding.
 *
 * STORAGE MODEL — every key is `inv_`-prefixed so the backup/restore sweep in
 * useBackup.js captures it automatically (no ALL_KEYS edit needed):
 *   inv_onboarding_complete   — the one-time tour finished or skipped (read via
 *                               useOnboarding.js; also read directly by
 *                               AuthGate.jsx and resolveStartupRole() — do not
 *                               rename without updating those too)
 *   inv_pulse_home            — show the post-tour pulse dot on the Home tab
 *   inv_tour_seen_full / inv_tour_seen_easy
 *                             — the driver tour for each mode has played once
 *                               (switching modes plays the other one once)
 */
import { STORAGE_KEYS } from './constants';

const HOME_PULSE_KEY = STORAGE_KEYS.PULSE_HOME;

function getFlag(key) {
  try { return !!localStorage.getItem(key); } catch { return false; }
}
// Both writers swallow: getFlag already returns false when storage is
// unavailable, so a failed write only means the pulse dot or a mode's tour
// shows again next launch — never a broken caller.
function setFlag(key) {
  try { localStorage.setItem(key, '1'); } catch { /* pulse flag is cosmetic */ }
}
function clearFlag(key) {
  try { localStorage.removeItem(key); } catch { /* pulse flag is cosmetic */ }
}

// ── Home pulse (post-tour nudge toward the dashboard) ──────────────────────
export function setHomePulse(on) { on ? setFlag(HOME_PULSE_KEY) : clearFlag(HOME_PULSE_KEY); }
export function isHomePulse()    { return getFlag(HOME_PULSE_KEY); }

// ── Per-mode driver tours (docs/specs/2026-10-14-easy-mode-design.md §4) ─────
const TOUR_SEEN_KEYS = { full: STORAGE_KEYS.TOUR_SEEN_FULL, easy: STORAGE_KEYS.TOUR_SEEN_EASY };

/**
 * Whether this device has seen the driver tour for `mode` ('full' | 'easy').
 * Finishing or skipping the original one-time tour counts as having seen the
 * full one — it predates per-mode tours.
 */
export function isTourSeen(mode) {
  if (getFlag(TOUR_SEEN_KEYS[mode])) return true;
  if (mode !== 'full') return false;
  try { return localStorage.getItem(STORAGE_KEYS.ONBOARDING_DONE) === 'true'; } catch { return false; }
}

export function markTourSeen(mode) { setFlag(TOUR_SEEN_KEYS[mode]); }

/** Whether a driver should get `mode`'s tour now (store owners have no modes). */
export function pendingModeTour(role, mode) {
  return role !== 'store_owner' && !isTourSeen(mode);
}
