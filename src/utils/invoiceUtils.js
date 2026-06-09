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
 * @returns {number}
 */
export function getFlagDays() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.AUTO_FLAG_DAYS)) || DEFAULT_FLAG_DAYS;
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
