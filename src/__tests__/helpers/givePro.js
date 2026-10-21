import { STORAGE_KEYS } from '../../utils/constants';

/** This test's account is Pro (free forever): normal mode and phone signing stay available. */
export function givePro() {
  localStorage.setItem(STORAGE_KEYS.PLAN_CACHE, JSON.stringify({
    pro: true, source: 'manual', status: 'active', proUntil: null, interval: null,
    cancels: false, usedThisMonth: 0, month: null, fetchedAt: '2026-10-16T12:00:00.000Z',
  }));
}
