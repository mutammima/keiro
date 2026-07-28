/**
 * pinStorage — PIN persistence + hashing, split out of the PinLock component.
 *
 * The PIN is stored salted + SHA-256 hashed ("sha256:<salt>:<hex>"), never as
 * plaintext — so a casual localStorage peek or an exported backup file doesn't
 * reveal a code the user may reuse elsewhere. Honest scope: this is a client-
 * side lock; with the hash in hand a 4-digit space is trivially brute-forceable,
 * so it's a privacy deterrent, not real security. Legacy plaintext values (from
 * older versions / restored backups) still verify and are upgraded in place on
 * the first successful unlock.
 *
 * Lives in utils/ (not in PinLock.jsx) so callers like App.jsx and Settings.jsx
 * can check/clear the PIN without importing the lock-screen React tree, and so
 * the component file exports only a component (react-refresh/only-export-components).
 */

import { STORAGE_KEYS } from './constants';

const HASH_PREFIX = 'sha256:';

async function hashPin(pin, salt) {
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function randomSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function isPinEnabled() {
  return !!localStorage.getItem(STORAGE_KEYS.PIN);
}

export async function verifyPin(pin) {
  const stored = localStorage.getItem(STORAGE_KEYS.PIN);
  if (!stored) return false;
  if (stored.startsWith(HASH_PREFIX)) {
    const [, salt, hex] = stored.split(':');
    try {
      return (await hashPin(pin, salt)) === hex;
    } catch {
      return false; // crypto.subtle unavailable — a hashed PIN can't verify without it
    }
  }
  // Legacy plaintext value — compare directly, then upgrade to hashed in place.
  const ok = stored === pin;
  if (ok) await setPin(pin);
  return ok;
}

export async function setPin(pin) {
  try {
    const salt = randomSalt();
    const hex = await hashPin(pin, salt);
    localStorage.setItem(STORAGE_KEYS.PIN, `${HASH_PREFIX}${salt}:${hex}`);
  } catch {
    // crypto.subtle needs a secure context (https/localhost — always true in
    // prod + dev). If it's ever missing, fall back to the old behavior rather
    // than brick the lock.
    localStorage.setItem(STORAGE_KEYS.PIN, pin);
  }
}

export function clearPin() {
  localStorage.removeItem(STORAGE_KEYS.PIN);
}
