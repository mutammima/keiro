/**
 * usePlan — re-renders when the cached plan or this month's invoice count
 * changes (plan.js announces EVENTS.PLAN_CHANGE) and returns the cached plan.
 */
import { useSyncExternalStore } from 'react';
import { STORAGE_KEYS, EVENTS } from '../utils/constants';
import { getCachedPlan } from '../utils/plan';

function subscribe(onChange) {
  window.addEventListener(EVENTS.PLAN_CHANGE, onChange);
  return () => window.removeEventListener(EVENTS.PLAN_CHANGE, onChange);
}

// A string: identical between changes, so React only re-renders on news.
function snapshot() {
  try { return `${localStorage.getItem(STORAGE_KEYS.PLAN_CACHE)}|${localStorage.getItem(STORAGE_KEYS.USAGE)}`; } catch { return ''; }
}

export function usePlan() {
  useSyncExternalStore(subscribe, snapshot, snapshot);
  return getCachedPlan();
}
