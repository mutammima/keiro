/**
 * mfa.js — DORMANT. Nothing imports this module, and nothing should until the
 * gap described below is closed.
 *
 * ── Why this is parked ──────────────────────────────────────────────────────
 * Settings.jsx used to expose a "Two-Factor Auth (2FA)" row that called
 * enrollTotp() and verifyTotp(). Enrolment genuinely worked: Supabase created
 * a TOTP factor and the user's authenticator app showed codes.
 *
 * But the second factor was NEVER DEMANDED AT SIGN-IN. `signInWithEmail` in
 * services/auth.js calls supabase.auth.signInWithPassword and returns as soon
 * as it succeeds. There is no Authentication Assurance Level check anywhere in
 * this codebase — no getAuthenticatorAssuranceLevel(), no aal2 gate, no
 * challenge step. A user who enrolled could still sign in with email and
 * password alone, while the UI told them "Authenticator app is active".
 *
 * That is worse than having no 2FA: it invites someone to pick a weaker
 * password because they believe a second factor is protecting the account.
 * So the UI was removed rather than left standing.
 *
 * ── What must exist before this is re-exposed ───────────────────────────────
 * 1. signInWithEmail must call supabase.auth.mfa.getAuthenticatorAssuranceLevel()
 *    after a successful password step, and when currentLevel is 'aal1' while
 *    nextLevel is 'aal2', block entry and challenge for the TOTP code.
 * 2. That challenge needs UI — a code-entry screen between sign-in and the app,
 *    which does not exist today.
 * 3. An unenroll path. The removed UI had none: once enabled, a user could not
 *    turn 2FA off, so a lost authenticator was unrecoverable.
 * 4. A recovery story for a lost device (backup codes, or a documented manual
 *    process), or enforcement will lock people out permanently.
 *
 * Re-exposing enrolment without (1) reintroduces the same false claim. Adding
 * (1) without (3) and (4) locks out anyone who enrolled and lost their phone —
 * including anyone who enrolled while the old UI was live.
 *
 * Kept as exports rather than deleted so the working Supabase call shapes are
 * not lost, and so the reasoning above travels with them.
 */

import { supabase } from './supabase';

/**
 * Begins TOTP enrolment. Returns the QR code to show the user plus the factor
 * id needed by verifyTotp().
 * @returns {Promise<{ factorId: string|null, qrCode: string|null, error: object|null }>}
 */
export async function enrollTotp() {
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
  return {
    factorId: data?.id ?? null,
    qrCode:   data?.totp?.qr_code ?? null,
    error,
  };
}

/**
 * Confirms enrolment with the 6-digit code from the user's authenticator app.
 * @param {string} factorId - from enrollTotp()
 * @param {string} code     - 6 digits
 * @returns {Promise<{ error: object|null }>}
 */
export async function verifyTotp(factorId, code) {
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  return { error };
}
