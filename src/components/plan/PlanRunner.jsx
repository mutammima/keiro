/**
 * PlanRunner — keeps the cached plan fresh (plan.js). Renders nothing.
 * Asks at launch and whenever the app comes back to the foreground; if the
 * answer changes which mode the app should be in (Pro started or ended), the
 * app reloads, exactly as the Easy Mode switch does. Guests and store owners
 * have no plan to ask about.
 */
import { useEffect } from 'react';
import { refreshPlan } from '../../utils/plan';
import { easyModeFor } from '../../utils/easyMode';
import { STORAGE_KEYS } from '../../utils/constants';

function isGuestNow() {
  try { return localStorage.getItem(STORAGE_KEYS.GUEST_MODE) === 'true'; } catch { return false; }
}

// Module-level so the default is the same function every render (it is an effect dependency).
const reload = () => window.location.reload();

export default function PlanRunner({ role, easyMode, onModeChange = reload }) {
  useEffect(() => {
    if (role === 'store_owner' || isGuestNow()) return undefined;
    let cancelled = false;
    const run = async () => {
      const r = await refreshPlan();
      if (!cancelled && r.ok && easyModeFor(role) !== easyMode) onModeChange();
    };
    run();
    const onVisible = () => { if (document.visibilityState === 'visible') run(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { cancelled = true; document.removeEventListener('visibilitychange', onVisible); };
  }, [role, easyMode, onModeChange]);
  return null;
}
