/**
 * usePlan.test.jsx
 *
 * usePlan returns the cached plan and re-renders when plan.js announces
 * EVENTS.PLAN_CHANGE with news (the cached answer or this month's count
 * changed). No module is mocked here: plan.js and the hook must load without
 * the Supabase client (CI has no .env).
 */

import { useEffect } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePlan } from '../hooks/usePlan';
import { recordNewInvoice } from '../utils/plan';
import { STORAGE_KEYS, EVENTS } from '../utils/constants';

const NOW = new Date(2026, 9, 16, 12, 0, 0);
const announce = () => window.dispatchEvent(new CustomEvent(EVENTS.PLAN_CHANGE));

beforeEach(() => localStorage.clear());

describe('usePlan', () => {
  it('is null while the server has not answered on this phone', () => {
    const { result } = renderHook(() => usePlan());
    expect(result.current).toBeNull();
  });

  it('returns the cached plan, and the new one when PLAN_CHANGE announces a changed answer', () => {
    const { result } = renderHook(() => usePlan());
    expect(result.current).toBeNull();

    act(() => {
      localStorage.setItem(STORAGE_KEYS.PLAN_CACHE, JSON.stringify({ pro: true, source: 'manual', proUntil: null }));
      announce();
    });
    expect(result.current).toEqual({ pro: true, source: 'manual', proUntil: null });

    act(() => {
      localStorage.setItem(STORAGE_KEYS.PLAN_CACHE, JSON.stringify({ pro: false, usedThisMonth: 7, month: '2026-10' }));
      announce();
    });
    expect(result.current).toEqual({ pro: false, usedThisMonth: 7, month: '2026-10' });
  });

  it('re-renders when a new invoice is counted', () => {
    let renders = 0;
    renderHook(() => { renders += 1; return usePlan(); });
    const before = renders;
    act(() => recordNewInvoice(NOW));
    expect(renders).toBeGreaterThan(before);
  });

  it('does not re-render on an announcement that changed nothing', () => {
    localStorage.setItem(STORAGE_KEYS.PLAN_CACHE, JSON.stringify({ pro: false, usedThisMonth: 1, month: '2026-10' }));
    let renders = 0;
    renderHook(() => { renders += 1; return usePlan(); });
    const before = renders;
    act(() => announce());
    expect(renders).toBe(before);
  });

  // The hook is meant to be usable as an effect dependency: a new object on every render would re-run
  // (and, with a state update inside, loop) such an effect.
  describe('the same plan is the same object', () => {
    const cached = { pro: false, usedThisMonth: 1, month: '2026-10' };
    beforeEach(() => localStorage.setItem(STORAGE_KEYS.PLAN_CACHE, JSON.stringify(cached)));

    it('across renders, and across announcements that changed nothing', () => {
      const { result, rerender } = renderHook(() => usePlan());
      const first = result.current;
      expect(first).toEqual(cached);
      rerender();
      expect(result.current).toBe(first);
      act(() => announce());
      expect(result.current).toBe(first);
    });

    it('when only this month\'s count moved (the screen re-renders, the plan did not change)', () => {
      let renders = 0;
      const { result } = renderHook(() => { renders += 1; return usePlan(); });
      const first = result.current;
      const before = renders;
      act(() => recordNewInvoice(NOW));
      expect(renders).toBeGreaterThan(before);
      expect(result.current).toBe(first);
    });

    it('until the cached answer changes, and then the new answer is the new object', () => {
      const { result } = renderHook(() => usePlan());
      const first = result.current;
      act(() => {
        localStorage.setItem(STORAGE_KEYS.PLAN_CACHE, JSON.stringify({ ...cached, usedThisMonth: 9 }));
        announce();
      });
      expect(result.current).not.toBe(first);
      expect(result.current).toEqual({ ...cached, usedThisMonth: 9 });
      const second = result.current;
      act(() => announce());
      expect(result.current).toBe(second);
    });

    it('so it is safe as an effect dependency: the effect runs once per plan, not once per render', () => {
      let runs = 0;
      const { rerender } = renderHook(() => {
        const plan = usePlan();
        useEffect(() => { runs += 1; }, [plan]);
      });
      rerender();
      rerender();
      act(() => announce());
      expect(runs).toBe(1);
      act(() => {
        localStorage.setItem(STORAGE_KEYS.PLAN_CACHE, JSON.stringify({ pro: true, source: 'manual', proUntil: null }));
        announce();
      });
      expect(runs).toBe(2);
    });
  });

  it('stops listening when the screen goes away', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => usePlan());
    const added = add.mock.calls.filter(([name]) => name === EVENTS.PLAN_CHANGE).length;
    unmount();
    const removed = remove.mock.calls.filter(([name]) => name === EVENTS.PLAN_CHANGE).length;
    add.mockRestore();
    remove.mockRestore();
    expect(added).toBeGreaterThan(0);
    expect(removed).toBe(added);
  });
});
