/**
 * LoginScreen — clean, minimal auth screen for InvoiceGo.
 * Matches the dark/light theme from theme.js.
 */

import { useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { LIGHT, DARK, ACCENT } from '../../theme';
import { signInWithEmail, signUpWithEmail, signInWithPasskey, isPasskeySupported } from '../../services/auth';

/**
 * @param {{ onLogin: function }} props
 */
export default function LoginScreen({ onLogin }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  const [mode, setMode]         = useState('signin'); // 'signin' | 'signup'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Convert username → fake email Supabase accepts
  function toEmail(u) { return u.trim().toLowerCase() + '@invoicego.app'; }
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [info, setInfo]         = useState('');

  const passkeyAvailable = isPasskeySupported();

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setInfo('');
    if (!username.trim() || !password) {
      setError('Please enter your username and password.'); return;
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
    setError(''); setInfo('');
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
          <span style={{ ...s.appName, color: C.text }}>InvoiceGo</span>
          <span style={{ ...s.tagline, color: C.textMuted }}>Delivery invoices, fast.</span>
        </div>

        {/* Info / error banners */}
        {info && (
          <div style={{ ...s.banner, background: C.successBg, color: C.successText }}>
            {info}
          </div>
        )}
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

        {/* Dev bypass */}
        <button
          onClick={() => onLogin({ id: 'dev', email: 'dev@invoicego.app' })}
          style={{ ...s.toggleBtn, color: C.textMuted, fontSize: 13, width: '100%', marginTop: -4 }}
        >
          Continue without account
        </button>

        {/* Toggle mode */}
        <div style={s.toggle}>
          <span style={{ color: C.textMuted, fontSize: 14 }}>
            {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}
          </span>
          {' '}
          <button
            style={{ ...s.toggleBtn, color: ACCENT }}
            onClick={() => { setMode(m => m === 'signin' ? 'signup' : 'signin'); setError(''); setInfo(''); }}
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
    height: '100dvh',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px 16px',
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
    fontSize: 28,
    fontWeight: 800,
    letterSpacing: '-0.02em',
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
    fontSize: 15,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  primaryBtn: {
    height: 50,
    borderRadius: 14,
    border: 'none',
    color: '#fff',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: 4,
    WebkitTapHighlightColor: 'transparent',
    transition: 'opacity 0.15s',
  },
  secondaryBtn: {
    height: 48,
    borderRadius: 14,
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
    width: '100%',
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
