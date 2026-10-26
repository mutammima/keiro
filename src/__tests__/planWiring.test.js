/**
 * planWiring.test.js
 *
 * The real chain from plan.js through services/db.js to the Supabase client:
 * only the client is faked. plan.test.js replaces getMyPlan, so a drift between
 * what db.js returns and what plan.js reads (the RPC's name, the answer's field
 * names) would pass every test there and fail on a phone.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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
vi.mock('../utils/syncQueue', () => ({ releaseHeldSyncs: vi.fn() }));

import { STORAGE_KEYS, EVENTS } from '../utils/constants';

// db.js remembers the signed-in user between calls, so every test gets fresh modules (as myPlanRpc.test.js does).
let supabase, releaseHeldSyncs, refreshPlan, getCachedPlan, onFreePlan;
const abortSignal = vi.fn();
const serverSays = (o = {}) => ({
  pro: false, source: null, status: null, pro_until: null, interval: null, cancels: false,
  used_this_month: 4, month: '2026-10', free_limit: 20, ...o,
});

beforeEach(async () => {
  localStorage.clear();
  vi.resetModules();
  ({ supabase } = await import('../services/supabase'));
  ({ releaseHeldSyncs } = await import('../utils/syncQueue'));
  ({ refreshPlan, getCachedPlan, onFreePlan } = await import('../utils/plan'));
  supabase.auth.getUser.mockReset().mockResolvedValue({ data: { user: { id: 'u1' } } });
  abortSignal.mockReset();
  supabase.rpc.mockReset().mockReturnValue({ abortSignal });   // supabase-js's rpc() returns a builder
});

describe('plan.js → db.js → the Supabase client', () => {
  it('a Free answer from my_plan() is cached in the app\'s shape, moves the driver into Easy Mode and is announced', async () => {
    abortSignal.mockResolvedValue({ data: serverSays(), error: null });
    const heard = vi.fn();
    window.addEventListener(EVENTS.PLAN_CHANGE, heard);
    const r = await refreshPlan();
    window.removeEventListener(EVENTS.PLAN_CHANGE, heard);

    expect(supabase.rpc).toHaveBeenCalledWith('my_plan');
    expect(r.ok).toBe(true);
    expect(getCachedPlan()).toMatchObject({ pro: false, usedThisMonth: 4, month: '2026-10', proUntil: null, cancels: false });
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.EASY_MODE))).toBe(true);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(releaseHeldSyncs).not.toHaveBeenCalled();
  });

  it('a Pro answer keeps the paid-until date, and releases the uploads held for the limit', async () => {
    abortSignal.mockResolvedValue({ data: serverSays({ pro: true, source: 'stripe', status: 'active', pro_until: '2026-11-16T12:00:00Z', interval: 'year', cancels: true }), error: null });
    expect((await refreshPlan()).ok).toBe(true);
    expect(getCachedPlan()).toMatchObject({ pro: true, source: 'stripe', status: 'active', proUntil: '2026-11-16T12:00:00Z', interval: 'year', cancels: true });
    expect(localStorage.getItem(STORAGE_KEYS.EASY_MODE)).toBeNull();
    expect(releaseHeldSyncs).toHaveBeenCalledTimes(1);
  });

  it('signed out: no request is made, and nothing is cached or changed', async () => {
    supabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    expect((await refreshPlan()).ok).toBe(false);
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(getCachedPlan()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.EASY_MODE)).toBeNull();
  });

  it('my_plan() missing (the SQL not run yet): no answer, and the account stays Free', async () => {
    abortSignal.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.my_plan' } });
    expect((await refreshPlan()).ok).toBe(false);
    expect(getCachedPlan()).toBeNull();
    expect(onFreePlan()).toBe(true);
  });

  it('a request that throws (offline) is no answer either', async () => {
    abortSignal.mockRejectedValue(new TypeError('Failed to fetch'));
    expect((await refreshPlan()).ok).toBe(false);
    expect(getCachedPlan()).toBeNull();
  });
});
