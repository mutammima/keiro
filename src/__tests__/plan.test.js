/**
 * plan.js — who is Pro, how many free invoices are left, and what a fresh
 * answer from the server changes (docs/specs/2026-10-16-pricing-design.md).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../services/db', () => ({ getMyPlan: vi.fn() }));
vi.mock('../utils/syncQueue', () => ({ releaseHeldSyncs: vi.fn() }));

import * as db from '../services/db';
import { releaseHeldSyncs } from '../utils/syncQueue';
import { STORAGE_KEYS, EVENTS, PLAN_COPY, PLAN_REFRESH_TIMEOUT_MS, PLAN_RPC_TIMEOUT_MS } from '../utils/constants';
import {
  getCachedPlan, isProNow, isPro, onFreePlan, invoicesUsedThisMonth, freeInvoicesLeft,
  canCreateInvoice, recordNewInvoice, resetDateLabel, refreshPlan, guardNewInvoice,
  planSummary,
} from '../utils/plan';

const NOW = new Date(2026, 9, 16, 12, 0, 0);   // Oct 16 2026, local
const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString();
const setPlan = (p) => localStorage.setItem(STORAGE_KEYS.PLAN_CACHE, JSON.stringify(p));
const json = (key) => JSON.parse(localStorage.getItem(key));
const answer = (o = {}) => ({
  data: { pro: false, source: null, status: null, pro_until: null, interval: null, cancels: false, used_this_month: 3, month: '2026-10', free_limit: 20, ...o },
  error: null,
});

beforeEach(() => {
  localStorage.clear();
  vi.mocked(db.getMyPlan).mockReset();
  vi.mocked(releaseHeldSyncs).mockReset();
});

describe('who is Pro', () => {
  it('Stripe active or retrying a card, and cancelled-but-paid-up, are Pro', () => {
    for (const status of ['active', 'past_due']) {
      expect(isProNow({ pro: true, source: 'stripe', status, proUntil: iso(NOW.getTime() + 10 * DAY) }, NOW)).toBe(true);
    }
    expect(isProNow({ pro: true, source: 'stripe', status: 'active', cancels: true, proUntil: iso(NOW.getTime() + DAY) }, NOW)).toBe(true);
  });
  it('the server saying not Pro is Free', () => {
    expect(isProNow({ pro: false, source: 'stripe', status: 'canceled', proUntil: iso(NOW.getTime() - DAY) }, NOW)).toBe(false);
  });
  it('free forever never ends; Pro until a date ends after it (plus the offline grace)', () => {
    expect(isProNow({ pro: true, source: 'manual', proUntil: null }, NOW)).toBe(true);
    expect(isProNow({ pro: true, source: 'manual', proUntil: iso(NOW.getTime() + DAY) }, NOW)).toBe(true);
    expect(isProNow({ pro: true, source: 'manual', proUntil: iso(NOW.getTime() - 4 * DAY) }, NOW)).toBe(false);
  });
  it('offline grace: 2 days past paid-until is still Pro, 4 days is Free', () => {
    const plan = { pro: true, source: 'stripe', status: 'active', proUntil: iso(NOW.getTime()) };
    expect(isProNow(plan, new Date(NOW.getTime() + 2 * DAY))).toBe(true);
    expect(isProNow(plan, new Date(NOW.getTime() + 4 * DAY))).toBe(false);
  });
  it('no answer on this phone is Free', () => {
    expect(isPro(NOW)).toBe(false);
    expect(onFreePlan(NOW)).toBe(true);
  });
  it('guests and store owners are never limited by the plan', () => {
    localStorage.setItem(STORAGE_KEYS.GUEST_MODE, 'true');
    expect(onFreePlan(NOW)).toBe(false);
    localStorage.removeItem(STORAGE_KEYS.GUEST_MODE);
    localStorage.setItem(STORAGE_KEYS.USER_ROLE, JSON.stringify('store_owner'));
    expect(onFreePlan(NOW)).toBe(false);
    expect(canCreateInvoice(NOW)).toBe(true);
  });
});

describe('the monthly count', () => {
  it('this phone counts new invoices in its local month and starts over on the 1st', () => {
    recordNewInvoice(NOW);
    recordNewInvoice(NOW);
    expect(invoicesUsedThisMonth(NOW)).toBe(2);
    expect(invoicesUsedThisMonth(new Date(2026, 10, 1, 0, 5))).toBe(0);
  });
  it('the larger of the phone\'s count and the server\'s wins, same month only', () => {
    recordNewInvoice(NOW);
    setPlan({ pro: false, usedThisMonth: 14, month: '2026-10' });
    expect(invoicesUsedThisMonth(NOW)).toBe(14);
    setPlan({ pro: false, usedThisMonth: 14, month: '2026-09' });
    expect(invoicesUsedThisMonth(NOW)).toBe(1);
  });
  it('20 used stops new invoices on Free; Pro is never limited', () => {
    setPlan({ pro: false, usedThisMonth: 19, month: '2026-10' });
    expect(freeInvoicesLeft(NOW)).toBe(1);
    expect(canCreateInvoice(NOW)).toBe(true);
    setPlan({ pro: false, usedThisMonth: 20, month: '2026-10' });
    expect(canCreateInvoice(NOW)).toBe(false);
    setPlan({ pro: true, source: 'manual', proUntil: null, usedThisMonth: 300, month: '2026-10' });
    expect(canCreateInvoice(NOW)).toBe(true);
  });
  it('recording a new invoice tells the app', () => {
    const heard = vi.fn();
    window.addEventListener(EVENTS.PLAN_CHANGE, heard);
    recordNewInvoice(NOW);
    window.removeEventListener(EVENTS.PLAN_CHANGE, heard);
    expect(heard).toHaveBeenCalledTimes(1);
  });
  it('the reset date is the 1st of next month', () => {
    expect(resetDateLabel(NOW)).toBe('Nov 1');
    expect(resetDateLabel(new Date(2026, 11, 31))).toBe('Jan 1');
  });
  it('guardNewInvoice goes ahead under the limit, and opens the limit sheet at it', () => {
    const go = vi.fn();
    const limit = vi.fn();
    window.addEventListener(EVENTS.OPEN_FREE_LIMIT, limit);
    expect(guardNewInvoice(go)).toBe(true);
    expect(go).toHaveBeenCalledTimes(1);
    setPlan({ pro: false, usedThisMonth: 20, month: '2026-10' });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    expect(guardNewInvoice(go)).toBe(false);
    vi.useRealTimers();
    expect(go).toHaveBeenCalledTimes(1);
    expect(limit).toHaveBeenCalledTimes(1);
    window.removeEventListener(EVENTS.OPEN_FREE_LIMIT, limit);
  });
});

describe('refreshPlan', () => {
  it('caches the server\'s answer in the app\'s shape and tells the app', async () => {
    db.getMyPlan.mockResolvedValue(answer({ pro: true, source: 'stripe', status: 'active', pro_until: '2026-11-16T12:00:00Z', interval: 'month' }));
    const heard = vi.fn();
    window.addEventListener(EVENTS.PLAN_CHANGE, heard);
    const r = await refreshPlan();
    window.removeEventListener(EVENTS.PLAN_CHANGE, heard);
    expect(r.ok).toBe(true);
    expect(getCachedPlan()).toMatchObject({ pro: true, source: 'stripe', status: 'active', proUntil: '2026-11-16T12:00:00Z', interval: 'month', cancels: false, usedThisMonth: 3, month: '2026-10' });
    expect(heard).toHaveBeenCalled();
  });
  it('an error or no session leaves the cache, the mode and the notes as they were', async () => {
    setPlan({ pro: true, source: 'manual', proUntil: null });
    db.getMyPlan.mockResolvedValue({ data: null, error: new Error('no session') });
    expect((await refreshPlan()).ok).toBe(false);
    expect(getCachedPlan()).toEqual({ pro: true, source: 'manual', proUntil: null });
    expect(localStorage.getItem(STORAGE_KEYS.EASY_MODE)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.PLAN_NOTICE)).toBeNull();
  });
  it('a fresh Free answer moves a driver into Easy Mode for good, with a note if they have invoices', async () => {
    localStorage.setItem(STORAGE_KEYS.LIST, JSON.stringify([{ number: 1001 }]));
    db.getMyPlan.mockResolvedValue(answer());
    await refreshPlan();
    expect(json(STORAGE_KEYS.EASY_MODE)).toBe(true);
    expect(json(STORAGE_KEYS.PLAN_NOTICE)).toBe('moved');
  });
  it('a brand-new driver (no invoices yet) gets Easy Mode without the note', async () => {
    db.getMyPlan.mockResolvedValue(answer());
    await refreshPlan();
    expect(json(STORAGE_KEYS.EASY_MODE)).toBe(true);
    expect(localStorage.getItem(STORAGE_KEYS.PLAN_NOTICE)).toBeNull();
  });
  it('Pro ending gives the "ended" note', async () => {
    setPlan({ pro: true, source: 'stripe', status: 'active', proUntil: '2026-10-01T12:00:00Z' });
    db.getMyPlan.mockResolvedValue(answer({ source: 'stripe', status: 'canceled' }));
    await refreshPlan();
    expect(json(STORAGE_KEYS.PLAN_NOTICE)).toBe('ended');
    expect(json(STORAGE_KEYS.EASY_MODE)).toBe(true);
  });
  it('Pro never touches the mode, and releases uploads held for the limit', async () => {
    db.getMyPlan.mockResolvedValue(answer({ pro: true, source: 'manual' }));
    await refreshPlan();
    expect(localStorage.getItem(STORAGE_KEYS.EASY_MODE)).toBeNull();
    expect(releaseHeldSyncs).toHaveBeenCalledTimes(1);
  });
  it('store owners and guests are never moved', async () => {
    localStorage.setItem(STORAGE_KEYS.USER_ROLE, JSON.stringify('store_owner'));
    db.getMyPlan.mockResolvedValue(answer());
    await refreshPlan();
    expect(localStorage.getItem(STORAGE_KEYS.EASY_MODE)).toBeNull();
  });
  it('two calls at once share one request', async () => {
    db.getMyPlan.mockResolvedValue(answer());
    await Promise.all([refreshPlan(), refreshPlan()]);
    expect(db.getMyPlan).toHaveBeenCalledTimes(1);
  });

  // The doc comment promises { ok: false } instead of a rejection: PlanRunner awaits it unguarded.
  describe('never rejects', () => {
    let warn;
    beforeEach(() => { warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); });
    afterEach(() => warn.mockRestore());

    it('a getMyPlan that throws resolves { ok: false } and leaves the cache, the mode and the notes as they were', async () => {
      setPlan({ pro: true, source: 'manual', proUntil: null });
      db.getMyPlan.mockRejectedValue(new Error('boom'));
      await expect(refreshPlan()).resolves.toEqual({ ok: false });
      expect(getCachedPlan()).toEqual({ pro: true, source: 'manual', proUntil: null });
      expect(localStorage.getItem(STORAGE_KEYS.EASY_MODE)).toBeNull();
      expect(localStorage.getItem(STORAGE_KEYS.PLAN_NOTICE)).toBeNull();
    });
    it('a release of held uploads that throws resolves { ok: false } too', async () => {
      db.getMyPlan.mockResolvedValue(answer({ pro: true, source: 'manual' }));
      vi.mocked(releaseHeldSyncs).mockImplementation(() => { throw new Error('boom'); });
      await expect(refreshPlan()).resolves.toEqual({ ok: false });
      expect(releaseHeldSyncs).toHaveBeenCalledTimes(1);
    });
    it('after a failure the next call asks the server again', async () => {
      db.getMyPlan.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(answer());
      expect((await refreshPlan()).ok).toBe(false);
      expect((await refreshPlan()).ok).toBe(true);
      expect(db.getMyPlan).toHaveBeenCalledTimes(2);
    });
  });

  // The shared request is held for every caller, so one that hangs before the call is made (supabase-js
  // waits on its session lock while the auth server is unreachable) used to block every later refresh
  // for the rest of the session. The whole attempt now has a deadline.
  describe('a request that hangs', () => {
    beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }); });
    afterEach(() => { vi.useRealTimers(); });
    /** What a promise has done so far, without waiting for it. */
    const watch = (promise) => { const seen = { done: false, value: undefined }; promise.then((value) => { seen.done = true; seen.value = value; }); return seen; };

    it('is given up on after PLAN_REFRESH_TIMEOUT_MS with { ok: false }, for everyone sharing it', async () => {
      db.getMyPlan.mockReturnValueOnce(new Promise(() => {}));   // never answers
      const first = watch(refreshPlan());
      const joined = watch(refreshPlan());
      await vi.advanceTimersByTimeAsync(PLAN_REFRESH_TIMEOUT_MS - 1);
      expect(first.done).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(first).toEqual({ done: true, value: { ok: false } });
      expect(joined).toEqual({ done: true, value: { ok: false } });
      expect(db.getMyPlan).toHaveBeenCalledTimes(1);
    });

    it('...and the next refresh asks the server again instead of waiting on the dead one', async () => {
      db.getMyPlan.mockReturnValueOnce(new Promise(() => {}));
      const hung = watch(refreshPlan());
      await vi.advanceTimersByTimeAsync(PLAN_REFRESH_TIMEOUT_MS);
      expect(hung.done).toBe(true);
      db.getMyPlan.mockResolvedValue(answer());
      const next = watch(refreshPlan());
      await vi.advanceTimersByTimeAsync(0);
      expect(next.value?.ok).toBe(true);
      expect(db.getMyPlan).toHaveBeenCalledTimes(2);
    });

    it('...and the old request answering late does not disturb the new one, but its answer is kept', async () => {
      let lateAnswer;
      db.getMyPlan.mockReturnValueOnce(new Promise((resolve) => { lateAnswer = resolve; }));
      const hung = watch(refreshPlan());
      await vi.advanceTimersByTimeAsync(PLAN_REFRESH_TIMEOUT_MS);
      expect(hung.value).toEqual({ ok: false });
      db.getMyPlan.mockReturnValueOnce(new Promise(() => {}));   // the new request is still out when the old one lands
      const fresh = watch(refreshPlan());
      await vi.advanceTimersByTimeAsync(0);
      lateAnswer(answer({ used_this_month: 7 }));
      await vi.advanceTimersByTimeAsync(0);
      expect(getCachedPlan()).toMatchObject({ usedThisMonth: 7 });   // a real answer from the server is still a real answer
      const joined = refreshPlan();                                  // and asking now shares the new request, not a third one
      await vi.advanceTimersByTimeAsync(10);                         // (a third request would reach getMyPlan after its lazy import)
      expect(db.getMyPlan).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(PLAN_REFRESH_TIMEOUT_MS);
      expect(fresh.value).toEqual({ ok: false });
      await expect(joined).resolves.toEqual({ ok: false });
    });

    it('an answer in time is not cut off, and leaves no timer behind', async () => {
      db.getMyPlan.mockResolvedValue(answer());
      const done = watch(refreshPlan());
      await vi.advanceTimersByTimeAsync(0);
      expect(done.value?.ok).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('the deadline leaves the call\'s own timeout its chance first', () => {
      expect(PLAN_REFRESH_TIMEOUT_MS).toBeGreaterThan(PLAN_RPC_TIMEOUT_MS);
    });
  });
});

describe('Settings', () => {
  it('planSummary covers every state Settings → Plan shows (payments come later)', () => {
    setPlan({ pro: false, usedThisMonth: 12, month: '2026-10' });
    expect(planSummary(getCachedPlan(), NOW)).toEqual({ label: 'Free', sub: '12 of 20 invoices used this month · resets Nov 1', action: 'upgrade' });
    expect(planSummary({ pro: true, source: 'manual', proUntil: null }, NOW)).toEqual({ label: 'Pro (free)', sub: '', action: null });
    expect(planSummary({ pro: true, source: 'manual', proUntil: '2026-12-01T12:00:00Z' }, NOW)).toEqual({ label: 'Pro until Dec 1', sub: '', action: null });
    // A paid (Stripe) record can only exist once payments are built; it shows plain Pro.
    expect(planSummary({ pro: true, source: 'stripe', status: 'active', proUntil: '2026-11-16T12:00:00Z' }, NOW)).toEqual({ label: 'Pro', sub: '', action: null });
  });
  it('planSummary takes every label from PLAN_COPY (none is written inline)', () => {
    // Swap the labels for sentinels: a label typed into plan.js would not change.
    const swapped = { freeLabel: 'F!', proLabel: 'P!', proFreeLabel: 'PF!', proUntilLabel: (date) => `PU! ${date}` };
    const saved = Object.fromEntries(Object.keys(swapped).map((k) => [k, PLAN_COPY[k]]));
    Object.assign(PLAN_COPY, swapped);
    try {
      expect(planSummary(null, NOW).label).toBe('F!');
      expect(planSummary({ pro: true, source: 'manual', proUntil: null }, NOW).label).toBe('PF!');
      expect(planSummary({ pro: true, source: 'manual', proUntil: '2026-12-01T12:00:00Z' }, NOW).label).toBe('PU! Dec 1');
      expect(planSummary({ pro: true, source: 'stripe', status: 'active', proUntil: '2026-11-16T12:00:00Z' }, NOW).label).toBe('P!');
    } finally {
      Object.assign(PLAN_COPY, saved);
    }
  });
});
