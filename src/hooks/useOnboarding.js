/**
 * useOnboarding — tracks whether the user has completed the onboarding tutorial.
 * localStorage key: 'inv_onboarding_complete'
 */

import { useState } from 'react';

const LS_KEY = 'inv_onboarding_complete';

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
