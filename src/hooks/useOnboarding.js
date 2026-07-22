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
    try { localStorage.setItem(LS_KEY, 'true'); } catch { /* storage blocked (private mode): the tour still closes below, it just replays on the next launch */ }
    setShouldShow(false);
  }

  function skipOnboarding() {
    try { localStorage.setItem(LS_KEY, 'true'); } catch { /* storage blocked (private mode): the skip still hides the tour below, it just reappears on the next launch */ }
    setShouldShow(false);
  }

  return { shouldShow, markComplete, skipOnboarding };
}
