/**
 * auth.js — authentication helpers wrapping the Supabase auth API.
 *
 * All functions return { user, error } or { error } for consistency.
 */

import { Capacitor } from '@capacitor/core';
import { supabase } from './supabase';

// The custom URL scheme registered in ios/App/App/Info.plist
// (CFBundleURLTypes) that Google's consent screen redirects back into on
// native — see initOAuthDeepLinkHandler below for why this exists. Must also
// be added to the Supabase project's Auth -> URL Configuration -> Redirect
// URLs allowlist, or signInWithOAuth rejects it.
const NATIVE_OAUTH_REDIRECT = 'keiro://auth-callback';

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
 * Kick off Google sign-in.
 *
 * Web: the browser NAVIGATES AWAY to Google and returns to the app's origin,
 * where supabase-js (detectSessionInUrl) picks up the session — so this only
 * "returns" on failure to start the flow.
 *
 * Native (Capacitor): Google's OAuth consent screen refuses to load inside an
 * embedded WebView ("disallowed_useragent") — every Capacitor/Cordova/React
 * Native app hits this, it's a Google policy, not a bug. The fix is the
 * standard native pattern: open the consent screen in the SYSTEM browser
 * (@capacitor/browser -> SFSafariViewController on iOS) instead of navigating
 * our own WebView, using skipBrowserRedirect so supabase-js hands back the
 * URL instead of navigating immediately. Google redirects to our custom URL
 * scheme when done; initOAuthDeepLinkHandler (called once at startup) catches
 * that hand-off and exchanges the code for a session.
 * @returns {Promise<{ error: object|null }>}
 */
export async function signInWithGoogle() {
  try {
    // Leaving for Google while our auth server is down lands the user on a
    // dead "site can't be reached" page outside the app. Check first.
    if (!(await isServerReachable())) return { error: new Error(SERVER_UNREACHABLE_MESSAGE) };
    if (Capacitor.isNativePlatform()) {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: NATIVE_OAUTH_REDIRECT, skipBrowserRedirect: true },
      });
      if (error || !data?.url) return { error: error || new Error('No OAuth URL returned') };
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({ url: data.url, presentationStyle: 'popover' });
      return { error: null };
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    return { error };
  } catch (err) {
    return { error: err };
  }
}

/**
 * Wires the native deep-link hand-off from signInWithGoogle above. Call once
 * at app startup (no-op on web). When Google finishes and the system browser
 * redirects to keiro://auth-callback, iOS routes that to the app via the App
 * plugin's appUrlOpen event; this closes the system browser and exchanges the
 * PKCE code in the callback URL for a real session, which fires
 * onAuthStateChange the same way a web sign-in does — AuthGate needs no
 * native-specific handling.
 */
export function initOAuthDeepLinkHandler() {
  if (!Capacitor.isNativePlatform()) return;
  import('@capacitor/app').then(({ App }) => {
    App.addListener('appUrlOpen', async ({ url }) => {
      if (!url || !url.startsWith(NATIVE_OAUTH_REDIRECT)) return;
      const { Browser } = await import('@capacitor/browser');
      Browser.close().catch(() => {}); // best-effort — may already be closing itself
      const { error } = await supabase.auth.exchangeCodeForSession(url);
      if (error) console.error('[Keiro] Google sign-in code exchange failed', error);
    });
  });
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

// Device-level preferences that survive a sign-out — they belong to the phone,
// not the account. Everything else inv_-prefixed is account data (role, caches,
// flags, PIN) and MUST be cleared, or the next account to sign in on this
// device inherits the previous user's identity: hasCompletedOnboarding() sees
// the stale role and skips onboarding, and the old account's cached invoices
// render in the new account's UI.
const DEVICE_PREF_KEYS = new Set(['inv_dark_mode', 'inv_accent_color', 'inv_density', 'inv_easy_mode']);

function clearAccountLocalData() {
  try {
    const doomed = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('inv_') && !DEVICE_PREF_KEYS.has(k)) doomed.push(k);
    }
    doomed.forEach(k => localStorage.removeItem(k));
  } catch { /* storage unavailable — nothing to clear */ }
}

/**
 * Sign out the current user and clear their account-scoped local data
 * (device preferences like theme/accent/density are kept).
 * @returns {Promise<{ error: object|null }>}
 */
export async function signOut() {
  try {
    const { error } = await supabase.auth.signOut();
    clearAccountLocalData();
    return { error };
  } catch (err) {
    clearAccountLocalData();
    return { error: err };
  }
}

// ── Server unreachable ────────────────────────────────────────────────────────
// The free Supabase project pauses after a week without use, and its host then
// stops resolving. These helpers let the app say so plainly and keep a
// signed-in device usable on its local data until the server is back.

export const SERVER_UNREACHABLE_MESSAGE =
  "Can't reach Keiro right now. Check your connection — if it's working, our server may be down. Try again in a few minutes.";

/**
 * True for a request that never got an answer — offline, DNS failure, or the
 * server down — as opposed to the server answering with an error. Covers each
 * browser's fetch TypeError and supabase-js's AuthRetryableFetchError.
 * @param {unknown} err
 */
export function isServerUnreachableError(err) {
  if (!err) return false;
  if (err.name === 'AuthRetryableFetchError') return true;
  return /failed to fetch|load failed|networkerror|network request failed/i.test(err.message || '');
}

/**
 * Asks the auth server's health endpoint whether it is up, giving up after
 * `timeoutMs`. Cheap: a few bytes, no session needed.
 * @returns {Promise<boolean>}
 */
export async function isServerReachable(timeoutMs = 3000) {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url) return false;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${url}/auth/v1/health`, { headers: { apikey: key || '' }, signal: ctrl.signal });
    return !!res?.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Does this device hold a session supabase-js can try to refresh? */
function hasStoredSession() {
  try {
    const raw = localStorage.getItem(supabase.auth.storageKey);
    return !!(raw && JSON.parse(raw)?.refresh_token);
  } catch {
    return false;
  }
}

/**
 * The session to start the app with, and whether to start it offline.
 *
 * An expired access token makes getSession() refresh it, and while the server
 * is unreachable supabase-js retries for 30-60s before giving up. So this
 * waits at most `timeoutMs`. If the refresh couldn't get an answer (or is
 * still trying) and the device holds a session, it is `offline`: the app
 * opens on local data, and supabase-js keeps refreshing in the background —
 * it only deletes a stored session the server REJECTS — firing
 * TOKEN_REFRESHED once the server is back.
 * @returns {Promise<{ session: object|null, offline: boolean }>}
 */
export async function getSessionState({ timeoutMs = 5000 } = {}) {
  const stored = hasStoredSession();
  let timer;
  const timedOut = new Promise(resolve => { timer = setTimeout(() => resolve({ timedOut: true }), timeoutMs); });
  const result = await Promise.race([
    supabase.auth.getSession().catch(error => ({ data: { session: null }, error })),
    timedOut,
  ]);
  clearTimeout(timer);

  if (result.timedOut) return { session: null, offline: stored };
  const session = result.data?.session ?? null;
  if (session) return { session, offline: false };
  return { session: null, offline: stored && isServerUnreachableError(result.error) };
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
