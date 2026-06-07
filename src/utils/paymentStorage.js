/**
 * paymentStorage.js — per-invoice payment log.
 *
 * Payments are stored in localStorage under 'inv_payments':
 *   { [invoiceNumber]: Payment[] }
 *
 * Payment shape:
 *   { id: string, amount: number, note: string, ts: string (ISO) }
 *
 * This module is intentionally synchronous — no cloud sync yet.
 * All keys follow the inv_ prefix convention.
 */

import { lsGet, lsSet } from './storage';

const KEY = 'inv_payments';

/**
 * Returns all logged payments for a given invoice, newest first.
 * @param {number|string} invoiceNumber
 * @returns {Payment[]}
 */
export function getPaymentsFor(invoiceNumber) {
  const all = lsGet(KEY, {});
  return all[String(invoiceNumber)] || [];
}

/**
 * Adds a new payment entry and returns the updated list.
 * @param {number|string} invoiceNumber
 * @param {number|string} amount
 * @param {string} [note]
 * @returns {Payment[]} Updated list for this invoice.
 */
export function addPayment(invoiceNumber, amount, note = '') {
  const all = lsGet(KEY, {});
  const key = String(invoiceNumber);
  if (!all[key]) all[key] = [];
  all[key].unshift({
    id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    amount: Number(amount),
    note: note.trim(),
    ts: new Date().toISOString(),
  });
  lsSet(KEY, all);
  return [...all[key]];
}

/**
 * Removes a single payment entry by ID.
 * @param {number|string} invoiceNumber
 * @param {string} paymentId
 */
export function removePayment(invoiceNumber, paymentId) {
  const all = lsGet(KEY, {});
  const key = String(invoiceNumber);
  if (all[key]) {
    all[key] = all[key].filter(p => p.id !== paymentId);
    lsSet(KEY, all);
  }
}

/**
 * Returns the sum of all logged payments for an invoice.
 * @param {number|string} invoiceNumber
 * @returns {number}
 */
export function getTotalPaid(invoiceNumber) {
  return getPaymentsFor(invoiceNumber).reduce((s, p) => s + Number(p.amount), 0);
}

/**
 * Removes all payments for an invoice (called when the invoice itself is deleted).
 * @param {number|string} invoiceNumber
 */
export function clearPaymentsFor(invoiceNumber) {
  const all = lsGet(KEY, {});
  delete all[String(invoiceNumber)];
  lsSet(KEY, all);
}
