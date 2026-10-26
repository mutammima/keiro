/**
 * myPlanRpc.test.js
 *
 * The app asks Supabase for this account's plan and this month's invoice count
 * (supabase-pricing.sql, my_plan()). Only a signed-in account asks; any error
 * (including the function not existing yet, before the SQL is run, or a
 * timeout) means "no answer" — callers keep what they had.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withoutAbortSignalTimeout } from './helpers/withoutAbortSignalTimeout';

vi.mock('../services/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe() {} } } })),
    },
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

let supabase, db;
const abortSignal = vi.fn();
beforeEach(async () => {
  vi.resetModules();
  ({ supabase } = await import('../services/supabase'));
  supabase.auth.getUser.mockReset();
  supabase.rpc.mockReset();
  abortSignal.mockReset();
  // supabase-js's rpc() returns a builder; the app chains .abortSignal() before awaiting it.
  supabase.rpc.mockReturnValue({ abortSignal });
  db = await import('../services/db');
});
const signedIn = () => supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
const signedOut = () => supabase.auth.getUser.mockResolvedValue({ data: { user: null } });

const ANSWER = { pro: false, source: null, status: null, pro_until: null, interval: null, cancels: false, used_this_month: 3, month: '2026-10', free_limit: 20 };

describe('db.getMyPlan', () => {
  it('without a session: no data, an error, and the server is never asked', async () => {
    signedOut();
    const r = await db.getMyPlan();
    expect(r.data).toBeNull();
    expect(r.error).toBeInstanceOf(Error);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('signed in: calls my_plan with a timeout signal and returns the answer', async () => {
    signedIn();
    abortSignal.mockResolvedValue({ data: ANSWER, error: null });
    expect(await db.getMyPlan()).toEqual({ data: ANSWER, error: null });
    expect(supabase.rpc).toHaveBeenCalledWith('my_plan');
    expect(abortSignal).toHaveBeenCalledTimes(1);
    expect(abortSignal.mock.calls[0][0]).toBeInstanceOf(AbortSignal);
  });

  it('on iOS 15 (no AbortSignal.timeout) it still asks my_plan, with a signal, and gets the answer', async () => {
    // Without this the owner's dad (free forever) was treated as Free: the call threw before the request.
    signedIn();
    abortSignal.mockResolvedValue({ data: ANSWER, error: null });
    await withoutAbortSignalTimeout(async () => {
      expect(await db.getMyPlan()).toEqual({ data: ANSWER, error: null });
    });
    expect(supabase.rpc).toHaveBeenCalledWith('my_plan');
    expect(abortSignal).toHaveBeenCalledTimes(1);
    expect(abortSignal.mock.calls[0][0]).toBeInstanceOf(AbortSignal);
  });

  it('...and the 8 s limit still applies there: the signal aborts at 8 s, not before', async () => {
    signedIn();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      abortSignal.mockImplementation(signal => new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      }));
      await withoutAbortSignalTimeout(async () => {
        const answer = db.getMyPlan();
        await vi.advanceTimersByTimeAsync(7999);
        const signal = abortSignal.mock.calls[0][0];
        expect(signal.aborted).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        expect(signal.aborted).toBe(true);
        const r = await answer;
        expect(r.data).toBeNull();
        expect(r.error).toBeTruthy();
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('an RPC error means no data (e.g. before the SQL is run), and the error is passed on', async () => {
    signedIn();
    const error = { code: 'PGRST202', message: 'Could not find the function public.my_plan' };
    abortSignal.mockResolvedValue({ data: ANSWER, error });
    const r = await db.getMyPlan();
    expect(r.data).toBeNull();
    expect(r.error).toBe(error);
  });

  it('a thrown network error or timeout is caught: no data, the error passed on', async () => {
    signedIn();
    const boom = new TypeError('Failed to fetch');
    abortSignal.mockRejectedValue(boom);
    expect(await db.getMyPlan()).toEqual({ data: null, error: boom });
  });

  it('no answer from the server (my_plan() returns null) is null data, no error', async () => {
    signedIn();
    abortSignal.mockResolvedValue({ data: undefined, error: null });
    expect(await db.getMyPlan()).toEqual({ data: null, error: null });
  });
});
