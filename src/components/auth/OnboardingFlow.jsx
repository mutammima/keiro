/**
 * OnboardingFlow — the phone-OTP signup / sign-in experience that replaces the
 * old LoginScreen. Five forward-and-back screens with a 3-dot progress indicator:
 *
 *   1. Welcome   — splash + Get started / Log in / (de-emphasized) Try as guest
 *   2. Phone     — US phone entry → sends an SMS code (signInWithOtp)
 *   3. Verify    — 6-box OTP → verifyOtp establishes the session
 *   4. About you — name / email / role / conditional store|business name → profiles
 *   5. Plan      — Basic (free, selected); Pro/Business "coming soon" → into the app
 *
 * Lazy-loaded by AuthGate so none of this is in the main bundle. The session is
 * created at screen 3; AuthGate keeps showing this flow until onboarding is
 * complete (it gates on profile/role, not just the session).
 *
 * A discreet email/password fallback (existing accounts) and a DEV-only bypass
 * are reachable from the Welcome screen.
 */

import { useState, useEffect, useRef } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { LIGHT, DARK, ACCENT } from '../../theme';
import KeiroWordmark from '../ui/KeiroWordmark';
import {
  sendPhoneOtp, verifyPhoneOtp, fetchProfile, saveProfile,
  signInWithEmail, signUpWithEmail,
} from '../../services/auth';
import { setRole } from '../../utils/storeOwnerStorage';
import { getBusinessName, saveBusinessName } from '../../utils/storage';

// inv_-prefixed so the backup sweep captures them automatically.
const PLAN_KEY = 'inv_plan';
const ONBOARDING_DONE_KEY = 'inv_onboarding_done';

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatUSPhone(raw) {
  const d = String(raw).replace(/\D/g, '').slice(0, 10);
  if (d.length === 0) return '';
  if (d.length < 4)  return `(${d}`;
  if (d.length < 7)  return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

function friendlyAuthError(error) {
  const m = (error?.message || '').toLowerCase();
  if (m.includes('invalid') && m.includes('token')) return 'That code was incorrect. Check it and try again.';
  if (m.includes('expired')) return 'That code expired. Tap Resend for a new one.';
  if (m.includes('rate') || m.includes('too many')) return 'Too many attempts. Please wait a moment and try again.';
  return null;
}

// ── Shared UI ────────────────────────────────────────────────────────────────
function ProgressDots({ active, total, accent, C }) {
  return (
    <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} style={{
          width: i === active ? 22 : 7, height: 7, borderRadius: 4,
          background: i === active ? accent : C.divider,
          transition: 'width 0.25s ease, background 0.25s ease',
        }} />
      ))}
    </div>
  );
}

function Header({ onBack, active, totalDots, accent, C }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '8px 16px 4px', paddingTop: 'max(14px, env(safe-area-inset-top))',
      flexShrink: 0,
    }}>
      <button onClick={onBack} aria-label="Back" style={{
        width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'none',
        color: C.text, fontSize: 22, cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>←</button>
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
        {active != null && <ProgressDots active={active} total={totalDots} accent={accent} C={C} />}
      </div>
      <div style={{ width: 40, flexShrink: 0 }} />
    </div>
  );
}

function PrimaryButton({ onClick, disabled, loading, children, accent }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        width: '100%', height: 52, borderRadius: 16, border: 'none',
        background: accent, color: '#fff', fontSize: 16, fontWeight: 700,
        cursor: disabled || loading ? 'default' : 'pointer',
        opacity: disabled ? 0.45 : 1, WebkitTapHighlightColor: 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        boxShadow: disabled ? 'none' : `0 6px 18px ${accent}40`,
        transition: 'opacity 0.15s',
      }}
    >
      {loading && <Spinner />}
      {loading ? 'Please wait…' : children}
    </button>
  );
}

function Spinner() {
  return (
    <span aria-hidden style={{
      width: 16, height: 16, borderRadius: '50%',
      border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff',
      display: 'inline-block', animation: 'tut-spin 0.7s linear infinite',
    }} />
  );
}

function ErrorText({ children, C }) {
  if (!children) return null;
  return <p style={{ color: C.danger, fontSize: 13.5, lineHeight: 1.5, margin: '10px 2px 0' }}>{children}</p>;
}

function FieldLabel({ children, C }) {
  return <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.textSub, margin: '0 2px 6px' }}>{children}</label>;
}

function textInputStyle(C) {
  return {
    width: '100%', boxSizing: 'border-box', height: 52, fontSize: 16,
    padding: '0 16px', borderRadius: 14, outline: 'none', WebkitAppearance: 'none',
    background: C.inputBg, border: `1px solid ${C.inputBorder}`, color: C.text,
  };
}

// Each screen mounts inside this so a step change re-animates.
function Screen({ children, C }) {
  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      background: C.bg, animation: 'tut-fadein 0.3s ease both',
    }}>
      {children}
    </div>
  );
}

function Body({ children }) {
  return (
    <div style={{
      flex: 1, overflowY: 'auto', overflowX: 'clip',
      display: 'flex', flexDirection: 'column',
      padding: '16px 22px max(24px, env(safe-area-inset-bottom))',
      maxWidth: 480, width: '100%', margin: '0 auto', boxSizing: 'border-box',
    }}>
      {children}
    </div>
  );
}

// ── Screen 1: Welcome ────────────────────────────────────────────────────────
function WelcomeScreen({ onStart, onEmail, onGuest, onDev, C }) {
  return (
    <Screen C={C}>
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
        textAlign: 'center', padding: '0 26px max(26px, env(safe-area-inset-bottom))',
        maxWidth: 480, width: '100%', margin: '0 auto', boxSizing: 'border-box',
      }}>
        {/* Upper half — brand */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, paddingTop: 'max(40px, env(safe-area-inset-top))' }}>
          <KeiroWordmark C={C} style={{ fontSize: 52 }} />
          <div>
            <h1 style={{ fontSize: 30, fontWeight: 900, color: C.text, margin: '0 0 10px', letterSpacing: '-0.02em', lineHeight: 1.15 }}>
              Move smarter.<br />Connect faster.
            </h1>
            <p style={{ fontSize: 15, color: C.textMuted, margin: 0, lineHeight: 1.5 }}>
              Connecting drivers and stores on every route.
            </p>
          </div>
        </div>

        {/* Lower — actions */}
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <PrimaryButton onClick={onStart} accent={ACCENT}>Get started</PrimaryButton>
          <button onClick={onEmail} style={{
            background: 'none', border: 'none', color: C.textSub, fontSize: 14.5, fontWeight: 600,
            cursor: 'pointer', padding: '6px', WebkitTapHighlightColor: 'transparent',
          }}>
            Already have an account? <span style={{ color: ACCENT }}>Log in</span>
          </button>
          <button onClick={onGuest} style={{
            background: 'none', border: 'none', color: C.textMuted, fontSize: 12.5, fontWeight: 500,
            cursor: 'pointer', padding: '2px', marginTop: 2, WebkitTapHighlightColor: 'transparent',
            opacity: 0.8,
          }}>
            Try as guest
          </button>
          {onDev && (
            <button onClick={onDev} style={{
              background: 'none', border: 'none', color: C.textMuted, fontSize: 11, cursor: 'pointer',
              padding: 0, opacity: 0.5, WebkitTapHighlightColor: 'transparent',
            }}>
              Continue without account (dev)
            </button>
          )}
        </div>
      </div>
    </Screen>
  );
}

// ── Screen 2: Phone ──────────────────────────────────────────────────────────
function PhoneScreen({ phoneDigits, setPhoneDigits, onBack, onSent, C }) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const valid = phoneDigits.length === 10;

  async function send() {
    if (!valid || loading) return;
    setError(''); setLoading(true);
    const { error: err } = await sendPhoneOtp('+1' + phoneDigits);
    if (err) {
      setError('We could not send a code to that number. Please check it and try again.');
      setLoading(false);
    } else {
      onSent(); // advance — leave loading on until unmount
    }
  }

  return (
    <Screen C={C}>
      <Header onBack={onBack} active={0} totalDots={3} accent={ACCENT} C={C} />
      <Body>
        <h2 style={{ fontSize: 26, fontWeight: 800, color: C.text, margin: '14px 0 8px', letterSpacing: '-0.01em' }}>What&apos;s your number?</h2>
        <p style={{ fontSize: 15, color: C.textMuted, margin: '0 0 26px', lineHeight: 1.5 }}>We&apos;ll text you a code to verify.</p>

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, height: 52, padding: '0 14px',
            borderRadius: 14, background: C.inputBg, border: `1px solid ${C.inputBorder}`,
            color: C.text, fontSize: 16, fontWeight: 600, flexShrink: 0,
          }}>
            <span aria-hidden style={{ fontSize: 18 }}>🇺🇸</span> +1
          </div>
          <input
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            autoFocus
            placeholder="(555) 123-4567"
            value={formatUSPhone(phoneDigits)}
            onChange={(e) => { setPhoneDigits(e.target.value.replace(/\D/g, '').slice(0, 10)); setError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
            style={{ ...textInputStyle(C), flex: 1, fontSize: 18, fontWeight: 600, letterSpacing: '0.02em' }}
          />
        </div>

        <ErrorText C={C}>{error}</ErrorText>

        <div style={{ flex: 1 }} />

        <PrimaryButton onClick={send} disabled={!valid} loading={loading} accent={ACCENT}>Send code</PrimaryButton>
        <p style={{ fontSize: 11.5, color: C.textMuted, textAlign: 'center', margin: '12px 0 0', lineHeight: 1.5 }}>
          By continuing you agree to our{' '}
          <a href="#" onClick={(e) => e.preventDefault()} style={{ color: C.textSub, textDecoration: 'underline' }}>Terms</a> and{' '}
          <a href="#" onClick={(e) => e.preventDefault()} style={{ color: C.textSub, textDecoration: 'underline' }}>Privacy Policy</a>.
        </p>
      </Body>
    </Screen>
  );
}

// ── Screen 3: Verify OTP ─────────────────────────────────────────────────────
function OtpScreen({ fullPhone, displayPhone, onBack, onVerified, C }) {
  const [digits, setDigits]   = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [seconds, setSeconds] = useState(30);
  const inputs = useRef([]);
  const code = digits.join('');
  const complete = code.length === 6;

  useEffect(() => { inputs.current[0]?.focus(); }, []);
  useEffect(() => {
    if (seconds <= 0) return;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  function setDigit(i, val) {
    const ds = val.replace(/\D/g, '');
    if (ds.length > 1) { // paste / OS autofill of the whole code
      const arr = [...digits];
      for (let k = 0; k < ds.length && i + k < 6; k++) arr[i + k] = ds[k];
      setDigits(arr);
      inputs.current[Math.min(i + ds.length, 5)]?.focus();
      setError('');
      return;
    }
    const arr = [...digits];
    arr[i] = ds;
    setDigits(arr);
    setError('');
    if (ds && i < 5) inputs.current[i + 1]?.focus();
  }

  function onKey(i, e) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) inputs.current[i - 1]?.focus();
  }

  async function verify() {
    if (!complete || loading) return;
    setError(''); setLoading(true);
    const { user, error: err } = await verifyPhoneOtp(fullPhone, code);
    if (err || !user) {
      setError(friendlyAuthError(err) || 'That code was incorrect. Check it and try again.');
      setLoading(false);
      setDigits(['', '', '', '', '', '']);
      inputs.current[0]?.focus();
    } else {
      onVerified(user); // keep loading on; this screen unmounts
    }
  }

  async function resend() {
    if (seconds > 0) return;
    setError('');
    const { error: err } = await sendPhoneOtp(fullPhone);
    if (err) setError('Could not resend the code. Please try again in a moment.');
    else setSeconds(30);
  }

  return (
    <Screen C={C}>
      <Header onBack={onBack} active={1} totalDots={3} accent={ACCENT} C={C} />
      <Body>
        <h2 style={{ fontSize: 26, fontWeight: 800, color: C.text, margin: '14px 0 8px', letterSpacing: '-0.01em' }}>Enter the code</h2>
        <p style={{ fontSize: 15, color: C.textMuted, margin: '0 0 26px', lineHeight: 1.5 }}>
          Sent to <span style={{ color: C.textSub, fontWeight: 600 }}>+1 {displayPhone}</span>
        </p>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => (inputs.current[i] = el)}
              value={d}
              onChange={(e) => setDigit(i, e.target.value)}
              onKeyDown={(e) => onKey(i, e)}
              inputMode="numeric"
              autoComplete={i === 0 ? 'one-time-code' : 'off'}
              maxLength={i === 0 ? 6 : 1}
              aria-label={`Digit ${i + 1}`}
              style={{
                width: 48, height: 58, textAlign: 'center', fontSize: 24, fontWeight: 700,
                borderRadius: 14, outline: 'none', WebkitAppearance: 'none',
                background: C.inputBg, color: C.text,
                border: `1.5px solid ${d ? ACCENT : C.inputBorder}`,
                transition: 'border-color 0.15s',
              }}
            />
          ))}
        </div>

        <ErrorText C={C}>{error}</ErrorText>

        <div style={{ flex: 1 }} />

        <PrimaryButton onClick={verify} disabled={!complete} loading={loading} accent={ACCENT}>Verify</PrimaryButton>
        <div style={{ textAlign: 'center', marginTop: 14 }}>
          {seconds > 0 ? (
            <span style={{ fontSize: 13.5, color: C.textMuted }}>Resend in 0:{String(seconds).padStart(2, '0')}</span>
          ) : (
            <button onClick={resend} style={{ background: 'none', border: 'none', color: ACCENT, fontSize: 14, fontWeight: 700, cursor: 'pointer', padding: 4, WebkitTapHighlightColor: 'transparent' }}>
              Resend code
            </button>
          )}
        </div>
      </Body>
    </Screen>
  );
}

// ── Screen 4: About you ──────────────────────────────────────────────────────
function ProfileScreen({ authUser, data, setData, onSaved, C }) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const isStore = data.role === 'store_owner';
  const isDriver = data.role === 'driver';
  const canContinue =
    data.firstName.trim() && data.lastName.trim() && data.role &&
    (!isStore || data.storeName.trim());

  function patch(key, val) { setData((d) => ({ ...d, [key]: val })); }

  async function save() {
    if (!canContinue || loading) return;
    setError(''); setLoading(true);
    const row = {
      id: authUser.id,
      first_name: data.firstName.trim(),
      last_name: data.lastName.trim(),
      email: data.email.trim() || null,
      role: data.role,
      store_name: isStore ? data.storeName.trim() : null,
      business_name: isDriver ? (data.businessName.trim() || null) : null,
      plan: 'basic',
    };
    const { error: err } = await saveProfile(row);
    if (err) {
      setError('We could not save your profile. Please try again.');
      setLoading(false);
      return;
    }
    // Set role + seed the business name so invoices show it right away.
    try {
      setRole(data.role);
      const name = isStore ? row.store_name : row.business_name;
      if (name && !getBusinessName()) saveBusinessName(name);
    } catch { /* ignore */ }
    onSaved();
  }

  return (
    <Screen C={C}>
      {/* No back: the OTP is already verified (per spec). Dots only. */}
      <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 16px 4px', paddingTop: 'max(14px, env(safe-area-inset-top))', flexShrink: 0 }}>
        <ProgressDots active={2} total={3} accent={ACCENT} C={C} />
      </div>
      <Body>
        <h2 style={{ fontSize: 26, fontWeight: 800, color: C.text, margin: '14px 0 8px', letterSpacing: '-0.01em' }}>About you</h2>
        <p style={{ fontSize: 15, color: C.textMuted, margin: '0 0 22px', lineHeight: 1.5 }}>So we can set up your account.</p>

        <div style={{ marginBottom: 14 }}>
          <FieldLabel C={C}>First name</FieldLabel>
          <input value={data.firstName} onChange={(e) => patch('firstName', e.target.value)} autoComplete="given-name" autoCapitalize="words" placeholder="Alex" style={textInputStyle(C)} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <FieldLabel C={C}>Last name</FieldLabel>
          <input value={data.lastName} onChange={(e) => patch('lastName', e.target.value)} autoComplete="family-name" autoCapitalize="words" placeholder="Rivera" style={textInputStyle(C)} />
        </div>
        <div style={{ marginBottom: 18 }}>
          <FieldLabel C={C}>Email</FieldLabel>
          <input value={data.email} onChange={(e) => patch('email', e.target.value)} type="email" inputMode="email" autoComplete="email" autoCapitalize="none" placeholder="you@example.com" style={textInputStyle(C)} />
          <p style={{ fontSize: 11.5, color: C.textMuted, margin: '6px 2px 0' }}>Optional but recommended for account recovery.</p>
        </div>

        <FieldLabel C={C}>I am a…</FieldLabel>
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <RoleCard label="Driver" sub="I deliver products to stores" icon="⛟" selected={isDriver} onClick={() => patch('role', 'driver')} C={C} />
          <RoleCard label="Store Owner" sub="I receive deliveries and manage orders" icon="⌂" selected={isStore} onClick={() => patch('role', 'store_owner')} C={C} />
        </div>

        {isStore && (
          <div style={{ marginBottom: 6, animation: 'tut-fadein 0.25s ease both' }}>
            <FieldLabel C={C}>Store name</FieldLabel>
            <input value={data.storeName} onChange={(e) => patch('storeName', e.target.value)} autoCapitalize="words" placeholder="Your store name" style={textInputStyle(C)} />
          </div>
        )}
        {isDriver && (
          <div style={{ marginBottom: 6, animation: 'tut-fadein 0.25s ease both' }}>
            <FieldLabel C={C}>Business name</FieldLabel>
            <input value={data.businessName} onChange={(e) => patch('businessName', e.target.value)} autoCapitalize="words" placeholder="Your business or personal name" style={textInputStyle(C)} />
          </div>
        )}

        <ErrorText C={C}>{error}</ErrorText>

        <div style={{ flex: 1, minHeight: 16 }} />
        <PrimaryButton onClick={save} disabled={!canContinue} loading={loading} accent={ACCENT}>Continue</PrimaryButton>
      </Body>
    </Screen>
  );
}

function RoleCard({ label, sub, icon, selected, onClick, C }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, textAlign: 'left', cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
      background: selected ? `${ACCENT}14` : C.card,
      border: `1.5px solid ${selected ? ACCENT : C.cardBorder}`,
      borderRadius: 16, padding: '14px 14px', position: 'relative', minHeight: 44,
      transition: 'border-color 0.15s, background 0.15s',
    }}>
      <div style={{ fontSize: 24, lineHeight: 1, marginBottom: 8, color: selected ? ACCENT : C.text }}>{icon}</div>
      <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{label}</div>
      <div style={{ fontSize: 11.5, color: C.textMuted, marginTop: 3, lineHeight: 1.4 }}>{sub}</div>
      {selected && (
        <span style={{ position: 'absolute', top: 10, right: 10, width: 20, height: 20, borderRadius: '50%', background: ACCENT, color: '#fff', fontSize: 12, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</span>
      )}
    </button>
  );
}

// ── Screen 5: Plan ───────────────────────────────────────────────────────────
const PLANS = [
  { id: 'basic', name: 'Basic', price: 'Free', available: true, badge: 'Free during beta',
    bullets: ['Up to 50 invoices per month', 'Connect with up to 3 drivers or stores', 'PDF generation', 'WhatsApp sharing'] },
  { id: 'pro', name: 'Pro', price: '$12/mo', available: false, badge: 'Coming soon',
    bullets: ['Unlimited invoices', 'Unlimited connections', 'Priority support', 'Analytics dashboard'] },
  { id: 'business', name: 'Business', price: '$29/mo', available: false, badge: 'Coming soon',
    bullets: ['Everything in Pro', 'Multi-driver management', 'Custom branding on invoices', 'Dedicated account manager'] },
];

function PlanScreen({ onBack, onStart, loading, C }) {
  const [selected, setSelected] = useState('basic');
  return (
    <Screen C={C}>
      <Header onBack={onBack} active={null} totalDots={3} accent={ACCENT} C={C} />
      <Body>
        <h2 style={{ fontSize: 26, fontWeight: 800, color: C.text, margin: '14px 0 8px', letterSpacing: '-0.01em' }}>Pick a plan</h2>
        <p style={{ fontSize: 15, color: C.textMuted, margin: '0 0 22px', lineHeight: 1.5 }}>Free during beta. Change anytime.</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {PLANS.map((p) => {
            const isSel = selected === p.id && p.available;
            return (
              <button
                key={p.id}
                onClick={() => p.available && setSelected(p.id)}
                disabled={!p.available}
                style={{
                  textAlign: 'left', width: '100%', cursor: p.available ? 'pointer' : 'default',
                  WebkitTapHighlightColor: 'transparent', position: 'relative',
                  background: isSel ? `${ACCENT}10` : C.card,
                  border: `1.5px solid ${isSel ? ACCENT : C.cardBorder}`,
                  borderRadius: 18, padding: '16px 16px', opacity: p.available ? 1 : 0.55,
                  transition: 'border-color 0.15s, background 0.15s',
                }}
              >
                <span style={{
                  position: 'absolute', top: 14, right: 14, fontSize: 10.5, fontWeight: 700,
                  textTransform: 'uppercase', letterSpacing: '0.04em',
                  color: p.available ? '#16a34a' : C.textMuted,
                  background: p.available ? (C.bg === DARK.bg ? '#0D2B20' : '#f0fdf4') : C.nestedCard,
                  borderRadius: 8, padding: '4px 8px',
                }}>{p.badge}</span>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
                  <span style={{ fontSize: 18, fontWeight: 900, color: C.text }}>{p.name}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: p.id === 'basic' ? ACCENT : C.textSub }}>{p.price}</span>
                </div>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {p.bullets.map((b) => (
                    <li key={b} style={{ fontSize: 13, color: C.textSub, display: 'flex', gap: 8, alignItems: 'flex-start', lineHeight: 1.4 }}>
                      <span style={{ color: p.available ? ACCENT : C.textMuted, fontWeight: 900, flexShrink: 0 }}>·</span>{b}
                    </li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>

        <div style={{ flex: 1, minHeight: 18 }} />
        <PrimaryButton onClick={onStart} loading={loading} accent={ACCENT}>Start for free</PrimaryButton>
      </Body>
    </Screen>
  );
}

// ── Email fallback (existing accounts) ───────────────────────────────────────
function EmailLoginScreen({ onBack, onAuthed, C }) {
  const [mode, setMode] = useState('signin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  async function submit() {
    if (!username.trim() || !password) { setError('Please enter your username and password.'); return; }
    setError(''); setLoading(true);
    const email = username.trim().toLowerCase() + '@invoicego.app';
    const fn = mode === 'signin' ? signInWithEmail : signUpWithEmail;
    const { user, error: err } = await fn(email, password);
    if (err) { setError(err.message || 'Something went wrong.'); setLoading(false); }
    else onAuthed(user);
  }

  return (
    <Screen C={C}>
      <Header onBack={onBack} active={null} totalDots={3} accent={ACCENT} C={C} />
      <Body>
        <h2 style={{ fontSize: 26, fontWeight: 800, color: C.text, margin: '14px 0 8px', letterSpacing: '-0.01em' }}>
          {mode === 'signin' ? 'Log in with email' : 'Create an account'}
        </h2>
        <p style={{ fontSize: 15, color: C.textMuted, margin: '0 0 24px', lineHeight: 1.5 }}>For accounts created before phone sign-in.</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input value={username} onChange={(e) => { setUsername(e.target.value); setError(''); }} placeholder="Username" autoComplete="username" autoCapitalize="none" style={textInputStyle(C)} />
          <input value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }} type="password" placeholder="Password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} style={textInputStyle(C)} />
        </div>

        <ErrorText C={C}>{error}</ErrorText>

        <div style={{ flex: 1, minHeight: 18 }} />
        <PrimaryButton onClick={submit} loading={loading} accent={ACCENT}>{mode === 'signin' ? 'Log in' : 'Create account'}</PrimaryButton>
        <div style={{ textAlign: 'center', marginTop: 14, fontSize: 14, color: C.textMuted }}>
          {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
          <button onClick={() => { setMode((m) => (m === 'signin' ? 'signup' : 'signin')); setError(''); }} style={{ background: 'none', border: 'none', color: ACCENT, fontWeight: 700, fontSize: 14, cursor: 'pointer', padding: 0, WebkitTapHighlightColor: 'transparent' }}>
            {mode === 'signin' ? 'Create one' : 'Log in'}
          </button>
        </div>
      </Body>
    </Screen>
  );
}

// ── Orchestrator ─────────────────────────────────────────────────────────────
export default function OnboardingFlow({ session, onAuthed, onGuest }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  const [step, setStep] = useState(session ? 'resuming' : 'welcome');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [authUser, setAuthUser] = useState(session?.user ?? null);
  const [finishing, setFinishing] = useState(false);
  const [data, setData] = useState({ firstName: '', lastName: '', email: '', role: '', storeName: '', businessName: '' });

  const fullPhone = '+1' + phoneDigits;
  const displayPhone = formatUSPhone(phoneDigits);

  // Resume: a session already exists (closed app mid-onboarding, or returning
  // user on a new device). Load their profile, else send them to profile setup.
  useEffect(() => {
    if (step !== 'resuming') return;
    let cancelled = false;
    (async () => {
      const uid = session?.user?.id;
      if (!uid) { if (!cancelled) setStep('welcome'); return; }
      const { profile } = await fetchProfile(uid);
      if (cancelled) return;
      if (profile && profile.role) { applyProfileLocal(profile); onAuthed(session.user); }
      else setStep('profile');
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function applyProfileLocal(p) {
    try {
      setRole(p.role);
      localStorage.setItem(ONBOARDING_DONE_KEY, 'true');
      localStorage.setItem(PLAN_KEY, p.plan || 'basic');
      const name = p.role === 'store_owner' ? p.store_name : p.business_name;
      if (name && !getBusinessName()) saveBusinessName(name);
    } catch { /* ignore */ }
  }

  // After OTP verifies: skip to app if a profile already exists, else profile setup.
  async function onVerified(user) {
    setAuthUser(user);
    const { profile } = await fetchProfile(user.id);
    if (profile && profile.role) { applyProfileLocal(profile); onAuthed(user); }
    else setStep('profile');
  }

  function finish() {
    setFinishing(true);
    try {
      localStorage.setItem(PLAN_KEY, 'basic');
      localStorage.setItem(ONBOARDING_DONE_KEY, 'true');
    } catch { /* ignore */ }
    onAuthed(authUser);
  }

  if (step === 'resuming') {
    return (
      <div style={{ minHeight: '100dvh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner />
      </div>
    );
  }

  const devBypass = import.meta.env.DEV ? () => onAuthed({ id: 'dev', email: 'dev@invoicego.app' }) : null;

  switch (step) {
    case 'phone':
      return <PhoneScreen key="phone" phoneDigits={phoneDigits} setPhoneDigits={setPhoneDigits} onBack={() => setStep('welcome')} onSent={() => setStep('otp')} C={C} />;
    case 'otp':
      return <OtpScreen key="otp" fullPhone={fullPhone} displayPhone={displayPhone} onBack={() => setStep('phone')} onVerified={onVerified} C={C} />;
    case 'profile':
      return <ProfileScreen key="profile" authUser={authUser} data={data} setData={setData} onSaved={() => setStep('plan')} C={C} />;
    case 'plan':
      return <PlanScreen key="plan" onBack={() => setStep('profile')} onStart={finish} loading={finishing} C={C} />;
    case 'email':
      return <EmailLoginScreen key="email" onBack={() => setStep('welcome')} onAuthed={onAuthed} C={C} />;
    case 'welcome':
    default:
      return <WelcomeScreen key="welcome" onStart={() => setStep('phone')} onEmail={() => setStep('email')} onGuest={onGuest} onDev={devBypass} C={C} />;
  }
}
