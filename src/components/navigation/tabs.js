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

const DRIVER_TAB_IDS = DRIVER_TABS.map(t => t.id);
const OWNER_TAB_IDS  = OWNER_TABS.map(t => t.id);

/** Tab descriptors ({ id, label }) for a role. Stable reference. */
export function tabsForRole(role) {
  return role === 'store_owner' ? OWNER_TABS : DRIVER_TABS;
}

/** Just the page ids for a role, in tab order. Stable reference — see above. */
export function tabIdsForRole(role) {
  return role === 'store_owner' ? OWNER_TAB_IDS : DRIVER_TAB_IDS;
}
