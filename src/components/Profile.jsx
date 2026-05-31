/**
 * Profile — lets the user see their account info and change email or password.
 */

import { useState, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
import { LIGHT, DARK, ACCENT, glassStyle } from '../theme';
import { supabase } from '../lib/supabase';
import { signOut } from '../lib/auth';
import AppFooter from './AppFooter';

export default function Profile({ onOpenDrawer, onNav }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  const [user, setUser]           = useState(null);
  const [newEmail, setNewEmail]   = useState('');
  const [newPw, setNewPw]         = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [msg, setMsg]             = useState('');
  const [err, setErr]             = useState('');
  const [loading, setLoading]     = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data?.user ?? null));
  }, []);

  // Derive display info — handle username@ fake emails transparently
  const rawEmail  = user?.email || '';
  const isGuest   = rawEmail === 'dev@invoicego.app' || !rawEmail;
  const username  = rawEmail.endsWith('@invoicego.app')
    ? rawEmail.replace('@invoicego.app', '')
    : rawEmail;

  function clear() { setMsg(''); setErr(''); }

  async function handleUpdateEmail(e) {
    e.preventDefault(); clear();
    if (!newEmail.trim()) return setErr('Enter a new email.');
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
    setLoading(false);
    if (error) setErr(error.message);
    else { setMsg('Email updated! Check your inbox to confirm.'); setNewEmail(''); }
  }

  async function handleUpdatePassword(e) {
    e.preventDefault(); clear();
    if (!newPw) return setErr('Enter a new password.');
    if (newPw !== confirmPw) return setErr('Passwords do not match.');
    if (newPw.length < 6) return setErr('Password must be at least 6 characters.');
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPw });
    setLoading(false);
    if (error) setErr(error.message);
    else { setMsg('Password updated successfully.'); setNewPw(''); setConfirmPw(''); }
  }

  async function handleSignOut() {
    await signOut();
    window.location.reload();
  }

  const inp = {
    background: C.inputBg, border: `1px solid ${C.inputBorder}`,
    color: C.text, height: 46, borderRadius: 12, padding: '0 14px',
    fontSize: 15, outline: 'none', width: '100%', boxSizing: 'border-box',
  };

  return (
    <div style={{ ...s.page, background: C.bg }}>

      {/* Header */}
      <div style={{ ...s.header, ...glassStyle(dark) }}>
        <button style={{ ...s.hamburger, color: C.text }} onClick={onOpenDrawer}>☰</button>
        <span style={{ ...s.title, color: C.text }}>Profile</span>
        <div style={{ width: 36 }} />
      </div>

      <div style={s.body}>

        {/* Account info card */}
        <div style={{ ...s.card, background: C.card }}>
          <p style={{ ...s.sectionLabel, color: C.textMuted }}>Account</p>
          <div style={s.infoRow}>
            <span style={{ ...s.infoLabel, color: C.textMuted }}>
              {rawEmail.endsWith('@invoicego.app') ? 'Username' : 'Email'}
            </span>
            <span style={{ ...s.infoValue, color: C.text }}>
              {isGuest ? 'Guest (not signed in)' : username}
            </span>
          </div>
          <div style={{ ...s.rule, background: C.divider }} />
          <div style={s.infoRow}>
            <span style={{ ...s.infoLabel, color: C.textMuted }}>User ID</span>
            <span style={{ ...s.infoValue, color: C.textMuted, fontSize: 11 }}>
              {user?.id ? user.id.slice(0, 16) + '…' : '—'}
            </span>
          </div>
          <div style={{ ...s.rule, background: C.divider }} />
          <div style={s.infoRow}>
            <span style={{ ...s.infoLabel, color: C.textMuted }}>Joined</span>
            <span style={{ ...s.infoValue, color: C.text }}>
              {user?.created_at ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—'}
            </span>
          </div>
        </div>

        {/* Guest notice */}
        {isGuest && (
          <div style={{ ...s.card, background: C.card }}>
            <p style={{ ...s.guestNote, color: C.textMuted }}>
              You're using guest mode. Create an account to sync your data across devices and never lose your invoices.
            </p>
            <button style={{ ...s.primaryBtn, background: ACCENT }} onClick={() => { signOut(); window.location.reload(); }}>
              Create Account / Sign In
            </button>
          </div>
        )}

        {/* Feedback banners */}
        {msg && <div style={{ ...s.banner, background: dark ? '#0D2B20' : '#f0fdf4', color: dark ? '#2ECC8A' : '#16a34a' }}>{msg}</div>}
        {err && <div style={{ ...s.banner, background: dark ? '#2d0a0a' : '#fef2f2', color: C.danger }}>{err}</div>}

        {/* Change email — only for real accounts */}
        {!isGuest && (
          <div style={{ ...s.card, background: C.card }}>
            <p style={{ ...s.sectionLabel, color: C.textMuted }}>Change Email</p>
            <form onSubmit={handleUpdateEmail} style={s.form}>
              <input
                style={inp}
                type="email"
                placeholder="New email address"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                autoComplete="email"
              />
              <button type="submit" disabled={loading} style={{ ...s.primaryBtn, background: ACCENT, opacity: loading ? 0.7 : 1 }}>
                {loading ? 'Saving…' : 'Update Email'}
              </button>
            </form>
          </div>
        )}

        {/* Change password — only for real accounts */}
        {!isGuest && (
          <div style={{ ...s.card, background: C.card }}>
            <p style={{ ...s.sectionLabel, color: C.textMuted }}>Change Password</p>
            <form onSubmit={handleUpdatePassword} style={s.form}>
              <input
                style={inp}
                type="password"
                placeholder="New password"
                value={newPw}
                onChange={e => setNewPw(e.target.value)}
                autoComplete="new-password"
              />
              <input
                style={inp}
                type="password"
                placeholder="Confirm new password"
                value={confirmPw}
                onChange={e => setConfirmPw(e.target.value)}
                autoComplete="new-password"
              />
              <button type="submit" disabled={loading} style={{ ...s.primaryBtn, background: ACCENT, opacity: loading ? 0.7 : 1 }}>
                {loading ? 'Saving…' : 'Update Password'}
              </button>
            </form>
          </div>
        )}

        {/* Sign out */}
        <button style={{ ...s.signOutBtn, color: C.danger, borderColor: C.divider }} onClick={handleSignOut}>
          Sign Out
        </button>

        <AppFooter onNav={onNav} />
      </div>
    </div>
  );
}

const s = {
  page: { minHeight: '100dvh', display: 'flex', flexDirection: 'column' },
  header: {
    padding: '14px 20px 12px',
    paddingTop: 'max(14px, env(safe-area-inset-top))',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  hamburger: {
    background: 'none', border: 'none', fontSize: 22,
    cursor: 'pointer', padding: '3px 4px',
    WebkitTapHighlightColor: 'transparent',
  },
  title: { fontSize: 17, fontWeight: 700, textAlign: 'center', flex: 1 },
  body: {
    padding: '12px 16px 88px',
    display: 'flex', flexDirection: 'column', gap: 10,
    maxWidth: 480, width: '100%', margin: '0 auto', boxSizing: 'border-box',
  },
  card: { borderRadius: 18, padding: '16px 18px' },
  sectionLabel: {
    fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.08em', margin: '0 0 12px',
  },
  infoRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '10px 0',
  },
  infoLabel: { fontSize: 13, fontWeight: 500 },
  infoValue: { fontSize: 13, fontWeight: 600, textAlign: 'right', maxWidth: '60%', wordBreak: 'break-all' },
  rule: { height: 1 },
  form: { display: 'flex', flexDirection: 'column', gap: 10 },
  primaryBtn: {
    width: '100%', height: 48, border: 'none', borderRadius: 14,
    fontSize: 15, fontWeight: 700, color: '#fff',
    cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
  },
  signOutBtn: {
    width: '100%', height: 48, background: 'none',
    border: '1px solid', borderRadius: 14,
    fontSize: 15, fontWeight: 600,
    cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
    transition: 'color 0.6s ease, border-color 0.6s ease',
  },
  banner: {
    borderRadius: 12, padding: '12px 16px',
    fontSize: 14, fontWeight: 500, lineHeight: 1.5,
  },
  guestNote: { fontSize: 14, lineHeight: 1.6, margin: '0 0 12px' },
};
