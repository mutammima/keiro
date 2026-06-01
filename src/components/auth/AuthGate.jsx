/**
 * AuthGate — wraps the entire app, shows LoginScreen when unauthenticated.
 *
 * Flow:
 *  1. On mount, checks for an existing Supabase session.
 *  2. If session exists → renders children immediately.
 *  3. If no session → renders LoginScreen.
 *  4. After login → runs one-time data migration, then renders the app.
 *  5. Subscribes to auth state changes to handle token expiry / sign-out.
 */

import { useState, useEffect } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { LIGHT, DARK } from '../../theme';
import { getSession, onAuthStateChange } from '../../lib/auth';
import { runMigrationIfNeeded } from '../../lib/migration';
import LoginScreen from './LoginScreen';

/**
 * @param {{ children: React.ReactNode }} props
 */
export default function AuthGate({ children }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  const [session, setSession]         = useState(null);
  const [checking, setChecking]       = useState(true);
  const [migrating, setMigrating]     = useState(false);
  const [migrationMsg, setMigrationMsg] = useState('');

  // ── Check for existing session on mount ──────────────────────────────────
  useEffect(() => {
    getSession().then(s => {
      setSession(s);
      setChecking(false);
    });

    // Subscribe to auth state changes
    const unsubscribe = onAuthStateChange((event, s) => {
      if (event === 'SIGNED_OUT') {
        setSession(null);
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        setSession(s);
      }
    });

    return unsubscribe;
  }, []);

  // ── After login callback ──────────────────────────────────────────────────
  async function handleLogin(user) {
    // Show app immediately with a non-blocking migration
    setSession({ user });

    // Run migration in background
    setMigrating(true);
    try {
      const result = await runMigrationIfNeeded();
      if (result.ran) {
        const { invoicesMigrated, productsMigrated, storesMigrated } = result;
        setMigrationMsg(
          `Data migrated: ${invoicesMigrated} invoices, ${productsMigrated} products, ${storesMigrated} stores.`
        );
        setTimeout(() => setMigrationMsg(''), 5000);
      }
    } catch (e) {
      console.error('Migration error', e);
    } finally {
      setMigrating(false);
    }
  }

  // ── Loading spinner ───────────────────────────────────────────────────────
  if (checking) {
    return (
      <div style={{
        minHeight: '100dvh',
        background: C.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <span style={{ color: C.textMuted, fontSize: 15 }}>Loading…</span>
      </div>
    );
  }

  // ── Not authenticated ─────────────────────────────────────────────────────
  if (!session) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  // ── Authenticated — render app ────────────────────────────────────────────
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
