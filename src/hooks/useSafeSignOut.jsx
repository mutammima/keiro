/**
 * useSafeSignOut — the one path every sign-out button takes.
 *
 * Signing out clears every account-scoped `inv_*` key on the device, so the
 * next account doesn't inherit this one's data. That wipe includes the sync
 * queue and its set-aside list, and for a guest it is ALL their data. So before
 * signing out this tries to upload what's pending, and if anything still lives
 * only on this phone it asks first.
 *
 * Usage:
 *   const { requestSignOut, signOutPrompt } = useSafeSignOut();
 *   <button onClick={requestSignOut}>Sign Out</button>
 *   {signOutPrompt}
 *
 * @param {{ onSignedOut?: () => void }} [opts] - runs after a completed sign-out
 *   (default: reload, which lands on the welcome screen).
 */

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../context/ThemeContext';
import { LIGHT, DARK, ACCENT } from '../theme';
import { signOut } from '../services/auth';
import { processSyncQueue, getUnsyncedCount } from '../utils/syncQueue';
import { isGuest, guestEntryCount, promptAccount } from '../utils/guestMode';

export function useSafeSignOut({ onSignedOut = () => window.location.reload() } = {}) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;
  const [prompt, setPrompt] = useState(null); // { kind: 'unsynced' | 'guest', count }
  const [busy, setBusy] = useState(false);

  async function finish() {
    setBusy(true);
    await signOut();
    setPrompt(null);
    onSignedOut();
  }

  async function requestSignOut() {
    if (busy) return;
    if (isGuest()) {
      const count = guestEntryCount();
      if (count > 0) { setPrompt({ kind: 'guest', count }); return; }
      return finish();
    }
    setBusy(true);
    try { await processSyncQueue(); } catch { /* still unsynced — counted below */ }
    setBusy(false);
    const count = getUnsyncedCount();
    if (count > 0) { setPrompt({ kind: 'unsynced', count }); return; }
    return finish();
  }

  const plural = n => (n === 1 ? '' : 's');
  const text = !prompt ? null : prompt.kind === 'guest'
    ? {
        title: 'Delete everything on this phone?',
        body: `You're using Keiro without an account, so your ${prompt.count} saved entr${prompt.count === 1 ? 'y exists' : 'ies exist'} only on this phone. Signing out deletes them. Create an account to keep them.`,
        keep: 'Create an account', onKeep: promptAccount,
        leave: 'Delete and sign out',
      }
    : {
        title: 'Some changes aren\'t saved yet',
        body: `${prompt.count} change${plural(prompt.count)} ${prompt.count === 1 ? "hasn't" : "haven't"} been saved to your account yet. Signing out deletes ${prompt.count === 1 ? 'it' : 'them'} from this phone. Stay signed in and they'll upload when you're back online.`,
        keep: 'Stay signed in', onKeep: () => setPrompt(null),
        leave: 'Sign out anyway',
      };

  const signOutPrompt = text && createPortal(
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9500, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={() => !busy && setPrompt(null)}
    >
      <div
        role="alertdialog"
        aria-labelledby="safe-signout-title"
        style={{ width: '100%', maxWidth: 360, borderRadius: 18, border: `1px solid ${C.cardBorder}`, background: C.card, padding: '22px 20px 18px', boxShadow: '0 16px 48px rgba(0,0,0,0.35)' }}
        onClick={e => e.stopPropagation()}
      >
        <p id="safe-signout-title" style={{ fontSize: 17, fontWeight: 800, color: C.text, margin: '0 0 8px' }}>{text.title}</p>
        <p style={{ fontSize: 14, color: C.textSub, margin: '0 0 20px', lineHeight: 1.5 }}>{text.body}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button style={{ ...s.btn, border: 'none', background: ACCENT, color: '#fff' }} onClick={text.onKeep} disabled={busy}>
            {text.keep}
          </button>
          <button style={{ ...s.btn, border: `1px solid ${C.inputBorder}`, background: C.inputBg, color: C.danger }} onClick={finish} disabled={busy}>
            {busy ? 'Signing out…' : text.leave}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );

  return { requestSignOut, signOutPrompt, signingOut: busy };
}

const s = {
  btn: { height: 46, borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' },
};
