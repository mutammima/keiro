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
  // Connections / cross-account
  CONNECTIONS:        'inv_connections',
  PENDING_INVITE:     'inv_pending_invite',
  CONN_ORDERS:        'inv_conn_orders',
  CONN_ORDER_ACTIVE:  'inv_conn_order_active',
  SHARED_INVOICES:    'inv_shared_invoices',
  // Marketplace (excluded from backup — see useBackup)
  MKT_LISTINGS:       'inv_mkt_listings',
  MKT_MY_LISTINGS:    'inv_mkt_my_listings',
  MKT_DEMAND:         'inv_mkt_demand',
  // Infra / misc
  SYNC_QUEUE:         'inv_sync_queue',
  GUEST_MODE:         'inv_guest_mode',
  AUTH_UID:           'inv_auth_uid',
  PLAN:               'inv_plan',
  PULSE_HOME:         'inv_pulse_home',
  // Dynamic-key PREFIXES — always suffixed with an id, e.g. `${SIG_PREFIX}${id}`.
  SIG_PREFIX:            'inv_sig_',
  TIP_PREFIX:            'inv_tip_',
  ACT_PREFIX:            'inv_act_',
  SEEN_PREFIX:           'inv_seen_',
  WT_STEP_PREFIX:        'inv_wt_step_',
  WT_DONE_PREFIX:        'inv_wt_done_',
  WHATS_NEW_SEEN_PREFIX: 'inv_whats_new_seen_',
  // NOTE: the auth onboarding flow (AuthGate/OnboardingFlow) uses a separate
  // 'inv_onboarding_done' flag, distinct from ONBOARDING_DONE above. It is left
  // inline in those files (auth carve-out) and intentionally not referenced here.
};

// ── Business defaults ───────────────────────────────────────────────────────
/** Fallback business name when the user hasn't set one yet. */
export const DEFAULT_BUSINESS_NAME = 'J&Y Distributions';

// ── Invoice numbering ───────────────────────────────────────────────────────
/** Invoice numbers start counting up from here, so the first issued is 1001. */
export const INVOICE_NUMBER_START = 1000;

// ── Custom DOM events ───────────────────────────────────────────────────────
// window CustomEvent names shared between a dispatcher and its listeners in
// different modules. Centralised so a rename can't drift between the two sides.
// (Single-file events — and the onboarding/tutorial milestone bridge — keep
// their inline names.) Sync toasts use SYNC_OK_EVENT/SYNC_ERROR_EVENT in
// syncNotify.js, which are already centralised there.
export const EVENTS = {
  DATA_REFRESH:   'inv-data-refresh',    // foreground poll refreshed the caches
  VERSION_UPDATE: 'inv-version-update',  // a newer build is available
  DENSITY_CHANGE: 'inv-density-change',  // display density setting changed
  // Onboarding/tutorial milestones — dispatched by feature sites, consumed by the
  // milestone bridge (tutorialProgress) and walkthrough settle steps.
  ONBOARDING_INVOICE_CREATED: 'inv-onboarding-invoice-created',
  ONBOARDING_INVOICE_PAID:    'inv-onboarding-invoice-paid',
  ONBOARDING_SETTINGS_SAVED:  'inv-onboarding-settings-saved',
  ONBOARDING_STORE_VIEWED:    'inv-onboarding-store-viewed',
};

// ── Overdue / time ──────────────────────────────────────────────────────────
/** Milliseconds in one day — used for all "days between" math. */
export const MS_PER_DAY = 24 * 60 * 60 * 1000;
/**
 * Default number of days after the invoice date before an unpaid/partial
 * invoice is flagged overdue, when the user hasn't configured a threshold.
 */
export const DEFAULT_FLAG_DAYS = 7;

// ── Interaction timing ───────────────────────────────────────────────────────
/**
 * Debounce (ms) for the product/store-name autofill lookups in useInvoiceForm.
 * Each lookup is a cloud query, so we wait for a typing pause instead of firing
 * one per keystroke. The input setState stays immediate (no input lag).
 */
export const AUTOFILL_DEBOUNCE_MS = 250;
