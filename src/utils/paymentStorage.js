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
import * as db from '../services/db';
import { notifySyncError } from './syncNotify';

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
  const payment = {
    id:     `p_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    amount: Number(amount),
    note:   note.trim(),
    ts:     new Date().toISOString(),
  };
  all[key].unshift(payment);
  lsSet(KEY, all);
  // Background cloud sync — surface a failure to the user since payments are
  // money records. db helpers return { error }; also guard against throws.
  db.saveInvoicePayment({ ...payment, invoiceNumber: Number(invoiceNumber) })
    .then(({ error }) => {
      if (error) {
        console.error('saveInvoicePayment cloud error', error);
        notifySyncError('Payment logged on this device but could not reach the cloud. It will sync the next time you open the app signed in.');
      }
    })
    .catch(e => {
      console.error('saveInvoicePayment cloud error', e);
      notifySyncError('Payment logged on this device but could not reach the cloud. It will sync the next time you open the app signed in.');
    });
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
  db.deleteInvoicePayment(paymentId)
    .then(({ error }) => {
      if (error) {
        console.error('deleteInvoicePayment cloud error', error);
        notifySyncError('Payment removed on this device but not from the cloud — it may reappear after the next sync.');
      }
    })
    .catch(e => console.error('deleteInvoicePayment cloud error', e));
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
  db.clearInvoicePayments(invoiceNumber)
    .then(({ error }) => { if (error) console.error('clearInvoicePayments cloud error', error); })
    .catch(e => console.error('clearInvoicePayments cloud error', e));
}

/**
 * Fetches all payments for the current user from Supabase and rebuilds
 * the entire localStorage cache. Called on InvoiceHistory mount so a
 * fresh device always has up-to-date payment data.
 * @returns {Promise<void>}
 */
export async function loadAllPaymentsFromCloud() {
  const { data, error } = await db.getAllInvoicePayments();
  if (error || !data) return;
  // Rebuild full cache keyed by invoice_number
  const all = {};
  data.forEach(row => {
    const key = String(row.invoice_number);
    if (!all[key]) all[key] = [];
    all[key].push({
      id:     row.id,
      amount: Number(row.amount),
      note:   row.note || '',
      ts:     row.ts || row.created_at,  // ts is the DB column; fallback for safety
    });
  });
  // Sort each invoice's payments newest-first (mirror addPayment's unshift ordering)
  Object.keys(all).forEach(k => {
    all[k].sort((a, b) => new Date(b.ts) - new Date(a.ts));
  });
  lsSet(KEY, all);
}
