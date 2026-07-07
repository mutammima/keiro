/**
 * PinLock — shown on app open when PIN is enabled.
 * Also used for PIN setup from Settings.
 */

import { useState } from 'react';
import { STORAGE_KEYS } from '../../utils/constants';
import { useTheme } from '../../context/ThemeContext';
import { LIGHT, DARK } from '../../theme';

// ── PIN storage ──────────────────────────────────────────────────────────────
// The PIN is stored salted + SHA-256 hashed ("sha256:<salt>:<hex>"), never as
// plaintext — so a casual localStorage peek or an exported backup file doesn't
// reveal a code the user may reuse elsewhere. Honest scope: this is a client-
// side lock; with the hash in hand a 4-digit space is trivially brute-forceable,
// so it's a privacy deterrent, not real security. Legacy plaintext values (from
// older versions / restored backups) still verify and are upgraded in place on
// the first successful unlock.

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

/** Full-screen PIN entry. onSuccess called when correct PIN entered. */
export default function PinLock({ onSuccess, setupMode = false, onCancel }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;
  const [digits, setDigits] = useState('');
  const [confirm, setConfirm] = useState('');
  const [phase, setPhase] = useState('enter'); // 'enter' | 'confirm'
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);

  function triggerShake() {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  }

  // Verify-only entry. Setup mode is handled entirely by pressSetup below —
  // the old setup branch that lived here was unreachable.
  async function press(d) {
    const next = digits + d;
    setDigits(next);
    if (next.length === 4) {
      if (await verifyPin(next)) {
        onSuccess?.();
      } else {
        setError('Incorrect PIN');
        triggerShake();
        setTimeout(() => setDigits(''), 400);
      }
    }
  }

  function backspace() {
    setDigits(d => d.slice(0, -1));
    setError('');
  }

  // Confirm phase for setup
  async function handleSetupConfirm(input) {
    if (input === confirm) {
      await setPin(confirm); // hashed write must land before the lock closes
      onSuccess?.();
    } else {
      setError('PINs do not match. Try again.');
      triggerShake();
      setDigits(''); setConfirm(''); setPhase('enter');
    }
  }

  // Rewrite press for setup mode cleanly
  function pressSetup(d) {
    const next = digits + d;
    if (next.length > 4) return;
    setError('');
    if (phase === 'enter') {
      setDigits(next);
      if (next.length === 4) {
        setTimeout(() => { setConfirm(next); setPhase('confirm'); setDigits(''); }, 200);
      }
    } else {
      setDigits(next);
      if (next.length === 4) {
        setTimeout(() => handleSetupConfirm(next), 200);
      }
    }
  }

  const currentDigits = digits;
  const label = setupMode
    ? (phase === 'enter' ? 'Set a 4-digit PIN' : 'Confirm your PIN')
    : 'Enter PIN';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: dark ? '#000' : '#f0ede8',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 32,
      paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      <div style={{ fontSize: 17, fontWeight: 700, color: C.text }}>{label}</div>

      {/* Dots */}
      <div style={{
        display: 'flex', gap: 16,
        animation: shake ? 'pinShake 0.4s ease' : 'none',
      }}>
        <style>{`
          @keyframes pinShake {
            0%,100%{transform:translateX(0)}
            20%{transform:translateX(-8px)}
            40%{transform:translateX(8px)}
            60%{transform:translateX(-5px)}
            80%{transform:translateX(5px)}
          }
        `}</style>
        {[0,1,2,3].map(i => (
          <div key={i} style={{
            width: 16, height: 16, borderRadius: '50%',
            background: i < currentDigits.length
              ? 'var(--accent)'
              : (dark ? '#333' : '#d0ccc6'),
            transition: 'background 0.15s',
          }} />
        ))}
      </div>

      {error && <div style={{ fontSize: 13, color: '#ef4444', fontWeight: 500 }}>{error}</div>}

      {/* Numpad */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 72px)', gap: 12 }}>
        {/* The gap cell needs its own key: keying it by index (9) collided
            with the '9' digit button's key and spammed a React warning. */}
        {['1','2','3','4','5','6','7','8','9','','0','⌫'].map(k => (
          k === '' ? <div key="pad-gap" /> :
          <button
            key={k}
            onClick={() => k === '⌫' ? backspace() : (setupMode ? pressSetup(k) : press(k))}
            style={{
              height: 72, borderRadius: 36,
              background: k === '⌫' ? 'transparent' : (dark ? '#1c1c1e' : '#fff'),
              border: k === '⌫' ? 'none' : `1px solid ${dark ? '#2a2a2a' : '#e0ddd8'}`,
              fontSize: k === '⌫' ? 22 : 24,
              fontWeight: 500,
              color: C.text,
              cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
              boxShadow: k === '⌫' ? 'none' : `0 1px 3px rgba(0,0,0,${dark ? 0.3 : 0.08})`,
            }}
          >{k}</button>
        ))}
      </div>

      {onCancel && (
        <button onClick={onCancel} style={{ background:'none', border:'none', color: C.textMuted, fontSize: 14, cursor:'pointer' }}>
          Cancel
        </button>
      )}
    </div>
  );
}
