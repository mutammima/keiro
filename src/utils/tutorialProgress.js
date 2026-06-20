/**
 * tutorialProgress.js — persistent state + content registries for the
 * three-layer onboarding system (Quick Start, contextual tips, feature
 * discovery checklist).
 *
 * STORAGE MODEL — every key is `inv_`-prefixed so the backup/restore sweep in
 * useBackup.js captures it automatically (no ALL_KEYS edit needed):
 *   inv_onboarding_complete   — quick start finished or skipped (shared w/ useOnboarding)
 *   inv_tip_<id>              — a contextual tip has been seen + dismissed
 *   inv_act_<id>              — a checklist-tracked feature has been used at least once
 *   inv_pulse_home            — show the post-quick-start pulse dot on the Home tab
 *
 * Flags are stored as the raw string '1' (matching the app's existing
 * STORAGE_KEYS.ONBOARDING_DONE = 'true' convention of plain string flags), so
 * they survive JSON-free round-trips through export/import untouched.
 */
import { STORAGE_KEYS, EVENTS } from './constants';

// ── Keys ────────────────────────────────────────────────────────────────────
const QS_DONE_KEY  = STORAGE_KEYS.ONBOARDING_DONE; // reuse the existing onboarding flag
const TIP_PREFIX   = STORAGE_KEYS.TIP_PREFIX;
const ACTION_PREFIX = STORAGE_KEYS.ACT_PREFIX;
const HOME_PULSE_KEY = STORAGE_KEYS.PULSE_HOME;

// Guided walkthrough persistence (step resume + completion)
const WT_STEP_PREFIX = STORAGE_KEYS.WT_STEP_PREFIX;   // inv_wt_step_<id> = last completed step index
const WT_DONE_PREFIX = STORAGE_KEYS.WT_DONE_PREFIX;   // inv_wt_done_<id> = '1' when fully complete

// ── Events ──────────────────────────────────────────────────────────────────
/** Fired by triggerTip(id); TipManager listens and decides whether to show it. */
export const TIP_TRIGGER_EVENT = 'inv-tip-trigger';
/** Fired whenever a tip is seen or an action recorded, so an open checklist refreshes. */
export const PROGRESS_EVENT = 'inv-tutorial-progress';

// ── Low-level flag helpers ────────────────────────────────────────────────────
function getFlag(key) {
  try { return !!localStorage.getItem(key); } catch { return false; }
}
function setFlag(key) {
  try { localStorage.setItem(key, '1'); } catch {}
}
function clearFlag(key) {
  try { localStorage.removeItem(key); } catch {}
}

// ── Quick start ───────────────────────────────────────────────────────────────
export function isQuickStartDone() {
  try { return localStorage.getItem(QS_DONE_KEY) === 'true'; } catch { return false; }
}

// ── Home pulse (post-quick-start nudge toward the dashboard) ──────────────────
export function setHomePulse(on) { on ? setFlag(HOME_PULSE_KEY) : clearFlag(HOME_PULSE_KEY); }
export function isHomePulse()    { return getFlag(HOME_PULSE_KEY); }

// ── Guided walkthrough state ──────────────────────────────────────────────────
/** Returns the last-completed step index (-1 = not started, null = not found). */
export function getWalkthroughStep(id) {
  try {
    const v = localStorage.getItem(WT_STEP_PREFIX + id);
    return v === null ? null : parseInt(v, 10);
  } catch { return null; }
}
/** Persist step so the user can resume. stepIndex = last COMPLETED step (0-based). */
export function setWalkthroughStep(id, stepIndex) {
  try { localStorage.setItem(WT_STEP_PREFIX + id, String(stepIndex)); } catch {}
}
export function clearWalkthroughStep(id) {
  try { localStorage.removeItem(WT_STEP_PREFIX + id); } catch {}
}
export function isWalkthroughDone(id) {
  try { return localStorage.getItem(WT_DONE_PREFIX + id) === '1'; } catch { return false; }
}
export function setWalkthroughDone(id) {
  try { localStorage.setItem(WT_DONE_PREFIX + id, '1'); } catch {}
  clearWalkthroughStep(id);
  emitProgress();
}

// ── Tips ────────────────────────────────────────────────────────────────────
export function hasSeenTip(id) { return getFlag(TIP_PREFIX + id); }
export function markTipSeen(id) {
  setFlag(TIP_PREFIX + id);
  emitProgress();
}

/**
 * Asks the TipManager to consider showing a tip. Safe to call repeatedly —
 * the manager ignores tips already seen, out of role, or while the quick start
 * is active, and queues the rest one at a time.
 * @param {string} id
 */
export function triggerTip(id) {
  try { window.dispatchEvent(new CustomEvent(TIP_TRIGGER_EVENT, { detail: { id } })); } catch {}
}

// ── Actions (checklist signals) ────────────────────────────────────────────────
export function hasDoneAction(id) { return getFlag(ACTION_PREFIX + id); }
export function markAction(id) {
  if (getFlag(ACTION_PREFIX + id)) return; // already recorded — skip the event churn
  setFlag(ACTION_PREFIX + id);
  emitProgress();
}

function emitProgress() {
  try { window.dispatchEvent(new CustomEvent(PROGRESS_EVENT)); } catch {}
}

// ── Milestone bridge ──────────────────────────────────────────────────────────
// The app already dispatches a handful of `inv-onboarding-*` milestone events
// at real feature-completion sites (invoice created, marked paid, business name
// saved, store balance viewed). Map them straight onto checklist action flags so
// those four items tick without re-instrumenting their call sites.
const MILESTONE_MAP = {
  [EVENTS.ONBOARDING_INVOICE_CREATED]: 'invoice_created',
  [EVENTS.ONBOARDING_INVOICE_PAID]:    'marked_paid',
  [EVENTS.ONBOARDING_SETTINGS_SAVED]:  'biz_name',
  [EVENTS.ONBOARDING_STORE_VIEWED]:    'store_balance',
};

let bridgeInstalled = false;
/** Idempotent — wires the milestone events to action flags once per session. */
export function installMilestoneBridge() {
  if (bridgeInstalled) return;
  bridgeInstalled = true;
  Object.entries(MILESTONE_MAP).forEach(([evt, action]) => {
    window.addEventListener(evt, () => markAction(action));
  });
}

// ── Contextual tip registry ─────────────────────────────────────────────────
// role: 'driver' | 'store_owner' | 'any'
// selector: the element the tip points at (must exist when triggered)
// marksAction: optional checklist action recorded when the tip is dismissed
export const TIPS = {
  // ----- Driver -----
  'd-route-history':   { role: 'driver', selector: '[data-tip="route-history"]',
    text: 'Your invoices appear here, newest first. Tap any card to expand it and see your options.' },
  'd-invoice-actions': { role: 'driver', selector: '[data-tip="invoice-actions"]',
    text: 'From here you can change payment status, share a PDF, send a WhatsApp reminder, duplicate, or delete.' },
  'd-overdue':         { role: 'driver', selector: '[data-tip="overdue"]',
    text: 'This invoice is overdue. Tap to send a payment reminder straight to the store over WhatsApp.' },
  'd-conn-order':      { role: 'driver', selector: '[data-tip="conn-orders"]',
    text: 'A connected store just sent you an order. Tap Fill Invoice to turn it into a pre-filled invoice automatically.' },
  'd-barcode':         { role: 'driver', selector: '[data-tip="barcode"]',
    text: 'Tap here to scan a product barcode and look it up automatically instead of typing.' },
  'd-autofill':        { role: 'driver', selector: '[data-tip="product-name"]',
    text: 'Start typing a product name and it autofills from your catalog of past products.' },
  'd-share':           { role: 'driver', selector: '[data-tip="share-options"]',
    text: 'Your invoice is ready. Share it over WhatsApp or download a PDF to send to the store.' },
  'd-home-chart':      { role: 'driver', selector: '[data-tip="home-chart"]',
    text: 'This shows your revenue by day. It updates automatically as you create invoices and mark them paid.' },
  'd-stores':          { role: 'driver', selector: '[data-tip="stores-list"]',
    text: "These are the stores you're connected to on Keiro. Tap any store to see its full balance and invoice history." },
  'd-store-balance':   { role: 'driver', selector: '[data-tip="store-balance-total"]', marksAction: 'store_balance',
    text: 'This is everything this store currently owes you across all unpaid invoices.' },
  'd-reports-eod':     { role: 'driver', selector: '[data-tip="reports-eod"]',
    text: 'At the end of your route, open End of Day to see the total cash and card you collected today.' },
  // ----- Store Owner -----
  'o-orders-list':     { role: 'store_owner', selector: '[data-tip="so-orders-list"]',
    text: 'Your delivery requests appear here. Track each one from pending to delivered in real time.' },
  'o-order-status':    { role: 'store_owner', selector: '[data-tip="so-order-status"]',
    text: 'Your driver sees this order in their app within 30 seconds. The status updates here as they accept and deliver it.' },
  'o-order-delivered': { role: 'store_owner', selector: '[data-tip="so-invoice-number"]', marksAction: 'so_delivered',
    text: 'Your driver generated an invoice for this order. Tap the order to view its line items and payment status.' },
  'o-invoices-list':   { role: 'store_owner', selector: '[data-tip="so-invoices-list"]',
    text: 'Every invoice your connected drivers generate for you appears here automatically.' },
  'o-payment-status':  { role: 'store_owner', selector: '[data-tip="so-payment-status"]',
    text: 'Your driver sets the payment status on each invoice. Tap it to see the full details.' },
  'o-drivers-list':    { role: 'store_owner', selector: '[data-tip="so-drivers-list"]',
    text: "These are the drivers you're connected to on Keiro. Tap Invite to add a new driver by sharing a link." },
  'o-invite':          { role: 'store_owner', selector: '[data-tip="invite-link"]',
    text: 'Share this link with your driver. When they open it and sign in, the connection is established automatically.' },
  'o-home-restock':    { role: 'store_owner', selector: '[data-tip="so-restock"]',
    text: 'When a product runs low based on your order history, Keiro suggests a restock here automatically.' },
  'o-restock-card':    { role: 'store_owner', selector: '[data-tip="so-restock-card"]', marksAction: 'so_restock',
    text: 'Tap Reorder to send this product straight to the driver who carries it.' },
  // ----- Any role -----
  'settings-biz':      { role: 'any', selector: '[data-tip="settings-biz"]',
    text: 'Add your business name and phone here. They appear on every invoice you generate.' },
  'backup-export':     { role: 'any', selector: '[data-tip="backup-export"]',
    text: 'Export your data regularly as a backup. You can restore it on any device if you ever switch phones.' },
};

// ── Feature discovery checklist registry ──────────────────────────────────────
// page: where "Take me there" navigates (tab id or overlay id understood by App.navigate)
const DRIVER_CHECKLIST = [
  { id: 'wt_driver_invoice', label: 'Complete the invoice walkthrough',              page: null,          desc: 'A self-running demo: watch a real invoice get created, marked paid, and shared.', walkthrough: 'driver_invoice' },
  { id: 'invoice_created', label: 'Create your first invoice',                       page: 'invoice',     desc: 'Tap + New on the Route tab to build and generate an invoice.' },
  { id: 'barcode',         label: 'Scan a barcode to add a product',                 page: 'invoice',     desc: 'On the invoice form, tap the camera button to scan a product barcode.' },
  { id: 'marked_paid',     label: 'Mark an invoice as paid',                         page: 'route',       desc: 'Tap an invoice\'s status badge to cycle it to Paid.' },
  { id: 'reminder',        label: 'Send a WhatsApp payment reminder',                page: 'route',       desc: 'On an overdue invoice, tap Remind to open a pre-written WhatsApp message.' },
  { id: 'shared_pdf',      label: 'Generate and share a PDF invoice',                page: 'route',       desc: 'Open any invoice and tap Share or Download PDF.' },
  { id: 'biz_name',        label: 'Add your business name in Settings',              page: 'settings',    desc: 'Your business name and phone appear on every invoice.' },
  { id: 'connected',       label: 'Connect with a store',                            page: 'stores',      desc: 'Invite a store with a code or link so their orders reach you directly.' },
  { id: 'filled_order',    label: 'Receive and fill an order from a connected store',page: 'route',       desc: 'When a connected store orders, tap Fill Invoice on the Route tab.' },
  { id: 'store_balance',   label: 'View your store balances',                        page: 'stores',      desc: 'Tap a store to see everything it owes you across all invoices.' },
  { id: 'eod',             label: 'Generate an end of day report',                   page: 'end-of-day',  desc: 'See your total cash and card collected for the day.' },
  { id: 'backup',          label: 'Export a backup of your data',                    page: 'settings',    desc: 'Save a backup file you can restore on any device.' },
  { id: 'signature',       label: 'Sign an invoice with a customer signature',       page: 'route',       desc: 'Open an invoice and capture a proof-of-delivery signature.' },
];

const OWNER_CHECKLIST = [
  { id: 'wt_so_request',   label: 'Complete the delivery request walkthrough',       page: null,          desc: 'A self-running demo: watch a real delivery request get placed and tracked to delivery.', walkthrough: 'so_request' },
  { id: 'so_request',      label: 'Request a delivery from a connected driver',      page: 'so-request',  desc: 'Tap + New on the Orders tab and assign a connected driver.' },
  { id: 'so_delivered',    label: 'Track an order from pending to delivered',        page: 'so-orders',   desc: 'Watch an order move through pending, accepted, and delivered.' },
  { id: 'so_view_invoice', label: 'View a driver-generated invoice',                 page: 'so-invoices', desc: 'Open an invoice your connected driver generated for you.' },
  { id: 'connected',       label: 'Connect with a driver',                           page: 'so-drivers',  desc: 'Invite a driver with a link so your orders reach them directly.' },
  { id: 'so_restock',      label: 'Check your restock suggestions',                  page: 'so-home',     desc: 'Keiro flags products due for a reorder based on your order rhythm.' },
  { id: 'so_history',      label: 'View your delivery history',                      page: 'so-reports',  desc: 'See order volume, status mix, and your most-ordered products.' },
  { id: 'backup',          label: 'Export a backup of your data',                    page: 'settings',    desc: 'Save a backup file you can restore on any device.' },
];

/**
 * Returns the checklist for a role with live `done` state.
 * @param {'driver'|'store_owner'} role
 * @returns {{id,label,page,desc,done:boolean}[]}
 */
export function getChecklist(role) {
  const items = role === 'store_owner' ? OWNER_CHECKLIST : DRIVER_CHECKLIST;
  return items.map(it => ({
    ...it,
    done: it.walkthrough
      ? isWalkthroughDone(it.walkthrough)
      : hasDoneAction(it.id),
  }));
}
