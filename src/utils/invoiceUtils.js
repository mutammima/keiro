/**
 * invoiceUtils.js — pure helpers for working with invoice objects.
 *
 * Invoices come from two shapes that must both be handled everywhere:
 *  - camelCase (local form / cache):  { storeName, paymentStatus, … }
 *  - snake_case (Supabase rows):      { store_name, payment_status, … }
 *
 * These helpers were previously copy-pasted into Home, EndOfDay, StoreBalance,
 * useInvoiceHistory and InvoiceHistory. Centralising them guarantees the total,
 * status and overdue logic stay identical across every screen.
 */

import { MS_PER_DAY, DEFAULT_FLAG_DAYS, STORAGE_KEYS } from './constants';

/**
 * Sum of (qty × price) for every line item on an invoice.
 * @param {{items?: Array<{qty:number|string, price:number|string}>}} inv
 * @returns {number}
 */
export function subtotalOf(inv) {
  return (inv.items || []).reduce((s, i) => s + Number(i.qty) * Number(i.price), 0);
}

/**
 * Normalised payment status, tolerating both camelCase and snake_case shapes.
 * @param {object} inv
 * @returns {'unpaid'|'paid'|'partial'}
 */
export function getStatus(inv) {
  return inv.paymentStatus || inv.payment_status || 'unpaid';
}

/**
 * Formats a Date the same way invoice dates are stored ("June 2, 2025").
 * @param {Date} d
 * @returns {string}
 */
export function formatInvoiceDate(d) {
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

/** Today's date in the stored invoice-date format. */
export function todayInvoiceDate() {
  return formatInvoiceDate(new Date());
}

/**
 * The user's configured overdue threshold in days, or the default.
 * Any finite value ≥ 0 is honored — including 0 ("flag from the next day").
 * The old `|| DEFAULT` swallowed a stored 0 as falsy and returned the default;
 * a restored backup or manual value could carry 0, so accept it faithfully.
 * @returns {number}
 */
export function getFlagDays() {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEYS.AUTO_FLAG_DAYS));
    return Number.isFinite(v) && v >= 0 ? v : DEFAULT_FLAG_DAYS;
  } catch {
    return DEFAULT_FLAG_DAYS;
  }
}

/**
 * Whole days elapsed since the given invoice date string. Returns 0 for an
 * unparseable date.
 * @param {string} dateStr
 * @returns {number}
 */
export function daysSince(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return 0;
  return Math.floor((Date.now() - d.getTime()) / MS_PER_DAY);
}

/**
 * True when an invoice is overdue: not fully paid and older than the user's
 * auto-flag threshold. Pass a precomputed flagDays to avoid re-reading
 * localStorage in a tight loop.
 * @param {object} inv
 * @param {number} [flagDays] - threshold in days; defaults to getFlagDays()
 * @returns {boolean}
 */
export function isOverdue(inv, flagDays = getFlagDays()) {
  if (getStatus(inv) === 'paid') return false;
  const d = new Date(inv.date);
  return !isNaN(d) && Date.now() - d.getTime() > flagDays * MS_PER_DAY;
}

/**
 * Builds a wa.me deep link for a phone + message. Strips every non-digit from
 * the phone; with no usable number, falls back to the chooser link so the user
 * can pick a recipient. The message is URL-encoded.
 * @param {string} phone - raw phone string (may contain spaces, +, dashes)
 * @param {string} text  - message body
 * @returns {string}
 */
export function buildWhatsAppUrl(phone, text) {
  const digits  = (phone || '').replace(/\D/g, '');
  const encoded = encodeURIComponent(text);
  return digits ? `https://wa.me/${digits}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
}

/**
 * Currency string with thousands separators, e.g. 1234.5 → "$1,234.50".
 * Previously duplicated as a local `money()` in SOInvoices and SOReports.
 * (Home keeps a separator-less `toFixed` variant — see note there.)
 * @param {number|string} n
 * @returns {string}
 */
export function formatMoney(n) {
  return '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Normalises an order / bridge request to its line-item array. Multi-line
 * requests carry an `items` array; single-line (or pre-multi-item) records are
 * reconstructed from the scalar product_name/quantity/price summary so every
 * consumer can treat orders uniformly as a list of lines.
 * @param {object} o
 * @returns {Array<{name:string, qty:number, price:number}>}
 */
export function orderLines(o) {
  if (!o) return [];
  if (Array.isArray(o.items) && o.items.length) return o.items;
  return [{
    name:  o.productName || o.product_name || '',
    qty:   Number(o.quantity) || 1,
    price: Number(o.price) || 0,
  }];
}

/** Sum of qty × price across an order's line items. */
export function orderTotal(o) {
  return orderLines(o).reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.price) || 0), 0);
}

/**
 * Short date from a stored ISO order/delivery date ("YYYY-MM-DD" → "Jun 2, 2025").
 * Parsed at local midnight so the day never drifts across timezones. Previously
 * duplicated verbatim as a local `formatDate(iso)` in SOOrders and SOInvoices.
 * @param {string} iso
 * @returns {string}
 */
export function formatOrderDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** An invoice's store name, trimmed; '' when it has none (an Easy Mode invoice can). */
export function storeNameOf(inv) {
  return String(inv?.storeName || inv?.store_name || '').trim();
}

/** The later of two invoice dates (as stored, e.g. "October 9, 2026"). */
function laterDate(a, b) {
  const ta = Date.parse(a || '') || 0;
  const tb = Date.parse(b || '') || 0;
  return tb > ta ? b : a;
}

/**
 * The Stores tab's per-store rows: outstanding balance, invoice count, total
 * and last delivery date, biggest balance first. Invoices with no store are
 * not a store — they're counted in `unassigned` (and in the overall total).
 */
export function groupInvoicesByStore(invoices) {
  const map = {};
  const unassigned = { count: 0, outstanding: 0 };
  invoices.forEach(inv => {
    const owed = getStatus(inv) !== 'paid' ? subtotalOf(inv) : 0;
    const name = storeNameOf(inv);
    if (!name) {
      unassigned.count += 1;
      unassigned.outstanding += owed;
      return;
    }
    if (!map[name]) map[name] = { name, count: 0, outstanding: 0, total: 0, lastDate: '' };
    const st = map[name];
    st.count += 1;
    st.total += subtotalOf(inv);
    st.outstanding += owed;
    st.lastDate = laterDate(st.lastDate, inv.date);
  });
  const stores = Object.values(map).sort((a, b) => b.outstanding - a.outstanding || a.name.localeCompare(b.name));
  return { stores, unassigned };
}

/** Revenue per store, biggest first, as [name, total] pairs; no-store invoices skipped. */
export function revenueByStore(invoices, totalOf) {
  const map = {};
  invoices.forEach(inv => {
    const name = storeNameOf(inv);
    if (name) map[name] = (map[name] || 0) + totalOf(inv);
  });
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

/** The Stores tab's note about invoices that have no store yet. */
export function unassignedStoreNote(count) {
  return count === 1
    ? '1 invoice has no store. Open it and tap ⋯ → Edit to add it.'
    : `${count} invoices have no store. Open one and tap ⋯ → Edit to add it.`;
}
