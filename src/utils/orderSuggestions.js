/**
 * orderSuggestions.js — frequency analysis over a store's recent invoices to
 * surface likely reorder items as one-tap chips on the New Invoice form.
 *
 * A product is suggested when it appears on at least 2 of the store's most
 * recent invoices (a single past order is already covered by "Duplicate" in
 * the history list). Each suggestion carries the store's typical quantity
 * (median across recent orders) and the most recent unit price.
 */

import { subtotalOf } from './invoiceUtils';

const norm = (name) => (name || '').trim().toLowerCase();

/** Best-effort timestamp for sorting invoices newest-first. */
function invoiceTime(inv) {
  return Date.parse(inv.createdAt || inv.created_at || '') ||
         Date.parse(inv.date || '') || 0;
}

/** All invoices belonging to a store (case-insensitive match), newest first. */
export function invoicesForStore(invoices, storeName) {
  const target = norm(storeName);
  if (!target) return [];
  return (invoices || [])
    .filter(inv => norm(inv.storeName || inv.store_name) === target)
    .sort((a, b) => invoiceTime(b) - invoiceTime(a));
}

function median(nums) {
  const a = [...nums].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

/**
 * Builds reorder suggestions for a store.
 * @param {object[]} invoices  - full invoice list (any store)
 * @param {string}   storeName - store to analyse (exact name, case-insensitive)
 * @param {{recent?: number, max?: number}} [opts]
 * @returns {{name: string, qty: number, price: number, count: number}[]}
 */
export function buildOrderSuggestions(invoices, storeName, { recent = 6, max = 5 } = {}) {
  const recentInvoices = invoicesForStore(invoices, storeName).slice(0, recent);
  if (recentInvoices.length < 2) return [];

  // Aggregate per product across the recent window. recentInvoices is newest
  // first, so the first occurrence seen is also the most recent one.
  const byProduct = {};
  recentInvoices.forEach((inv, invIdx) => {
    (inv.items || []).forEach(item => {
      const key = norm(item.name);
      if (!key) return;
      if (!byProduct[key]) {
        byProduct[key] = { name: item.name.trim(), qtys: [], price: Number(item.price) || 0, lastIdx: invIdx, count: 0 };
      }
      const p = byProduct[key];
      p.count += 1;
      p.qtys.push(Number(item.qty) || 1);
    });
  });

  return Object.values(byProduct)
    .filter(p => p.count >= 2)
    .sort((a, b) => b.count - a.count || a.lastIdx - b.lastIdx)
    .slice(0, max)
    .map(p => ({
      name:  p.name,
      qty:   Math.max(1, Math.round(median(p.qtys))),
      price: p.price,
      count: p.count,
    }));
}

/**
 * Compares a draft invoice total against the store's historical average.
 * Returns null when there is no anomaly (or not enough history to judge).
 * @param {object[]} invoices  - full invoice list (any store)
 * @param {string}   storeName - store being invoiced
 * @param {number}   total     - draft invoice total
 * @returns {{ avg: number, ratio: number, direction: 'high'|'low', count: number } | null}
 */
export function checkInvoiceAnomaly(invoices, storeName, total) {
  if (!total || total <= 0) return null;
  const history = invoicesForStore(invoices, storeName);
  if (history.length < 3) return null;

  const totals = history.map(subtotalOf).filter(t => t > 0);
  if (totals.length < 3) return null;
  const avg = totals.reduce((s, t) => s + t, 0) / totals.length;
  if (avg <= 0) return null;

  const ratio = total / avg;
  if (ratio >= 2)      return { avg, ratio, direction: 'high', count: totals.length };
  if (ratio <= 1 / 3)  return { avg, ratio, direction: 'low',  count: totals.length };
  return null;
}
