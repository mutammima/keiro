/**
 * AuthGate — wraps the entire app and shows the onboarding flow when needed.
 *
 * Flow:
 *  1. On mount, checks for an existing Supabase session.
 *  2. Renders the app when: a guest, OR a session that has finished onboarding.
 *  3. Otherwise renders the lazy-loaded OnboardingFlow (phone OTP signup).
 *  4. After onboarding (or the email/dev paths) → runs one-time migration.
 *  5. Subscribes to auth state changes for token expiry / sign-out.
 *
 * The session is established mid-flow (at OTP verify), so we gate the app on
 * onboarding-completion — not just the session — and treat any user with prior
 * local state (role / migration / onboarding flags) as already-onboarded so
 * existing logged-in users are completely unaffected.
 */

import { useState, useEffect, lazy, Suspense } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { LIGHT, DARK, ACCENT } from '../../theme';
import { getSession, onAuthStateChange, updatePassword } from '../../services/auth';
import { runMigrationIfNeeded } from '../../services/migration';
import { isGuest, enterGuest, exitGuest } from '../../utils/guestMode';

const OnboardingFlow = lazy(() => import('./OnboardingFlow'));

/** Existing users already carry local state from before the phone-OTP flow. */
function hasCompletedOnboarding() {
  try {
    return localStorage.getItem('inv_onboarding_done') === 'true'
        || !!localStorage.getItem('inv_user_role')
        || !!localStorage.getItem('inv_migrated_at')
        || localStorage.getItem('inv_onboarding_complete') === 'true';
  } catch { return false; }
}

export default function AuthGate({ children }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  const [session, setSession]           = useState(null);
  const [guest, setGuest]               = useState(() => isGuest());
  const [checking, setChecking]         = useState(true);
  const [ready, setReady]               = useState(false); // latched once onboarding completes
  const [recovery, setRecovery]         = useState(false); // arrived via a password-reset link
  const [migrating, setMigrating]       = useState(false);
  const [migrationMsg, setMigrationMsg] = useState('');

  // ── Check for existing session on mount ──────────────────────────────────
  useEffect(() => {
    getSession().then(s => { setSession(s); setChecking(false); });

    const unsubscribe = onAuthStateChange((event, s) => {
      if (event === 'SIGNED_OUT') { setSession(null); setReady(false); }
      else if (event === 'PASSWORD_RECOVERY') { setSession(s); setRecovery(true); }
      else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') setSession(s);
    });
    return unsubscribe;
  }, []);

  // ── Continue as guest — no account, local-only, capped ────────────────────
  function handleGuest() {
    enterGuest();
    setGuest(true);
  }

  // ── Onboarding complete (or email/dev sign-in) ────────────────────────────
  // Mirrors the previous handleLogin: supersede guest mode, show the app
  // immediately, and back up any local data in the background.
  async function handleAuthed(user) {
    exitGuest();
    setGuest(false);
    setSession(s => s || (user ? { user } : s));
    setReady(true);

    setMigrating(true);
    try {
      const result = await runMigrationIfNeeded();
      if (result.ran) {
        const { invoicesMigrated, productsMigrated, storesMigrated, ordersMigrated = 0, partial } = result;
        if (partial) {
          setMigrationMsg('We found new data from your last guest session. Syncing it to your account now.');
        } else {
          const parts = [];
          if (invoicesMigrated) parts.push(`${invoicesMigrated} invoices`);
          if (ordersMigrated)   parts.push(`${ordersMigrated} orders`);
          if (productsMigrated)  parts.push(`${productsMigrated} products`);
          if (storesMigrated)    parts.push(`${storesMigrated} stores`);
          setMigrationMsg(parts.length ? `Data backed up: ${parts.join(', ')}.` : '');
        }
        setTimeout(() => setMigrationMsg(''), 5000);
      }
    } catch (e) {
      console.error('Migration error', e);
    } finally {
      setMigrating(false);
    }
  }

  // ── Loading spinner ───────────────────────────────────────────────────────
  const loadingScreen = (
    <div style={{ minHeight: '100dvh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ color: C.textMuted, fontSize: 15 }}>Loading…</span>
    </div>
  );

  if (checking) return loadingScreen;

  // ── Arrived via a password-reset link → set the new password first ────────
  if (recovery) {
    return <SetNewPassword C={C} dark={dark} onDone={() => setRecovery(false)} />;
  }

  // ── Not onboarded → the sign-up flow (lazy chunk) ─────────────────────────
  const appReady = guest || ready || (!!session && hasCompletedOnboarding());
  if (!appReady) {
    return (
      <Suspense fallback={loadingScreen}>
        <OnboardingFlow session={session} onAuthed={handleAuthed} onGuest={handleGuest} />
      </Suspense>
    );
  }

  // ── Authenticated OR guest — render app ───────────────────────────────────
  return (
    <>
      {children}

      {/* Migration banner */}
      {migrationMsg && (
        <div style={{
          position: 'fixed',
          bottom: 'max(80px, env(safe-area-inset-bottom))',
          left: '50%',
          transform: 'translateX(-50%)',
          background: dark ? '#0D2B20' : '#f0fdf4',
          color: dark ? '#2ECC8A' : '#16a34a',
          borderRadius: 12,
          padding: '10px 18px',
          fontSize: 13,
          fontWeight: 500,
          zIndex: 9999,
          whiteSpace: 'nowrap',
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
        }}>
          {migrationMsg}
        </div>
      )}

      {/* Migration in-progress indicator */}
      {migrating && (
        <div style={{
          position: 'fixed',
          top: 'env(safe-area-inset-top, 0px)',
          left: 0,
          right: 0,
          height: 3,
          background: 'linear-gradient(90deg, #4A7BF7, #7B3FE4)',
          zIndex: 9999,
          animation: 'pulse 1s ease infinite',
        }} />
      )}
    </>
  );
}

// ── Set-new-password screen ───────────────────────────────────────────────────
// Shown when the app is opened from a password-reset email link (the link lands
// on the origin with a recovery session; supabase-js fires PASSWORD_RECOVERY).
// Full-screen and blocking on purpose: finishing the reset is the only sensible
// action mid-recovery.
function SetNewPassword({ C, dark, onDone }) {
  const [pw, setPw]           = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError]     = useState('');
  const [saving, setSaving]   = useState(false);

  async function save() {
    if (pw.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (pw !== confirm) { setError('Passwords do not match.'); return; }
    setError(''); setSaving(true);
    const { error: err } = await updatePassword(pw);
    setSaving(false);
    if (err) { setError(err.message || 'Could not update the password. Try again.'); return; }
    onDone();
  }

  const inputStyle = {
    height: 50, padding: '0 16px', fontSize: 16, borderRadius: 14,
    border: `1px solid ${C.inputBorder}`, background: C.inputBg, color: C.text,
    outline: 'none', WebkitAppearance: 'none', width: '100%', boxSizing: 'border-box',
  };

  return (
    <div style={{ minHeight: '100dvh', background: C.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 26 }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <h2 style={{ fontSize: 24, fontWeight: 800, color: C.text, margin: '0 0 8px', letterSpacing: '-0.01em' }}>Choose a new password</h2>
        <p style={{ fontSize: 14.5, color: C.textMuted, margin: '0 0 22px', lineHeight: 1.5 }}>
          You opened a password-reset link — set the new password for your account.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input value={pw} onChange={e => { setPw(e.target.value); setError(''); }} type="password" placeholder="New password" autoComplete="new-password" style={inputStyle} />
          <input value={confirm} onChange={e => { setConfirm(e.target.value); setError(''); }} type="password" placeholder="Confirm new password" autoComplete="new-password" onKeyDown={e => e.key === 'Enter' && save()} style={inputStyle} />
        </div>
        {error && <p style={{ fontSize: 13, color: dark ? '#f87171' : '#dc2626', fontWeight: 600, margin: '12px 0 0' }}>{error}</p>}
        <button
          onClick={save}
          disabled={saving}
          style={{
            marginTop: 20, height: 52, width: '100%', borderRadius: 26, border: 'none',
            background: ACCENT, color: '#fff', fontSize: 15.5, fontWeight: 700,
            cursor: 'pointer', WebkitTapHighlightColor: 'transparent', opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? 'Saving…' : 'Save new password'}
        </button>
      </div>
    </div>
  );
}
