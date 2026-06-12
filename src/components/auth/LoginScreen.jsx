/**
 * LoginScreen — clean, minimal auth screen for Keiro.
 * Matches the dark/light theme from theme.js.
 */

import { useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { LIGHT, DARK, ACCENT } from '../../theme';
import KeiroWordmark from '../ui/KeiroWordmark';
import { signInWithEmail, signUpWithEmail, signInWithPasskey, isPasskeySupported } from '../../services/auth';

/**
 * @param {{ onLogin: function, onGuest?: function }} props
 */
export default function LoginScreen({ onLogin, onGuest }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  const [mode, setMode]         = useState('signin'); // 'signin' | 'signup'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Convert username → fake email Supabase accepts
  function toEmail(u) { return u.trim().toLowerCase() + '@invoicego.app'; }
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const passkeyAvailable = isPasskeySupported();

  /** Clears all app data but preserves theme preferences — used by test account. */
  function clearTestUserData() {
    const dark  = localStorage.getItem('inv_dark_mode');
    const color = localStorage.getItem('inv_accent_color');
    localStorage.clear();
    if (dark  !== null) localStorage.setItem('inv_dark_mode',  dark);
    if (color !== null) localStorage.setItem('inv_accent_color', color);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password) {
      setError('Please enter your username and password.'); return;
    }

    // ── Test account: username=test / password=test ──────────────────────────
    // DEV ONLY — gated behind import.meta.env.DEV so Vite strips this entire
    // branch from production builds. Bypasses Supabase auth to log in as a
    // fresh first-time local user (wipes app data, keeps theme). Never ships.
    if (import.meta.env.DEV && username.trim().toLowerCase() === 'test' && password === 'test') {
      clearTestUserData();
      onLogin({ id: 'test', email: 'test@invoicego.app' });
      return;
    }

    setLoading(true);
    try {
      let result;
      const email = toEmail(username);
      if (mode === 'signin') {
        result = await signInWithEmail(email, password);
      } else {
        result = await signUpWithEmail(email, password);
      }

      if (result.error) {
        setError(result.error.message || 'Something went wrong.');
      } else {
        onLogin(result.user);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handlePasskey() {
    setError('');
    setLoading(true);
    try {
      const { user, error: pkErr } = await signInWithPasskey();
      if (pkErr) {
        setError(pkErr.message || 'Passkey sign-in failed.');
      } else if (user) {
        onLogin(user);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ ...s.root, background: C.bg }}>
      <div style={{ ...s.card, background: C.card, border: `1px solid ${C.cardBorder}` }}>

        {/* App identity */}
        <div style={s.identity}>
          <KeiroWordmark C={C} style={{ fontSize: 34 }} />
          <span style={{ ...s.tagline, color: C.textMuted }}>Streamlining the way you do business.</span>
        </div>

        {/* Error banner */}
        {error && (
          <div style={{ ...s.banner, background: dark ? '#2d0a0a' : '#fef2f2', color: C.danger }}>
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={s.form}>
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            style={{ ...s.input, background: C.inputBg, border: `1px solid ${C.inputBorder}`, color: C.text }}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            style={{ ...s.input, background: C.inputBg, border: `1px solid ${C.inputBorder}`, color: C.text }}
          />

          <button
            type="submit"
            disabled={loading}
            style={{ ...s.primaryBtn, background: ACCENT, opacity: loading ? 0.7 : 1 }}
          >
            {loading ? 'Please wait…' : mode === 'signin' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        {/* Passkey button */}
        {passkeyAvailable && (
          <button
            onClick={handlePasskey}
            disabled={loading}
            style={{ ...s.secondaryBtn, background: C.nestedCard, color: C.textSub, border: `1px solid ${C.inputBorder}` }}
          >
            Use Face ID / Passkey
          </button>
        )}

        {/* Continue as guest — try the app with no account. Data stays on this
            device and is capped; creating an account later migrates it. */}
        {onGuest && (
          <>
            <div style={s.divider}>
              <span style={{ ...s.dividerLine, background: C.divider }} />
              <span style={{ color: C.textMuted, fontSize: 12, fontWeight: 600 }}>or</span>
              <span style={{ ...s.dividerLine, background: C.divider }} />
            </div>
            <button
              onClick={onGuest}
              style={{ ...s.secondaryBtn, background: C.nestedCard, color: C.text, border: `1px solid ${C.inputBorder}` }}
            >
              Continue as guest
            </button>
            <span style={{ ...s.tagline, color: C.textMuted, textAlign: 'center', fontSize: 12, marginTop: -6 }}>
              No account needed — save up to 5 entries on this device.
            </span>
          </>
        )}

        {/* Dev bypass — local development only. Creates a fake session whose
            cloud writes all fail RLS, so it must never ship to production. */}
        {import.meta.env.DEV && (
          <button
            onClick={() => onLogin({ id: 'dev', email: 'dev@invoicego.app' })}
            style={{ ...s.toggleBtn, color: C.textMuted, fontSize: 13, width: '100%', marginTop: -4 }}
          >
            Continue without account (dev)
          </button>
        )}

        {/* Toggle mode */}
        <div style={s.toggle}>
          <span style={{ color: C.textMuted, fontSize: 14 }}>
            {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}
          </span>
          {' '}
          <button
            style={{ ...s.toggleBtn, color: ACCENT }}
            onClick={() => { setMode(m => m === 'signin' ? 'signup' : 'signin'); setError(''); }}
          >
            {mode === 'signin' ? 'Create account' : 'Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
}

const s = {
  root: {
    width: '100%',
    minHeight: '100dvh',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px 16px',
    boxSizing: 'border-box',
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 20,
    padding: '36px 28px 32px',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  identity: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  appName: {
    fontSize: 34,
    fontWeight: 900,
    letterSpacing: '-1.5px',
    lineHeight: 1,
    fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif",
  },
  tagline: {
    fontSize: 14,
    fontWeight: 400,
  },
  banner: {
    borderRadius: 10,
    padding: '10px 14px',
    fontSize: 14,
    lineHeight: 1.5,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  input: {
    height: 48,
    borderRadius: 12,
    padding: '0 14px',
    fontSize: 16,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  primaryBtn: {
    height: 50,
    borderRadius: 14,
    border: 'none',
    color: '#fff',
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: 4,
    WebkitTapHighlightColor: 'transparent',
    transition: 'opacity 0.15s',
  },
  secondaryBtn: {
    height: 48,
    borderRadius: 14,
    fontSize: 16,
    fontWeight: 500,
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
    width: '100%',
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    margin: '2px 0',
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  toggle: {
    textAlign: 'center',
    marginTop: 4,
  },
  toggleBtn: {
    background: 'none',
    border: 'none',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    padding: 0,
    WebkitTapHighlightColor: 'transparent',
  },
};
