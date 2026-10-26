/**
 * DeleteAccountSheet — deletes the signed-in account from inside the app
 * (Apple 5.1.1(v)). Spec: docs/specs/2026-10-26-account-deletion.md.
 *
 * Says what goes (including what connected stores or drivers lose), offers a
 * backup of this phone's data, and only enables the red button once DELETE is
 * typed: a Google account has no password to ask for. The server deletes
 * everything at once (no grace period); this phone's data is cleared only
 * after it confirms. Opened from Settings → Security & Permissions and from
 * Profile, for signed-in accounts only.
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../../context/ThemeContext';
import { LIGHT, DARK } from '../../theme';
import { deleteAccount } from '../../services/auth';
import { getActiveConnections } from '../../utils/connectionStorage';
import { isPro } from '../../utils/plan';
import { useBackup } from '../../hooks/useBackup';
import { STORAGE_KEYS, CONTACT_EMAIL } from '../../utils/constants';

const CONFIRM_WORD = 'DELETE';

function currentRole() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.USER_ROLE)); } catch { return null; }
}

export default function DeleteAccountSheet({ onClose, onDeleted = () => window.location.reload() }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;
  const { backupMsg, handleExport } = useBackup();
  const [typed, setTyped] = useState('');
  const [state, setState] = useState('idle'); // idle | deleting | failed | unavailable | done

  // Read once: what the person is about to lose doesn't change while the sheet is open.
  const [{ role, connected, pro }] = useState(() => ({
    role: currentRole(),
    connected: getActiveConnections().length,
    pro: isPro(),
  }));

  const busy = state === 'deleting' || state === 'done';
  const confirmed = typed.trim().toUpperCase() === CONFIRM_WORD;

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  async function confirm() {
    if (!confirmed || busy) return;
    setState('deleting');
    const { error, unavailable } = await deleteAccount();
    if (error) { setState(unavailable ? 'unavailable' : 'failed'); return; }
    setState('done');
    setTimeout(onDeleted, 1500);
  }

  const lose = role === 'store_owner'
    ? `The ${connected} driver${connected === 1 ? '' : 's'} you're connected to will lose the orders you sent them.`
    : `The ${connected} store${connected === 1 ? '' : 's'} you're connected to will lose the invoices you sent them.`;

  return createPortal(
    <div style={s.backdrop} onClick={() => { if (!busy) onClose(); }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-account-title"
        style={{ ...s.sheet, '--sheet-border-c': C.cardBorder, background: C.card, border: `1px solid ${C.cardBorder}` }}
        onClick={(e) => e.stopPropagation()}
      >
        {state === 'done' ? (
          <p id="delete-account-title" role="status" style={{ ...s.title, color: C.text, margin: '8px 0' }}>Your account was deleted.</p>
        ) : (
          <>
            <p id="delete-account-title" style={{ ...s.title, color: C.text }}>Delete your Keiro account?</p>
            <p style={{ ...s.text, color: C.textSub }}>
              This deletes your account and everything in it: invoices, payments, signatures, products, stores and
              orders, in the cloud and on this phone. It happens at once and can't be undone.
            </p>
            {connected > 0 && <p style={{ ...s.text, color: C.textSub }}>{lose}</p>}
            {pro && <p style={{ ...s.text, color: C.textSub }}>Your Pro plan ends.</p>}

            <button type="button" style={{ ...s.linkBtn, color: C.textSub }} onClick={handleExport} disabled={busy}>
              Back up this phone&apos;s data first
            </button>
            {backupMsg && <p style={{ ...s.note, color: C.textMuted }}>{backupMsg}</p>}

            <label htmlFor="delete-account-confirm" style={{ ...s.label, color: C.textMuted }}>
              Type {CONFIRM_WORD} to confirm
            </label>
            <input
              id="delete-account-confirm"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              disabled={busy}
              style={{ ...s.input, background: C.inputBg, border: `1px solid ${C.inputBorder}`, color: C.text }}
            />

            {state === 'failed' && (
              <p role="alert" style={{ ...s.note, color: C.danger }}>
                Couldn&apos;t delete your account. Nothing was deleted. Check your connection and try again.
              </p>
            )}
            {state === 'unavailable' && (
              <p role="alert" style={{ ...s.note, color: C.danger }}>
                Deleting your account from the app isn&apos;t available yet, so nothing was deleted. Email {CONTACT_EMAIL} and it
                will be deleted for you.
              </p>
            )}

            <div style={s.row}>
              <button type="button" style={{ ...s.btn, background: C.inputBg, border: `1px solid ${C.inputBorder}`, color: C.text }} onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button
                type="button"
                style={{ ...s.btn, border: 'none', background: C.danger, color: '#fff', opacity: confirmed && !busy ? 1 : 0.45 }}
                onClick={confirm}
                disabled={!confirmed || busy}
              >
                {state === 'deleting' ? 'Deleting…' : 'Delete account'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

const s = {
  backdrop: { position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'var(--sheet-align, flex-end)', justifyContent: 'center' },
  // --sheet-* turn the bottom sheet into a centered dialog at desktop width (App.css).
  sheet: {
    width: '100%', maxWidth: 480, maxHeight: '90dvh', overflowY: 'auto', boxSizing: 'border-box',
    borderRadius: 'var(--sheet-radius-18, 18px 18px 0 0)', borderBottom: 'var(--sheet-border-b, none)',
    padding: '20px 20px max(20px, env(safe-area-inset-bottom))', boxShadow: '0 -16px 48px rgba(0,0,0,0.35)',
  },
  title: { fontSize: 17, fontWeight: 800, margin: '0 0 10px' },
  text: { fontSize: 14, lineHeight: 1.5, margin: '0 0 10px' },
  note: { fontSize: 13, lineHeight: 1.5, margin: '0 0 10px' },
  linkBtn: { background: 'none', border: 'none', padding: '6px 0', minHeight: 44, fontSize: 14, fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', textAlign: 'left', WebkitTapHighlightColor: 'transparent' },
  label: { display: 'block', fontSize: 13, fontWeight: 600, margin: '8px 0 6px' },
  input: { width: '100%', height: 46, borderRadius: 12, padding: '0 14px', fontSize: 16, outline: 'none', boxSizing: 'border-box', marginBottom: 12, letterSpacing: '0.08em' },
  row: { display: 'flex', gap: 10, marginTop: 4 },
  btn: { flex: 1, height: 48, borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' },
};
