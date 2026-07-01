/**
 * auth.js — authentication helpers wrapping the Supabase auth API.
 *
 * All functions return { user, error } or { error } for consistency.
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
 * When the project has "Confirm email" enabled, `user` is returned but
 * `session` is null until the confirmation link is clicked — callers use
 * that to show a "check your email" notice instead of proceeding.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ user: object|null, session: object|null, error: object|null }>}
 */
export async function signUpWithEmail(email, password) {
  try {
    const { data, error } = await supabase.auth.signUp({ email, password });
    return { user: data?.user ?? null, session: data?.session ?? null, error };
  } catch (err) {
    return { user: null, session: null, error: err };
  }
}

// ── Google OAuth ──────────────────────────────────────────────────────────────

/**
 * Kick off Google sign-in. On success the browser NAVIGATES AWAY to Google and
 * returns to the app's origin, where supabase-js (detectSessionInUrl) picks up
 * the session — so this only "returns" on failure to start the flow.
 * @returns {Promise<{ error: object|null }>}
 */
export async function signInWithGoogle() {
  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    return { error };
  } catch (err) {
    return { error: err };
  }
}

// ── Password recovery ─────────────────────────────────────────────────────────

/**
 * Emails a password-reset link. Clicking it lands back on the app origin with a
 * recovery session; AuthGate listens for the PASSWORD_RECOVERY event and shows
 * the set-new-password screen.
 * @param {string} email
 * @returns {Promise<{ error: object|null }>}
 */
export async function resetPassword(email) {
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    return { error };
  } catch (err) {
    return { error: err };
  }
}

/**
 * Sets a new password for the currently-authenticated user (used from the
 * recovery screen, where the reset link established a session).
 * @param {string} newPassword
 * @returns {Promise<{ user: object|null, error: object|null }>}
 */
export async function updatePassword(newPassword) {
  try {
    const { data, error } = await supabase.auth.updateUser({ password: newPassword });
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
