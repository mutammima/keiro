/**
 * invoicePaging.test.js
 *
 * PostgREST returns at most max-rows (1000 on Supabase) per request and says
 * nothing about the rest. Reads covering a whole account's invoices (the list,
 * its changes, the number index) page through by invoice number, so an account
 * past 1000 invoices neither loses rows nor, because its index looked short,
 * falls back to a full download on every load.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const SERVER_MAX_ROWS = 1000;
let rows;
let requests;

// A tiny stand-in for the supabase-js query builder over `rows`.
function query() {
  const filters = [];
  let ascending = true;
  const q = {
    select: () => q,
    eq: (col, v) => { filters.push(r => r[col] === v); return q; },
    gte: (col, v) => { filters.push(r => r[col] >= v); return q; },
    gt: (col, v) => { filters.push(r => r[col] > v); return q; },
    order: (col, opts) => { ascending = opts?.ascending !== false; return q; },
    limit: n => {
      requests++;
      const matched = rows.filter(r => filters.every(f => f(r)))
        .sort((a, b) => (ascending ? a.invoice_number - b.invoice_number : b.invoice_number - a.invoice_number));
      return Promise.resolve({ data: matched.slice(0, Math.min(n, SERVER_MAX_ROWS)), error: null });
    },
  };
  return q;
}

vi.mock('../services/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'user-a' } } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe() {} } } })),
    },
    from: vi.fn(() => query()),
  },
}));

let db;

beforeEach(async () => {
  vi.resetModules();
  requests = 0;
  rows = Array.from({ length: 1200 }, (_, i) => ({
    user_id: 'user-a',
    invoice_number: 1001 + i,
    created_at: new Date(Date.UTC(2026, 0, 1) + i * 3600_000).toISOString(),
    updated_at: new Date(Date.UTC(2026, 0, 1) + i * 3600_000).toISOString(),
    invoice_items: [],
  }));
  db = await import('../services/db');
});

describe('whole-account invoice reads past the server\'s row cap', () => {
  it('the invoice list returns every invoice, newest first', async () => {
    const { data, error } = await db.getInvoices();

    expect(error).toBeNull();
    expect(data).toHaveLength(1200);
    expect(data[0].number).toBe(2200);
    expect(data[1199].number).toBe(1001);
  });

  it('the number index returns every number, so the incremental refresh doesn\'t fall back every time', async () => {
    const { data } = await db.getInvoiceNumberIndex();

    expect(new Set(data.map(r => r.invoice_number)).size).toBe(1200);
    expect(requests).toBe(3); // 500 + 500 + 200
  });

  it('the changed-since read pages too', async () => {
    const { data } = await db.getInvoicesChangedSince(rows[100].updated_at);

    expect(data).toHaveLength(1100);
  });
});
