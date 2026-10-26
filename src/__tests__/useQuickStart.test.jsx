/**
 * useQuickStart.test.jsx
 *
 * When the driver tour shows and what finishing or replaying it does — the
 * logic App.jsx used to hold inline (docs/specs/2026-10-14-easy-mode-design.md §4):
 * first run plays the current mode's tour; switching modes (a reload) plays
 * that mode's tour once; How it Works replays it any time, from Route for the
 * Easy tour; store owners have no modes.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useQuickStart } from '../hooks/useQuickStart';
import { isTourSeen } from '../utils/tutorialProgress';
import { STORAGE_KEYS } from '../utils/constants';

function setup({ role = 'driver', mode = 'full', firstRun = false } = {}) {
  const navigate = vi.fn();
  const onPulseHome = vi.fn();
  const onboarding = { shouldShow: firstRun, markComplete: vi.fn(), skipOnboarding: vi.fn() };
  const hook = renderHook(() => useQuickStart({ role, mode, navigate, onboarding, onPulseHome }));
  return { ...hook, navigate, onPulseHome, onboarding };
}

beforeEach(() => localStorage.clear());

describe('useQuickStart', () => {
  it('an existing driver in full mode sees no tour', () => {
    localStorage.setItem(STORAGE_KEYS.ONBOARDING_DONE, 'true');
    const { result } = setup();
    expect(result.current.visible).toBe(false);
  });

  it('switching to Easy Mode plays the Easy tour once, then never again', () => {
    localStorage.setItem(STORAGE_KEYS.ONBOARDING_DONE, 'true');
    localStorage.setItem(STORAGE_KEYS.EASY_MODE, 'true');   // the switch turned it on
    const first = setup({ mode: 'easy' });
    expect(first.result.current.visible).toBe(true);

    act(() => { first.result.current.finish(false); });
    expect(first.result.current.visible).toBe(false);
    expect(isTourSeen('easy')).toBe(true);
    expect(first.navigate).toHaveBeenCalledWith('route');
    expect(first.onPulseHome).not.toHaveBeenCalled();

    const afterReload = setup({ mode: 'easy' });
    expect(afterReload.result.current.visible).toBe(false);
  });

  // The dad's first launch after the update: onboarding is done, no plan answer is cached yet and the
  // flag is off, so the shell is in Easy Mode only as a stopgap. The Pro answer reloads it into normal
  // mode a moment later, so the Easy tour must not start over that.
  describe('a returning driver in Easy Mode only because no plan answer is cached yet', () => {
    beforeEach(() => localStorage.setItem(STORAGE_KEYS.ONBOARDING_DONE, 'true'));

    it('is not shown the Easy tour (it plays on a later launch, once he is in Easy Mode)', () => {
      const { result } = setup({ mode: 'easy' });
      expect(result.current.visible).toBe(false);
    });
    it('...but How it Works still plays it', () => {
      const { result, navigate } = setup({ mode: 'easy' });
      act(() => { result.current.start(); });
      expect(navigate).toHaveBeenCalledWith('route');
      expect(result.current.visible).toBe(true);
    });
    it('a cached Free answer makes the Easy shell real: the tour plays', () => {
      localStorage.setItem(STORAGE_KEYS.PLAN_CACHE, JSON.stringify({ pro: false, usedThisMonth: 2, month: '2026-10' }));
      expect(setup({ mode: 'easy' }).result.current.visible).toBe(true);
    });
    it('the Easy flag makes it real too (the Easy Mode switch, or an earlier Free answer)', () => {
      localStorage.setItem(STORAGE_KEYS.EASY_MODE, 'true');
      expect(setup({ mode: 'easy' }).result.current.visible).toBe(true);
    });
    it('a new driver\'s first-run tour is unchanged', () => {
      localStorage.removeItem(STORAGE_KEYS.ONBOARDING_DONE);
      const { result, onboarding, navigate } = setup({ firstRun: true, mode: 'easy' });
      expect(result.current.visible).toBe(true);
      act(() => { result.current.finish(false); });
      expect(onboarding.markComplete).toHaveBeenCalled();
      expect(navigate).toHaveBeenCalledWith('route');
      expect(isTourSeen('easy')).toBe(true);
    });
    it('and in normal mode nothing changes', () => {
      expect(setup({ mode: 'full' }).result.current.visible).toBe(false);
    });
  });

  it('first run in full mode: completes onboarding, pulses Home, lands on Route', () => {
    const { result, onboarding, onPulseHome, navigate } = setup({ firstRun: true });
    expect(result.current.visible).toBe(true);
    act(() => { result.current.finish(false); });
    expect(onboarding.markComplete).toHaveBeenCalled();
    expect(onPulseHome).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('route');
    expect(isTourSeen('full')).toBe(true);
  });

  it('first run in Easy Mode has no Home tab to pulse', () => {
    const { result, onPulseHome } = setup({ firstRun: true, mode: 'easy' });
    act(() => { result.current.finish(false); });
    expect(onPulseHome).not.toHaveBeenCalled();
    expect(isTourSeen('easy')).toBe(true);
  });

  it('skipping the first run records it without the pulse', () => {
    const { result, onboarding, onPulseHome } = setup({ firstRun: true });
    act(() => { result.current.finish(true); });
    expect(onboarding.skipOnboarding).toHaveBeenCalled();
    expect(onPulseHome).not.toHaveBeenCalled();
  });

  it('How it Works in Easy Mode goes to Route first; finishing a replay stays put', () => {
    localStorage.setItem(STORAGE_KEYS.ONBOARDING_DONE, 'true');
    localStorage.setItem(STORAGE_KEYS.TOUR_SEEN_EASY, '1');
    const { result, navigate } = setup({ mode: 'easy' });
    expect(result.current.visible).toBe(false);

    act(() => { result.current.start(); });
    expect(navigate).toHaveBeenCalledWith('route');
    expect(result.current.visible).toBe(true);

    navigate.mockClear();
    act(() => { result.current.finish(false); });
    expect(result.current.visible).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('How it Works in full mode starts wherever the driver is', () => {
    localStorage.setItem(STORAGE_KEYS.ONBOARDING_DONE, 'true');
    const { result, navigate } = setup();
    act(() => { result.current.start(); });
    expect(navigate).not.toHaveBeenCalled();
    expect(result.current.visible).toBe(true);
  });

  it('a store owner has no mode tour, and first run lands on Orders', () => {
    localStorage.setItem(STORAGE_KEYS.EASY_MODE, 'true');
    const existing = setup({ role: 'store_owner', mode: 'full' });
    expect(existing.result.current.visible).toBe(false);

    const firstRun = setup({ role: 'store_owner', firstRun: true });
    act(() => { firstRun.result.current.finish(false); });
    expect(firstRun.navigate).toHaveBeenCalledWith('so-orders');
    expect(firstRun.onPulseHome).not.toHaveBeenCalled();
  });
});
