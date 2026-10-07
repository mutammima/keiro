/**
 * dbAuthTimeout.test.js
 *
 * Every db.* call starts by asking supabase-js who the user is. While the
 * server is unreachable, supabase-js holds its session lock retrying a token
 * refresh, so that question hangs — and with it every screen ("Loading
 * invoices…" for over a minute, measured Oct 2026), even though the storage
 * layer is built to fall back to the phone's copy the moment a db call
 * reports "no session". So the question is timeboxed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let authListener;
vi.mock('../services/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
      onAuthStateChange: vi.fn(cb => { authListener = cb; return { data: { subscription: { unsubscribe() {} } } }; }),
    },
    from: vi.fn(),
  },
}));

let supabase;
let db;

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  ({ supabase } = await import('../services/supabase'));
  supabase.auth.getUser.mockReset();
  db = await import('../services/db');
});
afterEach(() => vi.useRealTimers());

describe('db calls while the auth server is unreachable', () => {
  it('give up on "who is the user" after the timeout and report no session', async () => {
    supabase.auth.getUser.mockReturnValue(new Promise(() => {})); // supabase-js stuck retrying

    const pending = db.getInvoices();
    await vi.advanceTimersByTimeAsync(4000);

    expect(await pending).toEqual({ data: null, error: expect.any(Error) });
  });

  it('answer at once for a while after a timeout, instead of every call waiting again', async () => {
    supabase.auth.getUser.mockReturnValue(new Promise(() => {}));
    const first = db.getInvoices();
    await vi.advanceTimersByTimeAsync(4000);
    await first;

    const second = await db.getInvoices();

    expect(second.error).toBeTruthy();
    expect(supabase.auth.getUser).toHaveBeenCalledTimes(1);
  });

  it('ask again once that window has passed', async () => {
    supabase.auth.getUser.mockReturnValue(new Promise(() => {}));
    const first = db.getInvoices();
    await vi.advanceTimersByTimeAsync(4000);
    await first;
    await vi.advanceTimersByTimeAsync(30000);

    supabase.auth.getUser.mockResolvedValueOnce({ data: { user: null } });
    await db.getInvoices();

    expect(supabase.auth.getUser).toHaveBeenCalledTimes(2);
  });

  it('use the session as soon as the server is back (TOKEN_REFRESHED)', async () => {
    supabase.auth.getUser.mockReturnValue(new Promise(() => {}));
    const first = db.getInvoices();
    await vi.advanceTimersByTimeAsync(4000);
    await first;

    authListener('TOKEN_REFRESHED', { user: { id: 'u1' } });

    expect(await db.whoAmI()).toBe('u1');
  });
});
