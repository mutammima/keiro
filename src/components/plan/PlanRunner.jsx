/**
 * PlanRunner — keeps the cached plan fresh (plan.js). Renders nothing.
 * Asks at launch and whenever the app comes back to the foreground; if the
 * answer changes which mode the app should be in (Pro started or ended), the
 * app reloads, exactly as the Easy Mode switch does. Guests and store owners
 * have no plan to ask about.
 *
 * `easyMode` is the mode the shell was BUILT for: only its value at mount
 * counts. The shell recomputes the prop on every render, but its tabs and page
 * state only follow a reload, so a later value must never stand in for "the
 * mode did not change". `onModeChange` is how a reload is asked for; the shell
 * passes one that waits while an invoice is being made (useSafeReload).
 */
import { useEffect, useState } from 'react';
import { refreshPlan } from '../../utils/plan';
import { easyModeFor } from '../../utils/easyMode';
import { STORAGE_KEYS } from '../../utils/constants';

function isGuestNow() {
  try { return localStorage.getItem(STORAGE_KEYS.GUEST_MODE) === 'true'; } catch { return false; }
}

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
    document.addEventListener('visibilitychange', onVisible);
    return () => { cancelled = true; document.removeEventListener('visibilitychange', onVisible); };
  }, [role, builtEasy, onModeChange]);
  return null;
}
