/**
 * PinLock — shown on app open when PIN is enabled.
 * Also used for PIN setup from Settings.
 */

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../../context/ThemeContext';
import { LIGHT, DARK } from '../../theme';
import { verifyPin, setPin } from '../../utils/pinStorage';

// PIN persistence + hashing now live in utils/pinStorage.js (isPinEnabled,
// verifyPin, setPin, clearPin) so this file exports only the component.

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

  // Portal to document.body: an overlay-page ancestor uses overflowX:'hidden',
  // which on iOS becomes a containing block that traps this position:fixed layer
  // (invisible but tap-swallowing → app looks frozen). CLAUDE.md "Bug A".
  return createPortal(
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
            aria-label={k === '⌫' ? 'Delete last digit' : undefined}
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
    </div>,
    document.body
  );
}
