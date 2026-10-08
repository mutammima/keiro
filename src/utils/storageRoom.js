/**
 * storageRoom.js — Keiro's guarded localStorage writes.
 *
 * localStorage gives the app about 5 MB, and a full one throws on write.
 * Before this module, lsSet and the sync queue caught that and only logged it,
 * so a save could vanish while the app carried on as if it had worked. Now:
 *
 *   writeLocal(key, text)  writes; on a quota error frees room (makeRoom) and
 *                          tries once more; if it still fails it returns false
 *                          and announces EVENTS.STORAGE_FULL (StorageBanner).
 *   makeRoom()             removes this phone's copies of signature images the
 *                          cloud is known to have, oldest first. Nothing else
 *                          is ever removed: not invoices, payments, the sync
 *                          queue, guest data, or a signature not yet uploaded.
 *
 * A signature counts as "in the cloud" only when its stored entry carries
 * syncedVersion === updatedAt. markSignatureSynced() stamps that after an upload
 * of exactly that version succeeds, and copies downloaded from the cloud arrive
 * stamped. Entries saved before this module existed carry no stamp and are
 * never removed. Removing an image leaves the signed-invoice index alone, so the
 * invoice still shows as signed and fetchSignatureFromCloud() brings the image
 * back when the invoice is opened.
 *
 * This module must never import storage.js: storage.js imports it.
 */

import { STORAGE_KEYS, EVENTS } from './constants';
import { isGuest } from './guestMode';

/** Browsers give an origin about 5 MB of localStorage and do not say exactly. */
export const STORAGE_BUDGET_BYTES = 5 * 1024 * 1024;
/** makeRoom() frees space until usage is under this share of the budget. */
export const MAKE_ROOM_TARGET = 0.7;
/** A guest is warned at this share: they have no cloud copy to fall back on. */
export const GUEST_WARN_AT = 0.8;

const SIG_PREFIX = STORAGE_KEYS.SIG_PREFIX;
// Exactly `inv_sig_<digits>`: the index key `inv_sig_index` shares the prefix.
const SIG_KEY = new RegExp(`^${SIG_PREFIX}(\\d+)$`);

let full = false;

export function isQuotaError(e) {
  if (!e) return false;
  return e.name === 'QuotaExceededError'
    || e.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    || e.code === 22
    || e.code === 1014;
}

/** Bytes in use, approximately: JS strings are UTF-16, two bytes a character. */
export function estimateUsage() {
  let chars = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) chars += k.length + (localStorage.getItem(k) || '').length;
    }
  } catch {
    return 0;
  }
  return chars * 2;
}

/** True after a write failed for lack of space, until one succeeds. */
export function isStorageFull() {
  return full;
}

function announce(name) {
  try { window.dispatchEvent(new CustomEvent(name)); } catch { /* no DOM */ }
}

function succeeded() {
  if (full) {
    full = false;
    announce(EVENTS.STORAGE_OK);
  }
  return true;
}

/**
 * Writes one localStorage value.
 * @param {string} key
 * @param {string} text  already serialised
 * @returns {boolean} whether it was written
 */
export function writeLocal(key, text) {
  try {
    localStorage.setItem(key, text);
    return succeeded();
  } catch (e) {
    if (!isQuotaError(e)) {
      console.error('localStorage write failed', key, e);
      return false;
    }
  }
  makeRoom();
  try {
    localStorage.setItem(key, text);
    return succeeded();
  } catch (e) {
    console.error('localStorage is full; not saved', key, e);
    full = true;
    announce(EVENTS.STORAGE_FULL);
    return false;
  }
}

/** Invoice numbers with a signature change still waiting to upload or set aside. */
function signaturesAwaitingUpload() {
  const waiting = new Set();
  for (const key of [STORAGE_KEYS.SYNC_QUEUE, STORAGE_KEYS.SYNC_FAILED]) {
    try {
      const list = JSON.parse(localStorage.getItem(key) || '[]');
      if (!Array.isArray(list)) continue;
      for (const a of list) {
        if (a?.type === 'sync_signature') waiting.add(Number(a.payload?.invoiceNumber));
      }
    } catch { /* unreadable: nothing known to be waiting there */ }
  }
  return waiting;
}

/**
 * Frees space by removing local copies of signature images the cloud is known
 * to have, oldest first, until usage is under `target` bytes.
 * @param {{ target?: number }} [opts]
 * @returns {number} approximate bytes freed
 */
export function makeRoom({ target = MAKE_ROOM_TARGET * STORAGE_BUDGET_BYTES } = {}) {
  if (isGuest()) return 0;
  let usage = estimateUsage();
  if (usage <= target) return 0;
  const waiting = signaturesAwaitingUpload();
  const candidates = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const m = key ? SIG_KEY.exec(key) : null;
      if (!m || waiting.has(Number(m[1]))) continue;
      const raw = localStorage.getItem(key) || '';
      let entry = null;
      try { entry = JSON.parse(raw); } catch { continue; }
      if (!entry?.updatedAt || entry.syncedVersion !== entry.updatedAt) continue;
      candidates.push({ key, bytes: (key.length + raw.length) * 2, at: Date.parse(entry.updatedAt) || 0 });
    }
  } catch {
    return 0;
  }
  candidates.sort((a, b) => a.at - b.at);
  let freed = 0;
  for (const c of candidates) {
    if (usage <= target) break;
    try {
      localStorage.removeItem(c.key);
      usage -= c.bytes;
      freed += c.bytes;
    } catch { /* leave it */ }
  }
  return freed;
}

/**
 * Records that the cloud holds this invoice's signatures as of `version` (the
 * entry's updatedAt when it was uploaded). Stamps nothing if the entry changed
 * since, so a newer, not-yet-uploaded signature is never taken for uploaded.
 * @param {number|string} invoiceNumber
 * @param {string} version
 */
export function markSignatureSynced(invoiceNumber, version) {
  if (!version) return;
  const key = SIG_PREFIX + invoiceNumber;
  try {
    const entry = JSON.parse(localStorage.getItem(key) || 'null');
    if (!entry || entry.updatedAt !== version || entry.syncedVersion === version) return;
    localStorage.setItem(key, JSON.stringify({ ...entry, syncedVersion: version }));
  } catch { /* a missed stamp only means this image is never removed */ }
}

/**
 * At launch: frees room early for a signed-in user near the limit, and says
 * whether a guest should be warned (nothing of a guest's is ever removed).
 * @param {{ budget?: number }} [opts]
 * @returns {'ok' | 'guest-near-full'}
 */
export function checkStorageOnLaunch({ budget = STORAGE_BUDGET_BYTES } = {}) {
  const usage = estimateUsage();
  if (isGuest()) return usage > GUEST_WARN_AT * budget ? 'guest-near-full' : 'ok';
  if (usage > MAKE_ROOM_TARGET * budget) makeRoom({ target: MAKE_ROOM_TARGET * budget });
  return 'ok';
}

/** Test-only: forget the "full" state between tests. */
export function _resetStorageRoomForTests() {
  full = false;
}
