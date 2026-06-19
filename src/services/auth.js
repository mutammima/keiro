/**
 * auth.js — authentication helpers wrapping the Supabase auth API.
 *
 * All functions return { user, error } or { error } for consistency.
 * Passkey / WebAuthn notes:
 *   - Full WebAuthn enrollment requires Supabase to enable the "Phone / WebAuthn"
 *     MFA factor type in the Auth settings, which is in early access as of 2025.
 *   - The `registerPasskey` function below uses TOTP MFA enrollment as a fallback
 *     because @supabase/supabase-js v2 does not expose a direct WebAuthn enrollment
 *     method. Replace with `supabase.auth.mfa.enroll({ factorType: 'webauthn' })`
 *     once that is generally available.
 *   - `signInWithPasskey` uses the browser's native WebAuthn credential.get() and
 *     is a best-effort implementation; it requires a challenge from the server side.
 */

import { supabase } from './supabase';

// ── Email / password ──────────────────────────────────────────────────────────

/**
 * Sign in an existing user with email + password.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ user: object|null, error: object|null }>}
 */
export async function signInWithEmail(email, password) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    return { user: data?.user ?? null, error };
  } catch (err) {
    return { user: null, error: err };
  }
}

/**
 * Create a new account with email + password.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ user: object|null, error: object|null }>}
 */
export async function signUpWithEmail(email, password) {
  try {
    const { data, error } = await supabase.auth.signUp({ email, password });
    return { user: data?.user ?? null, error };
  } catch (err) {
    return { user: null, error: err };
  }
}

/**
 * Sign out the current user.
 * @returns {Promise<{ error: object|null }>}
 */
export async function signOut() {
  try {
    const { error } = await supabase.auth.signOut();
    return { error };
  } catch (err) {
    return { error: err };
  }
}

// ── Session ───────────────────────────────────────────────────────────────────

/**
 * Returns the current session object, or null if not signed in.
 * @returns {Promise<object|null>}
 */
export async function getSession() {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session ?? null;
  } catch {
    return null;
  }
}

/**
 * Subscribes to auth state changes (sign-in, sign-out, token refresh).
 * @param {function} callback - Called with (event, session).
 * @returns {function} Unsubscribe function — call it in useEffect cleanup.
 */
export function onAuthStateChange(callback) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(callback);
  return () => subscription.unsubscribe();
}

// ── Passkey / WebAuthn (best-effort) ──────────────────────────────────────────

/**
 * Attempts to register a passkey for the currently signed-in user.
 *
 * CURRENT IMPLEMENTATION: Falls back to TOTP MFA enrollment because
 * @supabase/supabase-js v2 does not yet expose a direct WebAuthn enrollment API.
 *
 * TODO: Replace with `supabase.auth.mfa.enroll({ factorType: 'webauthn' })`
 * once Supabase WebAuthn MFA is generally available.
 *
 * @param {string} _email - User email (unused in TOTP fallback, kept for API symmetry).
 * @returns {Promise<{ data: object|null, error: object|null }>}
 */
export async function registerPasskey(_email) {
  try {
    // Fallback: enroll TOTP factor
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
    return { data, error };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Attempts to sign in using a WebAuthn credential stored in the browser.
 *
 * CURRENT IMPLEMENTATION: This is a stub. Full WebAuthn sign-in requires a
 * server-issued challenge which Supabase does not yet surface in the JS client.
 * The button in LoginScreen is hidden when WebAuthn is not supported.
 *
 * @returns {Promise<{ user: object|null, error: object|null }>}
 */
export async function signInWithPasskey() {
  // Check if WebAuthn is available
  if (!window.PublicKeyCredential) {
    return { user: null, error: new Error('WebAuthn is not supported in this browser.') };
  }

  // Stub: return a not-implemented error until Supabase surfaces a challenge endpoint.
  return {
    user: null,
    error: new Error('Passkey sign-in requires server-side WebAuthn challenge support. Use email + password for now.'),
  };
}

/**
 * Returns true if the current browser supports WebAuthn / passkeys.
 * @returns {boolean}
 */
export function isPasskeySupported() {
  return typeof window !== 'undefined' && Boolean(window.PublicKeyCredential);
}

// ── Phone OTP ──────────────────────────────────────────────────────────────────

/**
 * Sends a one-time SMS code to a phone number in E.164 form (e.g. "+15551234567").
 * Requires a phone provider (Twilio etc.) OR a test number configured in the
 * Supabase dashboard under Authentication → Providers → Phone. Until then this
 * resolves with an error at runtime even though the UI is correct.
 * @param {string} phone
 * @returns {Promise<{ error: object|null }>}
 */
export async function sendPhoneOtp(phone) {
  try {
    const { error } = await supabase.auth.signInWithOtp({ phone });
    return { error };
  } catch (err) {
    return { error: err };
  }
}

/**
 * Verifies the SMS code and establishes a session.
 * @param {string} phone - The E.164 phone the code was requested for.
 * @param {string} token - The 6-digit code the user entered.
 * @returns {Promise<{ user: object|null, session: object|null, error: object|null }>}
 */
export async function verifyPhoneOtp(phone, token) {
  try {
    const { data, error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
    return { user: data?.user ?? null, session: data?.session ?? null, error };
  } catch (err) {
    return { user: null, session: null, error: err };
  }
}

// ── Profiles (public.profiles — see supabase-profiles.sql) ───────────────────────

/**
 * Fetches the signed-in user's profile row, or null if they have none yet.
 * @param {string} userId
 * @returns {Promise<{ profile: object|null, error: object|null }>}
 */
export async function fetchProfile(userId) {
  try {
    const { data, error } = await supabase
      .from('profiles').select('*').eq('id', userId).maybeSingle();
    return { profile: data ?? null, error };
  } catch (err) {
    return { profile: null, error: err };
  }
}

/**
 * Inserts or updates the signed-in user's profile.
 * @param {object} profile - Row matching the profiles table (must include `id`).
 * @returns {Promise<{ profile: object|null, error: object|null }>}
 */
export async function saveProfile(profile) {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .upsert({ ...profile, updated_at: new Date().toISOString() }, { onConflict: 'id' })
      .select().maybeSingle();
    return { profile: data ?? null, error };
  } catch (err) {
    return { profile: null, error: err };
  }
}
