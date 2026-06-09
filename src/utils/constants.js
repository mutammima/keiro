/**
 * constants.js — single source of truth for magic values used across the app.
 *
 * Anything that was previously a bare literal sprinkled through components
 * (day thresholds, the default business-name fallback, the invoice-number
 * floor, repeated hex colours, localStorage key names) lives here so there is
 * exactly one place to change it.
 */

// ── localStorage keys ───────────────────────────────────────────────────────
// Every persisted key the app uses. Always reference these instead of typing
// the raw 'inv_…' string so a rename can never drift between call sites.
export const STORAGE_KEYS = {
  // Data
  NUMBER:           'inv_number',
  LIST:             'inv_list',
  CATALOG:          'inv_catalog',
  PAYMENTS:         'inv_payments',
  LOGO_B64:         'inv_logo_b64',
  STORES:           'inv_stores',
  STORE_PHONES:     'inv_store_phones',
  STORE_ADDRS:      'inv_store_addrs',
  STORE_OVERRIDES:  'inv_store_overrides',
  PINNED_STORES:    'inv_pinned_stores',
  PRODUCT_NAMES:    'inv_product_names',
  NOTES:            'inv_notes',
  SO_ORDERS:        'inv_so_orders',
  SO_DRIVERS:       'inv_so_drivers',
  BRIDGE_REQUESTS:  'inv_bridge_requests',
  BUSINESS_NAME:    'inv_business_name',
  BUSINESS_PHONE:   'inv_business_phone',
  PREFILL:          'inv_prefill',
  // Settings / flags
  DARK_MODE:        'inv_dark_mode',
  ACCENT_COLOR:     'inv_accent_color',
  DENSITY:          'inv_density',
  EASY_MODE:        'inv_easy_mode',
  AUTO_FLAG_DAYS:   'inv_auto_flag_days',
  AUTO_MARK_DAYS:   'inv_auto_mark_days',
  USER_ROLE:        'inv_user_role',
  PIN:              'inv_pin',
  ONBOARDING_DONE:  'inv_onboarding_complete',
  TUTORIAL_SEEN:    'inv_tutorial_seen',
  MIGRATED:         'inv_migrated',
  MIGRATED_AT:      'inv_migrated_at',
};

// ── Business defaults ───────────────────────────────────────────────────────
/** Fallback business name when the user hasn't set one yet. */
export const DEFAULT_BUSINESS_NAME = 'J&Y Distributions';

// ── Invoice numbering ───────────────────────────────────────────────────────
/** Invoice numbers start counting up from here, so the first issued is 1001. */
export const INVOICE_NUMBER_START = 1000;

// ── Overdue / time ──────────────────────────────────────────────────────────
/** Milliseconds in one day — used for all "days between" math. */
export const MS_PER_DAY = 24 * 60 * 60 * 1000;
/**
 * Default number of days after the invoice date before an unpaid/partial
 * invoice is flagged overdue, when the user hasn't configured a threshold.
 */
export const DEFAULT_FLAG_DAYS = 7;
