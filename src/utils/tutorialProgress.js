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
 */
import { STORAGE_KEYS } from './constants';

const HOME_PULSE_KEY = STORAGE_KEYS.PULSE_HOME;

function getFlag(key) {
  try { return !!localStorage.getItem(key); } catch { return false; }
}
// Both writers swallow: these flags only drive a cosmetic pulse dot, and getFlag
// already returns false when storage is unavailable, so a failed write just
// leaves the dot in its current state rather than breaking the caller.
function setFlag(key) {
  try { localStorage.setItem(key, '1'); } catch { /* pulse flag is cosmetic */ }
}
function clearFlag(key) {
  try { localStorage.removeItem(key); } catch { /* pulse flag is cosmetic */ }
}

// ── Home pulse (post-tour nudge toward the dashboard) ──────────────────────
export function setHomePulse(on) { on ? setFlag(HOME_PULSE_KEY) : clearFlag(HOME_PULSE_KEY); }
export function isHomePulse()    { return getFlag(HOME_PULSE_KEY); }
