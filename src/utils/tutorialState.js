/**
 * tutorialState.js — lets data-layer code know an onboarding tutorial is
 * driving the UI, so demo actions stay private to this account.
 *
 * The tutorials submit REAL forms (intentional — the user keeps the demo
 * order/driver as starter data), but anything that would publish to a
 * SHARED, cross-user surface (marketplace demand) must be suppressed, or
 * every new user's tour spams the network with junk rows.
 */

let active = false;

export function setTutorialActive(on) {
  active = !!on;
}

export function isTutorialActive() {
  return active;
}
