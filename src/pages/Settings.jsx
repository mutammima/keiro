/**
 * Settings — all app configuration in one place.
 *
 * Sections:
 *  1. Appearance      — light / dark theme
 *  2. Business Info   — name & phone
 *  3. Security        — active session info, sign out other devices, 2FA
 *  4. Pinned Stores   — manage pinned store chips
 *  5. Backup & Restore
 *  6. Terms & Privacy — alpha disclaimer
 */

import { useState, useEffect, useRef } from 'react';
import { useTheme } from '../context/ThemeContext';
import { LIGHT, DARK, ACCENT, glassStyle } from '../theme';
import {
  getBusinessName, saveBusinessName,
  getBusinessPhone, saveBusinessPhone,
  getPinnedStores, togglePinnedStore,
  lsGet, lsSet,
} from '../utils/storage';
import { DEFAULT_BUSINESS_NAME, DEFAULT_FLAG_DAYS, EVENTS } from '../utils/constants';
import { useBackup } from '../hooks/useBackup';
import ThemeToggle from '../components/settings/ThemeToggle';
import { supabase } from '../services/supabase';
import { signOut } from '../services/auth';
import AppFooter from '../components/navigation/AppFooter';
import PinLock, { isPinEnabled, clearPin } from '../components/settings/PinLock';
import { Toggle, Row, Divider, Section } from '../components/ui/SettingsUI';
import { createPortal } from 'react-dom';
import { lazy, Suspense } from 'react';
import { triggerTip, isWalkthroughDone } from '../utils/tutorialProgress';

const HelpChecklist = lazy(() => import('../components/tutorial/HelpChecklist'));

// ── Accent presets ────────────────────────────────────────────────────────────
const ACCENT_PRESETS = [
  '#4A7BF7', // blue (default)
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#EF4444', // red
  '#F97316', // orange
  '#EAB308', // yellow
  '#22C55E', // green
  '#14B8A6', // teal
  '#06B6D4', // cyan
  '#64748B', // slate
];

export default function Settings({ onOpenDrawer, onNav, onClose, onSwitchRole, onReplayTutorial, onStartWalkthrough }) {
  const { dark, accent, setAccent } = useTheme();
  const C = dark ? DARK : LIGHT;

  const role = (() => { try { return JSON.parse(localStorage.getItem('inv_user_role')) || 'driver'; } catch { return 'driver'; } })();

  // Layer 2 — first time Settings opens, point at the business-info field.
  useEffect(() => { triggerTip('settings-biz'); }, []);

  // ── Business info ──────────────────────────────────────────────────────────
  const [bizName,  setBizName]  = useState(() => getBusinessName()  || DEFAULT_BUSINESS_NAME);
  const [bizPhone, setBizPhone] = useState(() => getBusinessPhone() || '');
  const [bizSaved, setBizSaved] = useState(false);

  function saveBiz() {
    if (bizName.trim()) saveBusinessName(bizName.trim());
    saveBusinessPhone(bizPhone.trim());
    setBizSaved(true);
    setTimeout(() => setBizSaved(false), 2000);
    // Advance onboarding as soon as a business name is saved (phone is optional)
    if (bizName.trim()) {
      window.dispatchEvent(new CustomEvent('inv-onboarding-settings-saved'));
    }
  }

  // ── Security ───────────────────────────────────────────────────────────────
  const [session,      setSession]      = useState(null);
  const [twoFAStatus,  setTwoFAStatus]  = useState('loading'); // 'enabled'|'disabled'|'loading'
  const [signOutMsg,   setSignOutMsg]   = useState('');
  const [secLoading,   setSecLoading]   = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data?.session ?? null);
    });
    // Check MFA factors
    supabase.auth.mfa.listFactors().then(({ data }) => {
      const hasTOTP = data?.totp?.length > 0;
      setTwoFAStatus(hasTOTP ? 'enabled' : 'disabled');
    }).catch(() => setTwoFAStatus('disabled'));
  }, []);

  async function handleSignOutOthers() {
    setSecLoading(true);
    try {
      await supabase.auth.signOut({ scope: 'others' });
      setSignOutMsg('All other sessions signed out.');
    } catch {
      setSignOutMsg('Could not sign out other sessions.');
    }
    setSecLoading(false);
    setTimeout(() => setSignOutMsg(''), 3000);
  }

  async function handle2FAToggle() {
    if (twoFAStatus === 'disabled') {
      setSecLoading(true);
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
      setSecLoading(false);
      if (!error && data?.totp?.qr_code) {
        setTwoFAStatus('setup');
        setQrCode(data.totp.qr_code);
        setFactorId(data.id);
      }
    }
  }
  const [qrCode,   setQrCode]   = useState('');
  const [factorId, setFactorId] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [totpMsg,  setTotpMsg]  = useState('');

  async function verifyTOTP() {
    if (!totpCode.trim() || !factorId) return;
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: totpCode.trim() });
    if (error) { setTotpMsg('Invalid code. Try again.'); }
    else        { setTwoFAStatus('enabled'); setQrCode(''); setTotpCode(''); setTotpMsg('2FA enabled!'); }
  }

  // ── Pinned stores ──────────────────────────────────────────────────────────
  const [pinned, setPinned] = useState(() => getPinnedStores());
  function unpin(name) { togglePinnedStore(name); setPinned(getPinnedStores()); }

  // ── Backup ─────────────────────────────────────────────────────────────────
  const { backupMsg, fileInputRef, handleExport, handleImportClick, handleImportFile } = useBackup();

  // ── PIN lock ───────────────────────────────────────────────────────────────
  const [pinEnabled, setPinEnabled] = useState(() => isPinEnabled());
  const [pinModal, setPinModal] = useState(null); // 'setup' | 'disable' | null

  // ── Density ────────────────────────────────────────────────────────────────
  const [density, setDensity] = useState(() => lsGet('inv_density', 'comfortable'));

  // ── Auto-flag / auto-mark ──────────────────────────────────────────────────
  // Default must match getFlagDays()'s DEFAULT_FLAG_DAYS, or the picker shows a
  // different threshold than the overdue engine actually uses until first edit.
  const [autoFlagDays, setAutoFlagDays] = useState(() => lsGet('inv_auto_flag_days', DEFAULT_FLAG_DAYS));

  // ── Logo upload ────────────────────────────────────────────────────────────
  const [logo, setLogo] = useState(() => { try { return localStorage.getItem('inv_logo_b64') || null; } catch { return null; } });
  const logoInputRef = useRef(null);

  function handleLogoFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const b64 = ev.target.result;
      localStorage.setItem('inv_logo_b64', b64);
      setLogo(b64);
    };
    reader.readAsDataURL(file);
  }

  function removeLogo() {
    localStorage.removeItem('inv_logo_b64');
    setLogo(null);
  }

  // ── Switch Role ────────────────────────────────────────────────────────────
  const [confirmSwitchRole, setConfirmSwitchRole] = useState(false);

  // Get the current role to know which one to switch TO
  const currentRole = (() => { try { return JSON.parse(localStorage.getItem('inv_user_role')); } catch { return 'driver'; } })();
  const nextRole    = currentRole === 'store_owner' ? 'driver' : 'store_owner';
  const nextLabel   = nextRole === 'store_owner' ? 'Store Owner' : 'Delivery Driver';

  function handleSwitchRole() {
    if (onSwitchRole) {
      onSwitchRole(nextRole);   // instant — no reload
    } else {
      localStorage.removeItem('inv_user_role');
      window.location.reload(); // fallback (should never happen)
    }
  }

  // ── Terms expanded ─────────────────────────────────────────────────────────
  const [termsOpen, setTermsOpen] = useState(false);

  // ── Shared input style ─────────────────────────────────────────────────────
  const inp = {
    background: C.inputBg, border: `1px solid ${C.inputBorder}`,
    color: C.text, height: 46, borderRadius: 12, padding: '0 14px',
    fontSize: 15, outline: 'none', width: '100%', boxSizing: 'border-box',
  };

  const sessionDevice = session
    ? `${/iPhone|iPad/.test(navigator.userAgent) ? 'iPhone / iPad' : /Android/.test(navigator.userAgent) ? 'Android' : 'Browser'} · Signed in`
    : null;

  return (
    <div style={{ ...s.page, background: C.bg }}>
      <div style={{ ...s.header, ...glassStyle(dark) }}>
        <button style={{ ...s.hamburger, color: C.text }} onClick={onOpenDrawer}>☰</button>
        <span style={{ ...s.title, color: C.text }}>Settings</span>
        {/* Close / back — uses onClose when provided, falls back to navigating to first tab */}
        <button
          onClick={() => onClose ? onClose() : onNav('invoice')}
          style={{ width: 36, height: 36, background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent', borderRadius: 10 }}
          aria-label="Close settings"
        >✕</button>
      </div>

      <div style={s.body}>

        {/* ── 0. Easy Mode ───────────────────────────────────────────────── */}
        <Section title="Easy Mode" C={C} defaultOpen>
          <div style={{ paddingTop: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 3 }}>Simplified view</div>
                <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.45 }}>
                  Shows only New Invoice, Invoices, and Products. Hides Reports, Notes, Store Info, and other advanced features.
                </div>
              </div>
              <Toggle
                on={lsGet('inv_easy_mode', false)}
                onChange={v => { lsSet('inv_easy_mode', v); window.location.reload(); }}
                C={C} dark={dark}
              />
            </div>
          </div>
        </Section>

        {/* ── Help & Tutorial ────────────────────────────────────────────── */}
        <Section title="Help & Tutorial" C={C} defaultOpen={false}>
          {/* Walkthrough cards — role-specific */}
          {role === 'driver' && (
            <WalkthroughCard
              title="Create and manage an invoice"
              desc="A self-running demo: watch a real invoice get built and marked paid, with every action button explained."
              walkthroughId="driver_invoice"
              onStart={() => onStartWalkthrough?.('driver_invoice')}
              C={C} dark={dark}
            />
          )}
          {role === 'store_owner' && (
            <WalkthroughCard
              title="Place and track a delivery request"
              desc="A self-running demo: watch a real order get sent to a driver and tracked from pending to delivered."
              walkthroughId="so_request"
              onStart={() => onStartWalkthrough?.('so_request')}
              C={C} dark={dark}
            />
          )}
          <Suspense fallback={null}>
            <HelpChecklist
              role={role}
              onNav={(p) => onNav?.(p)}
              onReplay={() => onReplayTutorial?.()}
              onStartWalkthrough={onStartWalkthrough}
            />
          </Suspense>
        </Section>

        {/* ── 1. Appearance ──────────────────────────────────────────────── */}
        <Section title="Appearance" C={C} defaultOpen>
          <div style={{ paddingTop: 4, display: 'flex', flexDirection: 'column', gap: 0 }}>
            {/* Dark / Light */}
            <ThemeToggle />
            <Divider C={C} />
            {/* Accent color */}
            <div style={{ padding: '12px 0' }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: C.text, marginBottom: 10 }}>Accent Color</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {ACCENT_PRESETS.map(color => (
                  <button
                    key={color}
                    onClick={() => setAccent(color)}
                    style={{
                      width: 34, height: 34, borderRadius: '50%',
                      background: color, border: accent === color ? `3px solid ${C.text}` : '3px solid transparent',
                      cursor: 'pointer', boxSizing: 'border-box',
                      boxShadow: accent === color ? `0 0 0 2px ${color}` : 'none',
                      outline: 'none',
                      WebkitTapHighlightColor: 'transparent',
                      transition: 'border 0.15s',
                      flexShrink: 0,
                    }}
                  />
                ))}
                {/* Custom color input */}
                <label style={{ position: 'relative', width: 34, height: 34, borderRadius: '50%', overflow: 'hidden', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.rowBg, border: `1px solid ${C.divider}` }}>
                  <span style={{ fontSize: 16, color: C.textMuted, userSelect: 'none' }}>+</span>
                  <input
                    type="color"
                    defaultValue={accent}
                    onChange={e => setAccent(e.target.value)}
                    style={{ position: 'absolute', width: '200%', height: '200%', opacity: 0, cursor: 'pointer', left: '-50%', top: '-50%' }}
                  />
                </label>
              </div>
            </div>
            <Divider C={C} />
            {/* Density */}
            <Row label="Display Density" sub="Comfortable for easy reading, Compact for more data" C={C}>
              <div style={{ display: 'flex', gap: 6 }}>
                {['comfortable', 'compact'].map(d => (
                  <button
                    key={d}
                    onClick={() => {
                      setDensity(d);
                      lsSet('inv_density', d);
                      document.body.classList.toggle('density-compact', d === 'compact');
                      window.dispatchEvent(new Event(EVENTS.DENSITY_CHANGE));
                    }}
                    style={{
                      height: 30, padding: '0 12px', borderRadius: 8,
                      background: density === d ? ACCENT : C.rowBg,
                      color: density === d ? '#fff' : C.textMuted,
                      border: `1px solid ${density === d ? 'transparent' : C.divider}`,
                      fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      WebkitTapHighlightColor: 'transparent',
                    }}
                  >
                    {d.charAt(0).toUpperCase() + d.slice(1)}
                  </button>
                ))}
              </div>
            </Row>
          </div>
        </Section>

        {/* ── 2. Business Info ───────────────────────────────────────────── */}
        <Section title="Business Info" C={C} defaultOpen>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4 }}>
            <div>
              <label style={{ ...s.fieldLabel, color: C.textSub }}>Business Name</label>
              <input data-tutorial="settings-biz-name" data-tip="settings-biz" style={inp} value={bizName} onChange={e => setBizName(e.target.value)} placeholder={DEFAULT_BUSINESS_NAME} />
            </div>
            <div>
              <label style={{ ...s.fieldLabel, color: C.textSub }}>Business Phone</label>
              <input style={inp} value={bizPhone} onChange={e => setBizPhone(e.target.value)} inputMode="tel" placeholder="(718) 555-0000" />
            </div>
            {/* Invoice logo */}
            <div>
              <label style={{ ...s.fieldLabel, color: C.textSub }}>Invoice Logo (PDF header)</label>
              {logo ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <img src={logo} alt="Logo" style={{ height: 48, maxWidth: 120, objectFit: 'contain', borderRadius: 8, border: `1px solid ${C.divider}`, background: C.rowBg, padding: 4 }} />
                  <button style={{ ...s.smallBtn, background: C.rowBg, color: C.danger, border: `1px solid ${C.divider}` }} onClick={removeLogo}>Remove</button>
                  <button style={{ ...s.smallBtn, background: C.rowBg, color: ACCENT, border: `1px solid ${C.divider}` }} onClick={() => logoInputRef.current?.click()}>Change</button>
                </div>
              ) : (
                <button style={{ ...s.outlineBtn, height: 42, color: ACCENT, borderColor: C.divider }} onClick={() => logoInputRef.current?.click()}>
                  Upload Logo
                </button>
              )}
              <input ref={logoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoFile} />
              <div style={{ color: C.textLight, fontSize: 11, marginTop: 4 }}>PNG or JPG, recommended 400×100 px or wider</div>
            </div>
            <button
              data-tutorial="settings-save-btn"
              style={{ ...s.primaryBtn, background: bizSaved ? '#166534' : ACCENT, transition: 'background 0.3s' }}
              onClick={saveBiz}
            >
              {bizSaved ? '✓ Saved' : 'Save Changes'}
            </button>
          </div>
        </Section>

        {/* ── 4. Security ────────────────────────────────────────────────── */}
        <Section title="Security & Permissions" C={C} defaultOpen={false}>
          {/* Active session */}
          {sessionDevice && (
            <>
              <Row label="This device" sub={sessionDevice} C={C}>
                <span style={{ background: dark ? '#0D2B20' : '#f0fdf4', color: dark ? '#2ECC8A' : '#16a34a', fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 7 }}>Active</span>
              </Row>
              <Divider C={C} />
              <Row label="Other sessions" sub="Sign out every other logged-in device" C={C}>
                <button
                  style={{ ...s.smallBtn, background: C.rowBg, color: C.danger, border: `1px solid ${C.divider}` }}
                  onClick={handleSignOutOthers}
                  disabled={secLoading}
                >
                  {secLoading ? '…' : 'Sign out all'}
                </button>
              </Row>
              {signOutMsg && <p style={{ color: dark ? '#2ECC8A' : '#16a34a', fontSize: 12, margin: '4px 0 0', fontWeight: 500 }}>{signOutMsg}</p>}
              <Divider C={C} />
            </>
          )}

          {/* 2FA */}
          <Row
            label="Two-Factor Auth (2FA)"
            sub={twoFAStatus === 'enabled' ? 'Authenticator app is active' : twoFAStatus === 'setup' ? 'Scan QR code in your authenticator app' : 'Add an extra layer of sign-in security'}
            C={C}
          >
            {twoFAStatus === 'loading' ? (
              <span style={{ color: C.textMuted, fontSize: 12 }}>…</span>
            ) : twoFAStatus === 'enabled' ? (
              <span style={{ background: dark ? '#0D2B20' : '#f0fdf4', color: dark ? '#2ECC8A' : '#16a34a', fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 7 }}>ON</span>
            ) : twoFAStatus === 'disabled' ? (
              <button style={{ ...s.smallBtn, background: ACCENT, color: '#fff', border: 'none' }} onClick={handle2FAToggle} disabled={secLoading}>
                Enable
              </button>
            ) : null}
          </Row>

          {twoFAStatus === 'setup' && qrCode && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ color: C.textMuted, fontSize: 12, margin: 0, lineHeight: 1.5 }}>
                Scan this QR code with Google Authenticator, Authy, or any TOTP app, then enter the 6-digit code below.
              </p>
              <img src={qrCode} alt="2FA QR Code" style={{ width: 140, height: 140, borderRadius: 10, alignSelf: 'center', background: '#fff', padding: 6 }} />
              <input
                style={{ ...inp, height: 42 }}
                placeholder="6-digit code"
                inputMode="numeric"
                maxLength={6}
                value={totpCode}
                onChange={e => setTotpCode(e.target.value.replace(/\D/g, ''))}
              />
              <button style={{ ...s.primaryBtn, background: ACCENT }} onClick={verifyTOTP}>Verify & Activate</button>
              {totpMsg && <p style={{ color: totpMsg.includes('!') ? (dark ? '#2ECC8A' : '#16a34a') : C.danger, fontSize: 13, margin: 0 }}>{totpMsg}</p>}
            </div>
          )}

          <Divider C={C} />
          <Row label="Change Password" sub="Update via Profile page" C={C}>
            <button style={{ ...s.smallBtn, background: C.rowBg, color: ACCENT, border: `1px solid ${C.divider}` }} onClick={() => onNav('profile')}>
              Go →
            </button>
          </Row>
          <Divider C={C} />
          <Row label="App PIN Lock" sub={pinEnabled ? 'PIN required on app open' : 'Lock app with a 4-digit PIN'} C={C}>
            <Toggle on={pinEnabled} onChange={v => {
              if (v) { setPinModal('setup'); }
              else   { clearPin(); setPinEnabled(false); }
            }} C={C} dark={dark} />
          </Row>
          {pinEnabled && (
            <>
              <Divider C={C} />
              <Row label="Change PIN" sub="Set a new 4-digit PIN" C={C}>
                <button style={{ ...s.smallBtn, background: C.rowBg, color: ACCENT, border: `1px solid ${C.divider}` }} onClick={() => setPinModal('setup')}>Change</button>
              </Row>
            </>
          )}
          <Divider C={C} />
          <Row label="Switch Role" sub={`Switch to ${nextLabel}`} C={C}>
            <button
              style={{ ...s.smallBtn, background: C.rowBg, color: C.textMuted, border: `1px solid ${C.divider}` }}
              onClick={() => setConfirmSwitchRole(true)}
            >
              Switch
            </button>
          </Row>
        </Section>

        {/* PIN setup overlay */}
        {pinModal === 'setup' && (
          <PinLock
            setupMode
            onSuccess={() => { setPinEnabled(true); setPinModal(null); }}
            onCancel={() => { setPinModal(null); if (!isPinEnabled()) setPinEnabled(false); }}
          />
        )}

        {/* ── 5. Automation ──────────────────────────────────────────────── */}
        <Section title="Automation" C={C} defaultOpen={false}>
          <Row
            label="Auto-flag overdue after"
            sub="Unpaid invoices older than this many days are flagged"
            C={C}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {[1,3,7,14,30].map(d => (
                <button
                  key={d}
                  onClick={() => { setAutoFlagDays(d); lsSet('inv_auto_flag_days', d); }}
                  style={{
                    height: 30, minWidth: 32, padding: '0 8px', borderRadius: 8,
                    background: autoFlagDays === d ? ACCENT : C.rowBg,
                    color: autoFlagDays === d ? '#fff' : C.textMuted,
                    border: `1px solid ${autoFlagDays === d ? 'transparent' : C.divider}`,
                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  {d}d
                </button>
              ))}
            </div>
          </Row>
        </Section>

        {/* ── 6. Pinned Stores ───────────────────────────────────────────── */}
        <Section title="Pinned Stores" C={C} defaultOpen={false}>
          {pinned.length === 0 ? (
            <p style={{ color: C.textMuted, fontSize: 13, margin: '8px 0', lineHeight: 1.5 }}>
              No pinned stores yet. Stores you use often will show as quick-select chips on the New Invoice form. Pin one by tapping it there.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 4 }}>
              {pinned.map((name, i) => (
                <div key={name}>
                  {i > 0 && <Divider C={C} />}
                  <Row label={`★ ${name}`} C={C}>
                    <button style={{ ...s.smallBtn, background: C.rowBg, color: C.danger, border: `1px solid ${C.divider}` }} onClick={() => unpin(name)}>Unpin</button>
                  </Row>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* ── 6. Backup & Restore ────────────────────────────────────────── */}
        <Section title="Backup & Restore" C={C} defaultOpen={false}>
          <p style={{ color: C.textMuted, fontSize: 13, lineHeight: 1.6, margin: '8px 0 14px' }}>
            Export your invoices, products, and store data to a file. Save it to iCloud, Google Drive, or email. Restore any time if you switch phones.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button style={{ ...s.primaryBtn, background: ACCENT }} onClick={handleExport}>Export Backup</button>
            <button style={{ ...s.outlineBtn, color: C.text, borderColor: C.divider, background: C.rowBg }} onClick={handleImportClick}>Restore from File</button>
            <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImportFile} />
            {backupMsg && (
              <p style={{ fontSize: 13, fontWeight: 500, textAlign: 'center', margin: 0, color: backupMsg.includes('complete') ? (dark ? '#2ECC8A' : '#16a34a') : C.textMuted }}>
                {backupMsg}
              </p>
            )}
          </div>
        </Section>

        {/* ── 7. Terms & Privacy ─────────────────────────────────────────── */}
        <Section title="Terms & Privacy" C={C} defaultOpen={false}>
          <div style={{ paddingTop: 8 }}>
            {/* Alpha badge */}
            <div style={{ background: dark ? '#1f1000' : '#fffbeb', border: `1px solid ${dark ? '#2a1800' : '#fde68a'}`, borderRadius: 12, padding: '10px 14px', marginBottom: 14 }}>
              <div style={{ color: dark ? '#fbbf24' : '#b45309', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>⚠ Alpha / Test Build</div>
              <div style={{ color: dark ? '#d97706' : '#92400e', fontSize: 12, lineHeight: 1.55 }}>
                Keiro is an early-stage experimental application. Features may change, data may be reset, and the service may be interrupted at any time without notice. Use at your own risk and always keep an exported backup.
              </div>
            </div>

            {!termsOpen ? (
              <button style={{ background: 'none', border: 'none', color: ACCENT, fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0, WebkitTapHighlightColor: 'transparent' }} onClick={() => setTermsOpen(true)}>
                Read Terms & Privacy Policy ↓
              </button>
            ) : (
              <div style={{ color: C.textMuted, fontSize: 12, lineHeight: 1.7, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <div style={{ color: C.textSub, fontWeight: 700, marginBottom: 4 }}>Terms of Use</div>
                  Keiro is provided as-is without any warranty. By using this app you agree not to hold its creators liable for any data loss, inaccuracies in invoices, or business decisions made based on information displayed in the app. You are responsible for the accuracy of all invoice data you enter.
                </div>
                <div>
                  <div style={{ color: C.textSub, fontWeight: 700, marginBottom: 4 }}>Privacy Policy</div>
                  Keiro stores your invoice and product data in Supabase, a third-party cloud provider. Your data is associated with your account and is not sold or shared with third parties. We collect minimal usage data. You may delete your account and all associated data at any time by contacting support.
                </div>
                <div>
                  <div style={{ color: C.textSub, fontWeight: 700, marginBottom: 4 }}>Data Retention</div>
                  Data is retained for the lifetime of your account. If you delete your account, all data is permanently removed within 30 days. Exported backup files are entirely in your control and are not managed by Keiro.
                </div>
                <div>
                  <div style={{ color: C.textSub, fontWeight: 700, marginBottom: 4 }}>Contact</div>
                  For questions or data deletion requests, email: <span style={{ color: ACCENT }}>alomonds@gmail.com</span>
                </div>
                <button style={{ background: 'none', border: 'none', color: C.textMuted, fontSize: 12, cursor: 'pointer', padding: 0, textAlign: 'left' }} onClick={() => setTermsOpen(false)}>
                  Collapse ↑
                </button>
              </div>
            )}
          </div>
        </Section>

        {/* Sign out */}
        <button
          style={{ ...s.outlineBtn, color: C.danger, borderColor: C.divider }}
          onClick={async () => { await signOut(); window.location.reload(); }}
        >
          Sign Out
        </button>

        <AppFooter onNav={onNav} />
      </div>

      {/* Switch Role confirm modal */}
      {confirmSwitchRole && createPortal(
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={() => setConfirmSwitchRole(false)}
        >
          <div
            style={{ width: '100%', maxWidth: 340, borderRadius: 18, border: `1px solid ${C.cardBorder}`, background: C.card, padding: '22px 20px 18px', boxShadow: '0 16px 48px rgba(0,0,0,0.35)' }}
            onClick={e => e.stopPropagation()}
          >
            <p style={{ fontSize: 17, fontWeight: 800, color: C.text, margin: '0 0 8px' }}>Switch to {nextLabel}?</p>
            <p style={{ fontSize: 14, color: C.textSub, margin: '0 0 20px', lineHeight: 1.5 }}>
              The app will switch instantly. Your data won't be affected.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                style={{ flex: 1, height: 46, borderRadius: 12, border: `1px solid ${C.inputBorder}`, background: C.inputBg, color: C.text, fontSize: 15, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
                onClick={() => setConfirmSwitchRole(false)}
              >Cancel</button>
              <button
                style={{ flex: 1, height: 46, borderRadius: 12, border: 'none', background: ACCENT, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
                onClick={handleSwitchRole}
              >Switch</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ── Walkthrough card ──────────────────────────────────────────────────────────
function WalkthroughCard({ title, desc, walkthroughId, onStart, C }) {
  const done = isWalkthroughDone(walkthroughId);
  return (
    <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 16, padding: '14px 16px', marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 3 }}>{title}</div>
          <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.5 }}>{desc}</div>
        </div>
        {done && (
          <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', background: '#22C55E', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 900, marginTop: 2 }}>✓</span>
        )}
      </div>
      <button
        onClick={onStart}
        style={{ alignSelf: 'flex-start', height: 34, padding: '0 14px', border: done ? `1px solid ${C.divider}` : 'none', borderRadius: 10, background: done ? 'transparent' : ACCENT, color: done ? C.textMuted : '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
      >
        {done ? 'Replay' : 'Start Walkthrough'}
      </button>
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
  hamburger: { background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', padding: '3px 4px', WebkitTapHighlightColor: 'transparent' },
  title: { fontSize: 17, fontWeight: 700, textAlign: 'center', flex: 1 },
  body: {
    padding: '12px 16px 88px',
    display: 'flex', flexDirection: 'column', gap: 10,
    maxWidth: 480, width: '100%', margin: '0 auto', boxSizing: 'border-box',
  },
  fieldLabel: { display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 },
  primaryBtn: {
    width: '100%', height: 48, border: 'none', borderRadius: 14,
    fontSize: 15, fontWeight: 700, color: '#fff',
    cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
  },
  outlineBtn: {
    width: '100%', height: 48, border: '1px solid', borderRadius: 14,
    fontSize: 15, fontWeight: 600,
    cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
    background: 'none',
  },
  smallBtn: {
    height: 32, padding: '0 14px', borderRadius: 10,
    fontSize: 12, fontWeight: 600,
    cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
    flexShrink: 0,
  },
};
