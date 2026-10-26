/**
 * Signing out of a free account undoes the Easy Mode the PLAN gave it.
 *
 * inv_easy_mode is a device preference, so it survives sign-out: a test account
 * on someone else's phone would leave the next account in Easy Mode. plan.js
 * therefore marks a move it made (EASY_BY_PLAN, account data), and sign-out
 * clears the flag along with the marker. A driver who chose Easy Mode keeps it.
 *
 * Only the Supabase client is mocked; the sign-out is the real one in
 * services/auth.js and the move is the real one in utils/plan.js.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/supabase', () => ({
  supabase: { auth: { signOut: vi.fn(async () => ({ error: null })), storageKey: 'sb-test-auth-token' } },
}));
vi.mock('../services/db', () => ({ getMyPlan: vi.fn() }));
vi.mock('../utils/syncQueue', () => ({ releaseHeldSyncs: vi.fn() }));

import * as db from '../services/db';
import { supabase } from '../services/supabase';
import { signOut } from '../services/auth';
import { refreshPlan } from '../utils/plan';
import { easyModeFor, isEasyMode } from '../utils/easyMode';
import { STORAGE_KEYS } from '../utils/constants';

const freeAnswer = () => ({
  data: { pro: false, source: null, status: null, pro_until: null, interval: null, cancels: false, used_this_month: 3, month: '2026-10' },
  error: null,
});
const proAnswer = () => ({ data: { ...freeAnswer().data, pro: true, source: 'manual' }, error: null });

beforeEach(() => {
  localStorage.clear();
  vi.mocked(db.getMyPlan).mockReset();
  vi.mocked(supabase.auth.signOut).mockReset().mockResolvedValue({ error: null });
});

describe('sign-out and the Easy Mode a free plan gave', () => {
  it('a Free answer moves the driver into Easy Mode; signing out clears the flag and the marker', async () => {
    db.getMyPlan.mockResolvedValue(freeAnswer());
    await refreshPlan();
    expect(isEasyMode()).toBe(true);
    expect(localStorage.getItem(STORAGE_KEYS.EASY_BY_PLAN)).not.toBeNull();

    await signOut();

    expect(localStorage.getItem(STORAGE_KEYS.EASY_MODE)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.EASY_BY_PLAN)).toBeNull();
  });

  it('the next account is then a normal-mode driver (Pro, with no flag) rather than an Easy Mode one', async () => {
    db.getMyPlan.mockResolvedValue(freeAnswer());
    await refreshPlan();
    await signOut();
    db.getMyPlan.mockResolvedValue(proAnswer());
    await refreshPlan();
    expect(easyModeFor('driver')).toBe(false);
  });

  it('a driver already in Easy Mode by choice is not moved, gets no marker, and keeps Easy Mode after sign-out', async () => {
    localStorage.setItem(STORAGE_KEYS.EASY_MODE, 'true');
    db.getMyPlan.mockResolvedValue(freeAnswer());
    await refreshPlan();
    expect(localStorage.getItem(STORAGE_KEYS.EASY_BY_PLAN)).toBeNull();

    await signOut();

    expect(isEasyMode()).toBe(true);
  });

  it('signing out clears the flag even when the server could not be reached (the same wipe runs)', async () => {
    db.getMyPlan.mockResolvedValue(freeAnswer());
    await refreshPlan();
    vi.mocked(supabase.auth.signOut).mockRejectedValue(new Error('offline'));

    await signOut();

    expect(localStorage.getItem(STORAGE_KEYS.EASY_MODE)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.EASY_BY_PLAN)).toBeNull();
  });

  it('the other device preferences still survive a sign-out', async () => {
    localStorage.setItem(STORAGE_KEYS.DARK_MODE, 'true');
    localStorage.setItem(STORAGE_KEYS.DENSITY, '"compact"');
    db.getMyPlan.mockResolvedValue(freeAnswer());
    await refreshPlan();

    await signOut();

    expect(localStorage.getItem(STORAGE_KEYS.DARK_MODE)).toBe('true');
    expect(localStorage.getItem(STORAGE_KEYS.DENSITY)).toBe('"compact"');
  });
});
