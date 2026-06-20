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
