/**
 * whatsNewState — the "have they seen this version's What's New?" flag.
 *
 * Split out of WhatsNew.jsx so the modal component and this state helper live in
 * separate files (react-refresh/only-export-components), and so callers like
 * App.jsx can read/set the flag without importing the modal's React tree.
 */

import { STORAGE_KEYS } from './constants';

export const APP_VERSION = '5.9';

const SEEN_KEY = `${STORAGE_KEYS.WHATS_NEW_SEEN_PREFIX}${APP_VERSION}`;

export function hasSeenWhatsNew() {
  return !!localStorage.getItem(SEEN_KEY);
}

export function markWhatsNewSeen() {
  localStorage.setItem(SEEN_KEY, '1');
}
