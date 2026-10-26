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
  // Set when a fresh Free answer (plan.js) moved the driver into Easy Mode, not the driver. It is account
  // data, unlike the flag: sign-out wipes it and, seeing it, takes the flag with it. The Easy Mode switch clears it.
  EASY_BY_PLAN:     'inv_easy_by_plan',
  CRASH_REPORTS:    'inv_crash_reports',   // device pref: send crash reports (default on); kept across sign-out
  AUTO_FLAG_DAYS:   'inv_auto_flag_days',
  AUTO_MARK_DAYS:   'inv_auto_mark_days',
  USER_ROLE:        'inv_user_role',
  PIN:              'inv_pin',
  ONBOARDING_DONE:  'inv_onboarding_complete',
  TUTORIAL_SEEN:    'inv_tutorial_seen',
  TOUR_SEEN_FULL:   'inv_tour_seen_full',   // driver saw the full-mode tour
  TOUR_SEEN_EASY:   'inv_tour_seen_easy',   // driver saw the Easy Mode tour
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
  SYNC_FAILED:        'inv_sync_failed',   // changes the server rejected MAX_RETRIES times — kept, never deleted
  SYNC_HELD:          'inv_sync_held',     // uploads refused for the free plan's limit — kept, re-sent once Pro or next month
  ERROR_LOG:          'inv_error_log',
  GUEST_MODE:         'inv_guest_mode',
  AUTH_UID:           'inv_auth_uid',
  PULSE_HOME:         'inv_pulse_home',
  PLAN_CACHE:         'inv_plan_cache',    // the server's my_plan() answer + fetchedAt (never backed up)
  USAGE:              'inv_usage',         // { month: 'YYYY-MM' (local), count } — new invoices made on this phone
  PLAN_NOTICE:        'inv_plan_notice',   // one-time plan note still to show: 'moved' | 'ended'
  // Which invoice numbers carry a signature. Cheap stand-in for the full
  // base64 blobs so the history list can lock editing without downloading them.
  SIG_INDEX:          'inv_sig_index',
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
/**
 * The stored business name is empty until the user sets one — we never brand a
 * new account with a placeholder that masquerades as a real company. Editable
 * fields start blank; the prompt below is shown as placeholder/hint text only.
 */
export const DEFAULT_BUSINESS_NAME = '';
/** Visible prompt shown where a business name would go before one is set. */
export const BUSINESS_NAME_PLACEHOLDER = 'Your Business Name';

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
  // This phone's storage for Keiro is full: a write failed even after
  // makeRoom() (utils/storageRoom.js). STORAGE_OK follows the next write that
  // succeeds. StorageBanner listens for both.
  STORAGE_FULL:   'inv-storage-full',
  STORAGE_OK:     'inv-storage-ok',
  // Pricing (docs/specs/2026-10-16-pricing-design.md).
  PLAN_CHANGE:     'inv-plan-change',      // the cached plan or this month's count changed
  OPEN_UPGRADE:    'inv-open-upgrade',     // detail: { title? } — UpgradeHost shows the Upgrade sheet
  OPEN_FREE_LIMIT: 'inv-open-free-limit',  // UpgradeHost shows "You've used your 20 free invoices"
  // Onboarding/tutorial milestones — dispatched by feature sites, consumed by the
  // milestone bridge (tutorialProgress) and walkthrough settle steps.
  ONBOARDING_INVOICE_CREATED: 'inv-onboarding-invoice-created',
  ONBOARDING_INVOICE_PAID:    'inv-onboarding-invoice-paid',
  ONBOARDING_SETTINGS_SAVED:  'inv-onboarding-settings-saved',
  ONBOARDING_STORE_VIEWED:    'inv-onboarding-store-viewed',
};

/** Shown when an invoice reached neither the cloud nor this phone. */
export const STORAGE_FULL_MESSAGE = "Not saved: this phone's storage for Keiro is full.";

/** Shown in the product field while a scanned barcode is being named remotely. */
export const LOOKING_UP_TEXT = 'Looking up…';

/** A scan no source could name. addItem() saves the typed name under that barcode. */
export const UNKNOWN_BARCODE_MESSAGE = "Not in the product database. Type the name once and Keiro will remember it.";
/** Under a looked-up name on the Easy check card (spec #188 Decision 4). */
export const NAME_FROM_DRIVERS  = 'From other Keiro drivers. Edit it if it’s wrong.';
export const NAME_FROM_DATABASE = 'From a product database. Edit it if it’s wrong.';

/** A lookup that couldn't run (offline, service down, out of quota) — the product may well exist. */
export const LOOKUP_UNAVAILABLE_MESSAGE = "Couldn't check right now (no signal, or the lookup service is busy). Type the name, or tap Try again.";

/** GS1 restricted-circulation codes (barcodeFormat.isStoreMadeBarcode) — no database can name them. */
export const STORE_MADE_BARCODE_MESSAGE = "This is a store-made barcode, so no database will have it. Type the name once and Keiro will remember it.";

/** Gmail-sent sign-in mail lands in Spam more often than domain mail. */
export const SPAM_HINT = "Can't find it? Check your Spam folder.";

/** Where people write to Keiro (privacy requests, account help). */
export const CONTACT_EMAIL = 'alomonds@gmail.com';

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
/** Longest the shared-product-name RPCs may take before the app carries on without them. */
export const SHARED_RPC_TIMEOUT_MS = 4000;

/**
 * How long (ms) a deleted invoice stays recoverable via the "Undo" snackbar
 * before the deletion is finalized (local + cloud). ~5s is the common snackbar
 * window; long enough to catch a mis-tap, short enough not to linger.
 */
export const DELETE_UNDO_MS = 5000;

// Cross-account refresh cadence. Realtime (a websocket subscription) is the
// primary signal; these polls are only a safety net, because postgres_changes
// silently delivers nothing unless the table is in the `supabase_realtime`
// publication (see supabase-realtime.sql).
//   HEALTHY  — Realtime subscribed: a rare backstop against a missed event.
//   DEGRADED — Realtime unavailable: the app still works, just less instantly.
// This replaced a flat 30s poll (~2,880 requests/day/session) that was the main
// driver of the Supabase egress overage.
export const SYNC_POLL_HEALTHY_MS  = 10 * 60 * 1000; // 10 min
export const SYNC_POLL_DEGRADED_MS = 60 * 1000;      // 1 min

// ── Responsive layout ───────────────────────────────────────────────────────
/**
 * The two width thresholds that separate the app's three layout tiers. Read
 * through `useBreakpoint()` — nothing should compare `innerWidth` to these
 * directly.
 *
 *   < TABLET            phone   — the original layout: top tab strip, swipeable
 *                                 tab carousel, bottom-sheet overlays.
 *   TABLET … DESKTOP-1  tablet  — same chrome, wider content, 2-column grids.
 *   >= DESKTOP          desktop — docked side nav, no carousel, centered panels.
 *
 * 768 is the conventional portrait-tablet edge. 1100 is set so a half-screen
 * laptop window (~720px) lands on tablet rather than getting desktop chrome in
 * a space too narrow for a 232px side nav plus readable content.
 */
export const BREAKPOINTS = {
  TABLET:  768,
  DESKTOP: 1100,
};

// NOTE: the max content WIDTH per tier is not defined here — it lives in
// src/App.css as the `--content-max` / `--form-max` custom properties, because
// width capping is pure CSS and needs no JS. These BREAKPOINTS constants exist
// for the structural decisions CSS can't make from an inline style: which nav
// to render, whether to build the swipe carousel, how many grid columns.
// The two thresholds are therefore written in both files — keep them in sync.

/** Width of the docked side nav on desktop. Matches NavDrawer's slide-in width. */
export const SIDE_NAV_WIDTH = 232;

// ── Pricing (docs/specs/2026-10-16-pricing-design.md) ───────────────────────
/** New invoices a free driver can make per local calendar month. */
export const FREE_INVOICES_PER_MONTH = 20;
/** "N free invoices left this month" shows from this many left. */
export const FREE_WARN_AT_LEFT = 5;
/**
 * The time zone of pro_until's day. The owner's switch ends a day at 23:59:59 in this zone
 * (docs/COWORK_PRICING.md), so every date shown from pro_until is read in it, not the phone's.
 */
export const PRO_UNTIL_TIME_ZONE = 'America/New_York';
/** Offline, a cached Pro stays Pro this long past its paid-until date. */
export const OFFLINE_PRO_GRACE_DAYS = 3;
/** my_plan() gives up after this long on a weak signal; the cached plan stands. */
export const PLAN_RPC_TIMEOUT_MS = 8000;
/**
 * refreshPlan() as a whole gives up after this long (the lazy import, the wait for the session
 * and the call), so one hung attempt can't block every later refresh for the session.
 */
export const PLAN_REFRESH_TIMEOUT_MS = 20000;
/** The server's refusal of a free account's upload past the backstop (supabase-pricing.sql). */
export const FREE_LIMIT_ERROR = 'KEIRO_FREE_LIMIT';
/** Shown prices. Payments are coming soon (owner decision 2026-10-17). */
export const PRO_PRICE = { month: '$4.99', year: '$49.99' };
const NBSP = '\u00a0';
/** The title beside Settings' Easy Mode switch; the switch's accessible name starts with it (PLAN_COPY.easySwitchLabel). */
const EASY_SWITCH_TEXT = 'Simplified view';
/** Every plan message, in one place. */
export const PLAN_COPY = {
  upgradeTitle: 'Keiro Pro',
  normalModeTitle: 'Normal mode is part of Pro',
  perks: [
    'Unlimited invoices',
    'Normal mode: Home, the full invoice form, Store Info, Notes, Marketplace',
    'Sign invoices on the phone',
  ],
  priceLine: `${PRO_PRICE.month} a month or ${PRO_PRICE.year} a year`,
  // priceLine for the sign-up card, which is narrow: each price stays with its period, so a line never ends on "$49.99 a".
  signupPriceLine: `${PRO_PRICE.month}${NBSP}a${NBSP}month or ${PRO_PRICE.year}${NBSP}a${NBSP}year`,
  comingSoon: 'Payments are coming soon.',
  notNow: 'Not now',
  ok: 'OK',
  upgrade: 'Upgrade',
  limitTitle: `You've used your ${FREE_INVOICES_PER_MONTH} free invoices this month`,
  limitBody: (reset) => `They reset ${reset}.`,
  leftLine: (n) => `${n} free invoice${n === 1 ? '' : 's'} left this month`,
  // Settings → Plan: the section's title, then its row labels (planSummary). A Free row's second line is usedLine.
  planSectionTitle: 'Plan',
  freeLabel: 'Free',
  proLabel: 'Pro',
  proFreeLabel: 'Pro (free)',
  proUntilLabel: (date) => `Pro until ${date}`,
  usedLine: (used, reset) => `${used} of ${FREE_INVOICES_PER_MONTH} invoices used this month · resets ${reset}`,
  // The sync banner's line for uploads the server refused for the limit. `reset` is when the month turns over ("Nov 1").
  heldLine: (n, reset) => `${n} invoice${n === 1 ? '' : 's'} will upload ${reset}, or with Pro`,
  signOutHeldAll: (n) => n === 1 ? "Stay signed in: it'll upload once you're on Pro, or next month." : "Stay signed in: they'll upload once you're on Pro, or next month.",
  signOutHeldSome: (online, held) => `Stay signed in: ${online} will upload when you're back online, and the ${held} invoice${held === 1 ? '' : 's'} waiting for Pro once you're on Pro, or next month.`,
  movedNote: "Keiro now has a free plan and a Pro plan. You're on Free, so you're in Easy Mode. Settings → Plan to upgrade.",
  endedNote: `Your Pro plan ended. You're back on Free: Easy Mode, ${FREE_INVOICES_PER_MONTH} invoices a month. Nothing was deleted.`,
  planNoticeLabel: 'Your plan',   // the accessible name of the one-time plan note (PlanNotices)
  proLockLabel: 'Part of Pro',    // the accessible name of the lock beside a locked switch (Settings → Easy Mode)
  easySwitchText: EASY_SWITCH_TEXT,  // the title shown beside Settings' Easy Mode switch
  // The accessible name of that switch. It includes the title shown beside it, so someone who says what they see
  // (voice control) reaches it, and the "Easy Mode" that tells it apart from the section's header button.
  easySwitchLabel: `${EASY_SWITCH_TEXT}, Easy Mode switch`,
  sellerSigAlt: 'Driver / Deliverer signature', // alt text of a saved signature shown read-only on Free (InvoiceView)
  buyerSigAlt: 'Store Manager signature',
  // The words above each signature: the signing pads' labels (Pro) and the read-only captions (Free) are the same text.
  sellerSigCaption: 'Driver / Deliverer',
  buyerSigCaption: 'Store Manager — Proof of Delivery',
  signLocked: 'Signature lines print blank, to sign by hand. Sign on the phone with Pro',
  tourFree: `You get ${FREE_INVOICES_PER_MONTH} free invoices a month. Settings → Plan shows how many are left.`,
  // The Easy tour's one step on + New when the month's free invoices are used up (tapping + New then opens the limit sheet, not the invoice screen).
  tourLimitTitle: `You've used your ${FREE_INVOICES_PER_MONTH} free invoices`,
  tourLimitDesc: (reset) => `New invoices are back on ${reset}.`,
  // The sign-up plan screen (PlanScreen in OnboardingFlow). Its cards are named freeLabel / proLabel, and Pro's price is priceLine.
  signupTitle: 'Your plan',
  signupSubtitle: 'Start free. Pro is coming soon.',
  freePrice: '$0',
  freeBullets: ['Easy Mode: scan items, print or share invoices', `${FREE_INVOICES_PER_MONTH} invoices a month`, 'Store balances and reports'],
  proBullets: ['Unlimited invoices', 'Normal mode and the full invoice form', 'Sign invoices on the phone'],
  comingSoonBadge: 'Coming soon',
  startFree: 'Start free',
};
