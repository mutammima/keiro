/**
 * PlanRunner — keeps the cached plan fresh (plan.js). Renders nothing.
 * Asks at launch and whenever the app comes back to the foreground; with no
 * answer cached yet (a launch on a weak signal) it also asks each time the
 * signal returns, so a Pro driver gets Pro without restarting the app. If the
 * answer changes which mode the app should be in (Pro started or ended), the
 * app reloads, exactly as the Easy Mode switch does. Guests and store owners
 * have no plan to ask about.
 *
 * `easyMode` is the mode the shell was BUILT for: only its value at mount
 * counts. The shell decides its mode once per mount (App.jsx, AppInner) and its
 * tabs and page state only follow a reload, so this is that mode, never a later
 * reading of the plan cache, which can already say otherwise. It is captured
 * once here too, so even a changed prop can't stand in for "the mode did not
 * change". `onModeChange` is how a reload is asked for; the shell passes one
 * that waits while an invoice is being made or shared (useSafeReload).
 */
import { useEffect, useState } from 'react';
import { refreshPlan, getCachedPlan, isGuestNow } from '../../utils/plan';
import { easyModeFor } from '../../utils/easyMode';

// Module-level so the default is the same function every render (it is an effect dependency).
const reload = () => window.location.reload();

export default function PlanRunner({ role, easyMode, onModeChange = reload }) {
  // Captured once, like AppInner's own mode: both rely on the shell being remounted per role (RoleGate's key={role}).
  const [builtEasy] = useState(easyMode);
  useEffect(() => {
    if (role === 'store_owner' || isGuestNow()) return undefined;
    let cancelled = false;
    const run = async () => {
      const r = await refreshPlan();
      if (!cancelled && r.ok && easyModeFor(role) !== builtEasy) onModeChange();
    };
    run();
    const onVisible = () => { if (document.visibilityState === 'visible') run(); };
    // No answer on this phone yet (the launch read timed out): ask again as soon as the signal is back.
    const onOnline = () => { if (!getCachedPlan()) run(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [role, builtEasy, onModeChange]);
  return null;
}
