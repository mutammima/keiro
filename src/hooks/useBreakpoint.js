/**
 * useBreakpoint — the app's single source of truth for "how wide is the screen".
 *
 * WHY A HOOK AND NOT CSS: inline styles are the house rule (no Tailwind, no CSS
 * modules), and a `style` prop cannot hold a media query. Any layout that has to
 * change with screen size therefore has to branch in JS, which means components
 * need the current size class as an ordinary value they can read at render time.
 *
 * WHY useSyncExternalStore AND NOT useState + useEffect: the effect version
 * writes state from inside an effect, which `react-hooks/set-state-in-effect`
 * rejects outright (the repo runs at zero lint problems). It is also wrong on
 * the first paint — it renders one frame at the default breakpoint and then
 * corrects, which on desktop means a visible flash of the phone layout.
 * useSyncExternalStore reads the real value during the initial render instead.
 *
 * The snapshot is a plain string, so React's referential equality check is a
 * value comparison and this can never loop.
 */

import { useSyncExternalStore } from 'react';
import { BREAKPOINTS } from '../utils/constants';

/** The three layout tiers. Compare against these, never against raw pixels. */
export const BP = {
  PHONE:   'phone',
  TABLET:  'tablet',
  DESKTOP: 'desktop',
};

const DESKTOP_QUERY = `(min-width: ${BREAKPOINTS.DESKTOP}px)`;
const TABLET_QUERY  = `(min-width: ${BREAKPOINTS.TABLET}px)`;

function subscribe(onChange) {
  // Two listeners, because a single query can't distinguish three tiers. Both
  // fire on any crossing; React coalesces the resulting re-renders.
  const queries = [
    window.matchMedia(DESKTOP_QUERY),
    window.matchMedia(TABLET_QUERY),
  ];
  queries.forEach(q => q.addEventListener('change', onChange));
  return () => queries.forEach(q => q.removeEventListener('change', onChange));
}

function getSnapshot() {
  if (window.matchMedia(DESKTOP_QUERY).matches) return BP.DESKTOP;
  if (window.matchMedia(TABLET_QUERY).matches)  return BP.TABLET;
  return BP.PHONE;
}

// No window (SSR / prerender / a test environment without matchMedia): assume
// phone, matching the mobile-first CSS default so the two agree.
function getServerSnapshot() {
  return BP.PHONE;
}

/**
 * Current layout tier: BP.PHONE | BP.TABLET | BP.DESKTOP.
 * Re-renders the calling component when the window crosses a breakpoint.
 * @returns {string}
 */
export function useBreakpoint() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
