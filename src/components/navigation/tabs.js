/**
 * tabs.js — the per-role primary tab set, defined once.
 *
 * Three places need this list and each used to keep its own copy: App.jsx (ids,
 * for the swipe strip and its index math), TopNav (id + label, for the phone /
 * tablet tab strip), and NavDrawer's docked desktop mode (id + label, for the
 * side nav). Two copies were already drifting apart by hand; a third would have
 * made it worse.
 *
 * The `*_TAB_IDS` arrays are built once at module load, NOT per call, so
 * `tabIdsForRole` hands back a stable reference. App.jsx mirrors the array into
 * a ref keyed on `role` (`useEffect(..., [role])`) and its swipe handlers read
 * `tabsRef.current` — that works because `AppInner` is remounted via
 * `key={role}`, not because anything compares the array's identity. Returning a
 * fresh array per call wouldn't break correctness today; it would just churn
 * allocations on a hot path for no reason.
 */

import { easyModeFor } from '../../utils/easyMode';

export const DRIVER_TABS = [
  { id: 'home',    label: 'Home'    },
  { id: 'route',   label: 'Route'   },
  { id: 'stores',  label: 'Stores'  },
  { id: 'reports', label: 'Reports' },
];

export const OWNER_TABS = [
  { id: 'so-home',     label: 'Home'     },
  { id: 'so-orders',   label: 'Orders'   },
  { id: 'so-drivers',  label: 'Drivers'  },
  { id: 'so-invoices', label: 'Invoices' },
];

// Easy Mode (drivers): scan-first invoicing. Home is hidden, and Route comes
// first so the app opens on it.
export const EASY_DRIVER_TABS = [
  { id: 'route',   label: 'Route'   },
  { id: 'stores',  label: 'Stores'  },
  { id: 'reports', label: 'Reports' },
];

const DRIVER_TAB_IDS      = DRIVER_TABS.map(t => t.id);
const OWNER_TAB_IDS       = OWNER_TABS.map(t => t.id);
const EASY_DRIVER_TAB_IDS = EASY_DRIVER_TABS.map(t => t.id);
const ALL_TAB_IDS = new Set([...DRIVER_TAB_IDS, ...OWNER_TAB_IDS]);

/** Tab descriptors ({ id, label }) for a role. Stable reference. */
export function tabsForRole(role, easy = easyModeFor(role)) {
  if (role === 'store_owner') return OWNER_TABS;
  return easy ? EASY_DRIVER_TABS : DRIVER_TABS;
}

/** Just the page ids for a role, in tab order. Stable reference — see above. */
export function tabIdsForRole(role, easy = easyModeFor(role)) {
  if (role === 'store_owner') return OWNER_TAB_IDS;
  return easy ? EASY_DRIVER_TAB_IDS : DRIVER_TAB_IDS;
}

/**
 * Where navigating to `page` should land. A tab this set hides (Home in Easy
 * Mode) lands on the set's first tab — otherwise App.jsx would treat it as an
 * overlay that doesn't exist and show a blank screen. Anything else is unchanged.
 */
export function tabTargetFor(tabIds, page) {
  return ALL_TAB_IDS.has(page) && !tabIds.includes(page) ? tabIds[0] : page;
}
