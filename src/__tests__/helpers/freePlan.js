import { STORAGE_KEYS } from '../../utils/constants';

/** This local month as plan.js keys it: 'YYYY-MM'. */
export function monthNow() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** The server's cached answer: a free account with `used` new invoices this month. */
export function seedFreePlan(used) {
  localStorage.setItem(STORAGE_KEYS.PLAN_CACHE, JSON.stringify({ pro: false, usedThisMonth: used, month: monthNow() }));
}
