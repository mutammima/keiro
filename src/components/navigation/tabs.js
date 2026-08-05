/**
 * tabs.js — the per-role primary tab set, defined once.
 *
 * Three places need this list and each used to keep its own copy: App.jsx (ids,
 * for the swipe strip and its index math), TopNav (id + label, for the phone /
 * tablet tab strip), and NavDrawer's docked desktop mode (id + label, for the
 * side nav). Two copies were already drifting apart by hand; a third would have
 * made it worse.
 *
 * The `*_TAB_IDS` arrays are built once at module load, NOT per call. App.jsx
 * keeps the id array in a ref and compares it across renders, so handing back a
 * freshly-mapped array each call would quietly break that identity check.
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
