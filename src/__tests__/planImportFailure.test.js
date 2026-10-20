/**
 * planImportFailure.test.js
 *
 * plan.js loads services/db (and utils/syncQueue) with import() so that every screen
 * can import it without the Supabase client. A chunk that fails to load (offline in
 * the middle of an update) rejects that import(); refreshPlan promises never to
 * reject, because PlanRunner awaits it unguarded.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STORAGE_KEYS, EVENTS } from '../utils/constants';

const PRO = {
  data: { pro: true, source: 'manual', status: 'active', pro_until: null, interval: null, cancels: false, used_this_month: 0, month: '2026-10' },
  error: null,
};
/** What a chunk that cannot be fetched does to import(). */
const failing = (name) => () => { throw new Error(`Failed to fetch dynamically imported module: ${name}`); };

let warn;
beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
  vi.doUnmock('../services/db');
  vi.doUnmock('../utils/syncQueue');
});

describe('refreshPlan when a lazy import fails', () => {
  it('the services/db import failing resolves { ok: false } and changes nothing', async () => {
    vi.doMock('../services/db', failing('db'));
    const { refreshPlan } = await import('../utils/plan');
    await expect(refreshPlan()).resolves.toEqual({ ok: false });
    expect(localStorage.getItem(STORAGE_KEYS.PLAN_CACHE)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.EASY_MODE)).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it('...and the next refresh tries the import again (the failure is not remembered)', async () => {
    vi.doMock('../services/db', failing('db'));
    const { refreshPlan } = await import('../utils/plan');
    await refreshPlan();
    vi.doMock('../services/db', () => ({ getMyPlan: vi.fn(async () => PRO) }));
    vi.doMock('../utils/syncQueue', () => ({ releaseHeldSyncs: vi.fn() }));
    vi.resetModules();   // a fresh module registry, as a retried chunk load would be
    const again = await import('../utils/plan');
    expect((await again.refreshPlan()).ok).toBe(true);
  });

  it('the utils/syncQueue import failing (releasing held uploads) resolves { ok: false }, but the answer is cached and announced', async () => {
    vi.doMock('../services/db', () => ({ getMyPlan: vi.fn(async () => PRO) }));
    vi.doMock('../utils/syncQueue', failing('syncQueue'));
    const { refreshPlan } = await import('../utils/plan');
    const heard = vi.fn();
    window.addEventListener(EVENTS.PLAN_CHANGE, heard);
    await expect(refreshPlan()).resolves.toEqual({ ok: false });
    window.removeEventListener(EVENTS.PLAN_CHANGE, heard);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.PLAN_CACHE))).toMatchObject({ pro: true, source: 'manual' });
    expect(heard).toHaveBeenCalledTimes(1);
  });
});
