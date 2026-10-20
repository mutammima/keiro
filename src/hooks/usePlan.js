/**
 * usePlan — re-renders when the cached plan or this month's invoice count
 * changes (plan.js announces EVENTS.PLAN_CHANGE) and returns the cached plan.
 *
 * The plan is the SAME object until the cached answer itself changes (a count
 * moving re-renders the screen but is not a new plan), so it is safe as an
 * effect or memo dependency.
 */
import { useMemo, useSyncExternalStore } from 'react';
import { STORAGE_KEYS, EVENTS } from '../utils/constants';
import { parseCachedPlan } from '../utils/plan';

function subscribe(onChange) {
  window.addEventListener(EVENTS.PLAN_CHANGE, onChange);
  return () => window.removeEventListener(EVENTS.PLAN_CHANGE, onChange);
}

function planText() {
  try { return localStorage.getItem(STORAGE_KEYS.PLAN_CACHE); } catch { return null; }
}

// A string: identical between changes, so React only re-renders on news.
function snapshot() {
  try { return `${localStorage.getItem(STORAGE_KEYS.PLAN_CACHE)}|${localStorage.getItem(STORAGE_KEYS.USAGE)}`; } catch { return ''; }
}

export function usePlan() {
  useSyncExternalStore(subscribe, snapshot, snapshot);
  const text = planText();
  return useMemo(() => parseCachedPlan(text), [text]);
}
