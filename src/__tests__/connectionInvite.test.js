/**
 * connectionInvite.test.js
 *
 * Covers the connection invite → redeem flow end to end
 * (src/utils/connectionStorage.js): creating an invite, capturing an
 * `?invite=CODE` link param pre-auth, and redeeming it post-auth via the
 * `redeem_connection` RPC — including the failure paths (terminal error vs.
 * "still pending, retry later"), since a silent failure here means two
 * accounts that never actually link.
 *
 * The cloud boundary (services/db.js) is mocked — this exercises the local
 * cache + retry-queue logic, not a real Supabase RPC round-trip.
 *
 * Environment: jsdom (needs window.location/history + localStorage).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/db', () => ({
  createConnection: vi.fn(async () => ({ error: null })),
  redeemConnection: vi.fn(),
  getConnections: vi.fn(async () => ({ data: [], error: null })),
  whoAmI: vi.fn(async () => null),
}));
vi.mock('../utils/syncNotify', () => ({ notifySyncError: vi.fn() }));

import * as db from '../services/db';
import {
  genInviteCode,
  createInvite,
  getPendingInvites,
  captureInviteFromUrl,
  getPendingInviteCode,
  redeemPendingInvite,
  getConnections,
} from '../utils/connectionStorage.js';

describe('connectionStorage — invite → redeem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.history.pushState({}, '', '/');
  });

  it('genInviteCode produces a code of the requested length from the unambiguous alphabet', () => {
    const code = genInviteCode(6);
    expect(code).toHaveLength(6);
    expect(code).toMatch(/^[A-Z0-9]+$/);
    // No visually-ambiguous characters (I, L, O, 0, 1) — codes are read aloud.
    expect(code).not.toMatch(/[IL0O1]/);
  });

  it('createInvite saves a pending invite locally and pushes it to the cloud', async () => {
    const conn = await createInvite('driver', 'Mo the Driver');

    expect(conn.status).toBe('pending');
    expect(conn.inviterRole).toBe('driver');
    expect(getPendingInvites()).toHaveLength(1);
    expect(getPendingInvites()[0].id).toBe(conn.id);

    // Cloud push is fire-and-forget in createInvite — flush microtasks.
    await Promise.resolve();
    await Promise.resolve();
    expect(db.createConnection).toHaveBeenCalledWith(expect.objectContaining({
      id: conn.id, inviteCode: conn.inviteCode, inviterRole: 'driver',
    }));
  });

  it('captureInviteFromUrl reads ?invite=CODE, stashes it, and strips it from the URL', () => {
    window.history.pushState({}, '', '/?invite=ab12-cd!!&foo=bar');

    const captured = captureInviteFromUrl();

    // Uppercased, non-alphanumerics stripped.
    expect(captured).toBe('AB12CD');
    expect(getPendingInviteCode()).toBe('AB12CD');
    // The invite param is gone but unrelated params survive.
    expect(window.location.search).not.toContain('invite');
    expect(window.location.search).toContain('foo=bar');
  });

  it('captureInviteFromUrl returns null and stashes nothing when there is no invite param', () => {
    window.history.pushState({}, '', '/?foo=bar');
    expect(captureInviteFromUrl()).toBeNull();
    expect(getPendingInviteCode()).toBeNull();
  });

  it('redeemPendingInvite activates the connection and clears the queue on success', async () => {
    localStorage.setItem('inv_pending_invite', JSON.stringify('AB12CD'));
    db.redeemConnection.mockResolvedValue({
      error: null,
      data: {
        id: 'conn_1', invite_code: 'AB12CD', inviter_role: 'driver', inviter_name: 'Mo',
        redeemer_name: 'Corner Store', driver_user_id: 'driver-uid', store_user_id: 'store-uid',
        status: 'active', invited_by: 'driver-uid', created_at: '2025-01-01T00:00:00Z',
        activated_at: '2025-01-02T00:00:00Z',
      },
    });

    const result = await redeemPendingInvite();

    expect(result.ok).toBe(true);
    expect(result.connection).toMatchObject({ id: 'conn_1', status: 'active', driverUserId: 'driver-uid', storeUserId: 'store-uid' });
    expect(getPendingInviteCode()).toBeNull(); // queue cleared
    expect(getConnections().find(c => c.id === 'conn_1')).toBeTruthy(); // cached locally
  });

  it('redeemPendingInvite drops the queued code on a terminal error (already used)', async () => {
    localStorage.setItem('inv_pending_invite', JSON.stringify('AB12CD'));
    db.redeemConnection.mockResolvedValue({ data: null, error: new Error('invite already used') });

    const result = await redeemPendingInvite();

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('error');
    expect(getPendingInviteCode()).toBeNull(); // terminal — stop retrying
  });

  it('redeemPendingInvite keeps the code queued to retry on a transient/no-session failure', async () => {
    localStorage.setItem('inv_pending_invite', JSON.stringify('AB12CD'));
    db.redeemConnection.mockResolvedValue({ data: null, error: new Error('no session') });

    const result = await redeemPendingInvite();

    expect(result.ok).toBe(false);
    expect(getPendingInviteCode()).toBe('AB12CD'); // still queued — next app load retries
  });

  it('redeemPendingInvite is a no-op when nothing is queued', async () => {
    const result = await redeemPendingInvite();
    expect(result).toEqual({ ok: false, reason: 'none' });
    expect(db.redeemConnection).not.toHaveBeenCalled();
  });
});
