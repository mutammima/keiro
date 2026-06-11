/**
 * connectionStorage.js — invite-only driver ↔ store connections.
 *
 * Local-first, cloud best-effort (mirrors the rest of the app):
 *   • An invite is created with a random, shareable code + link. It is saved to
 *     localStorage immediately so it works offline / same-device, then pushed to
 *     Supabase so the other party can redeem it on any device.
 *   • The other party opens the shared link → captureInviteFromUrl() stashes the
 *     code → redeemPendingInvite() runs once they're authenticated, flipping the
 *     connection to 'active'. If the cloud isn't reachable yet, the code stays
 *     queued and retries on the next app load.
 *
 * Cloud requires the `connections` table (supabase-connections.sql). Until that
 * is created the code is still generated and shareable; cross-device
 * auto-establishment simply waits for the table + an authenticated redeemer.
 *
 * Keys:
 *   inv_connections     — Connection[] (local cache)
 *   inv_pending_invite  — string code captured from an invite link, awaiting redeem
 */

import { lsGet, lsSet, getBusinessName } from './storage';
import * as db from '../services/db';

// Ambiguity-free alphabet — no I, L, O, 0, 1 so codes are easy to read aloud.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

// ─── Code + link ───────────────────────────────────────────────────────────────

export function genInviteCode(len = 6) {
  let out = '';
  try {
    const buf = new Uint32Array(len);
    crypto.getRandomValues(buf);
    for (let i = 0; i < len; i++) out += ALPHABET[buf[i] % ALPHABET.length];
  } catch {
    for (let i = 0; i < len; i++) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

export function inviteLink(code) {
  const origin = (typeof window !== 'undefined' && window.location && window.location.origin) || '';
  return `${origin}/?invite=${code}`;
}

// ─── Local cache ────────────────────────────────────────────────────────────────
//
// Connection shape (camelCase):
// {
//   id, inviteCode, inviterRole: 'driver'|'store_owner', inviterName,
//   driverUserId, storeUserId, status: 'pending'|'active', invitedBy, createdAt
// }

export function getConnections() {
  return lsGet('inv_connections', []);
}

function upsertLocal(conn) {
  const list = getConnections().filter(c => c.id !== conn.id);
  list.unshift(conn);
  lsSet('inv_connections', list);
}

export function getActiveConnections() {
  return getConnections().filter(c => c.status === 'active');
}

export function getPendingInvites() {
  return getConnections().filter(c => c.status === 'pending');
}

function mapRow(row) {
  return {
    id:           row.id,
    inviteCode:   row.invite_code,
    inviterRole:  row.inviter_role,
    inviterName:  row.inviter_name || '',
    redeemerName: row.redeemer_name || '',
    driverUserId: row.driver_user_id || null,
    storeUserId:  row.store_user_id  || null,
    status:       row.status,
    invitedBy:    row.invited_by || null,
    createdAt:    row.created_at,
    activatedAt:  row.activated_at || null,
  };
}

/** Pull the user's connections from the cloud and refresh the local cache. */
export async function loadConnectionsFromCloud() {
  const { data, error } = await db.getConnections();
  if (error || !data) return getConnections();
  const mapped = data.map(mapRow);
  lsSet('inv_connections', mapped);
  return mapped;
}

// ─── Create / reuse / cancel an invite ──────────────────────────────────────────

/** Create a brand-new pending invite (local-first, cloud best-effort). */
export async function createInvite(inviterRole, inviterName = '') {
  const conn = {
    id:           `conn_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    inviteCode:   genInviteCode(),
    inviterRole,
    inviterName,
    driverUserId: null,
    storeUserId:  null,
    status:       'pending',
    invitedBy:    null,
    createdAt:    new Date().toISOString(),
  };
  upsertLocal(conn);
  db.createConnection(conn)
    .then(({ error }) => { if (error) console.error('createConnection cloud error', error); })
    .catch(e => console.error('createConnection cloud error', e));
  return conn;
}

/**
 * Reuse the most recent still-pending invite for this role if one exists,
 * otherwise create a new one. Keeps a stable code instead of spawning a fresh
 * invite every time the share sheet is opened.
 */
export async function getOrCreateInvite(inviterRole, inviterName = '') {
  const existing = getPendingInvites().find(c => c.inviterRole === inviterRole);
  if (existing) return existing;
  return createInvite(inviterRole, inviterName);
}

export function cancelInvite(id) {
  lsSet('inv_connections', getConnections().filter(c => c.id !== id));
  db.deleteConnection(id).catch(e => console.error('deleteConnection cloud error', e));
}

// ─── Redeem an invite link ───────────────────────────────────────────────────────

/**
 * Read an `?invite=CODE` (or `#invite=CODE`) param, stash the code for later
 * redemption, and strip it from the URL so refreshes/shares don't re-trigger.
 * Returns the captured code, or null.
 */
export function captureInviteFromUrl() {
  try {
    const url = new URL(window.location.href);
    let code = url.searchParams.get('invite');
    if (!code && url.hash.includes('invite=')) {
      const m = url.hash.match(/invite=([A-Za-z0-9]+)/);
      if (m) code = m[1];
    }
    if (!code) return null;
    code = code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
    if (!code) return null;
    lsSet('inv_pending_invite', code);
    url.searchParams.delete('invite');
    if (url.hash.includes('invite=')) url.hash = '';
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    return code;
  } catch {
    return null;
  }
}

export function getPendingInviteCode() {
  return lsGet('inv_pending_invite', null);
}

export function clearPendingInvite() {
  try { localStorage.removeItem('inv_pending_invite'); } catch {}
}

/**
 * If a code is queued, attempt to redeem it against the cloud. On success the
 * now-active connection is cached locally and the queue is cleared. On failure
 * (no session, table missing, transient error) the code stays queued so the
 * next app load retries it.
 * @returns {Promise<{ ok: boolean, reason?: string, connection?: object, error?: any }>}
 */
export async function redeemPendingInvite() {
  const code = getPendingInviteCode();
  if (!code) return { ok: false, reason: 'none' };

  const { data, error } = await db.redeemConnection(code, getBusinessName() || '');
  if (error || !data) {
    // Terminal outcomes — drop the queued code so it stops retrying forever.
    if (error && /own invite|invite not found|already used/i.test(error.message || '')) {
      clearPendingInvite();
    }
    return { ok: false, reason: error ? 'error' : 'pending', error };
  }

  const conn = mapRow(data);
  upsertLocal(conn);
  clearPendingInvite();
  return { ok: true, connection: conn };
}
