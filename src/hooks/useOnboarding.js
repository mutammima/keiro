/**
 * useOnboarding — tracks whether the user has completed the onboarding tutorial.
 * localStorage key: STORAGE_KEYS.ONBOARDING_DONE
 */

import { useState } from 'react';
import { STORAGE_KEYS } from '../utils/constants';

const LS_KEY = STORAGE_KEYS.ONBOARDING_DONE;

function hasCompleted() {
  try { return localStorage.getItem(LS_KEY) === 'true'; } catch { return false; }
}

export default function useOnboarding() {
  const [shouldShow, setShouldShow] = useState(() => !hasCompleted());

  function markComplete() {
    try { localStorage.setItem(LS_KEY, 'true'); } catch {}
    setShouldShow(false);
  }

  function skipOnboarding() {
    try { localStorage.setItem(LS_KEY, 'true'); } catch {}
    setShouldShow(false);
  }

  return { shouldShow, markComplete, skipOnboarding };
}
