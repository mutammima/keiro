/**
 * useQuickStart — when the tour shows, and what finishing or replaying it does
 * (docs/specs/2026-10-14-easy-mode-design.md §4).
 *
 * - First run: the current mode's tour (full or Easy) for drivers, the owner
 *   tour for store owners.
 * - Switching Easy Mode (which reloads the app) plays that mode's tour once.
 *   Not while the Easy shell is only a stopgap: a returning driver with no plan
 *   answer cached yet and the Easy flag off is in Easy Mode because an account
 *   with no answer counts as Free, and a Pro answer reloads him into normal mode
 *   a moment later. The tour plays on a later launch if he is in Easy Mode then.
 * - How it Works / Replay tutorial: any time — the Easy tour from Route,
 *   where its first step (+ New) is.
 *
 * `onboarding` is useOnboarding()'s { shouldShow, markComplete, skipOnboarding }
 * (App reads shouldShow too, for What's New).
 */
import { useState } from 'react';
import { markTourSeen, pendingModeTour, tourStartPage } from '../utils/tutorialProgress';
import { isEasyMode } from '../utils/easyMode';
import { getCachedPlan } from '../utils/plan';

/** The Easy shell comes only from "no plan answer yet counts as Free": nothing says he is in Easy Mode for good. */
function easyOnlyForNow(mode) {
  return mode === 'easy' && !isEasyMode() && !getCachedPlan();
}

export function useQuickStart({ role, mode, navigate, onboarding, onPulseHome }) {
  const [replaying, setReplaying] = useState(false);
  const [modeTourPending, setModeTourPending] = useState(() => pendingModeTour(role, mode) && !easyOnlyForNow(mode));
  const isFirstRun = onboarding.shouldShow;

  /** Done or Skip on the tour. */
  function finish(skipped) {
    if (role !== 'store_owner') markTourSeen(mode);
    if (isFirstRun) {
      skipped ? onboarding.skipOnboarding() : onboarding.markComplete();
      // Point the driver at the dashboard afterward (Easy Mode has no Home tab).
      if (!skipped && role !== 'store_owner' && mode === 'full') onPulseHome();
      navigate(role === 'store_owner' ? 'so-orders' : 'route');
    } else if (modeTourPending) {
      navigate('route');
    }
    setModeTourPending(false);
    setReplaying(false);
  }

  /** How it Works / Replay tutorial: go where the first step is, then play. */
  function start() {
    const startPage = tourStartPage(role, mode);
    if (startPage) navigate(startPage);
    setReplaying(true);
  }

  return { visible: isFirstRun || replaying || modeTourPending, finish, start };
}
