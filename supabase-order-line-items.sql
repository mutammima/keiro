-- ════════════════════════════════════════════════════════════════════════════
-- Keiro Order Line Items — multi-item support for order requests.
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → New query → paste this → Run.
-- Safe to re-run (add column if not exists, guarded by to_regclass so a missing
-- table is skipped instead of erroring).
--
-- Adds a nullable `items` jsonb column to the three order-carrying tables so a
-- single request can hold multiple (name, qty, price) line items:
--   • connection_orders  — cross-account orders (store → connected driver)
--   • so_orders          — same-account store-owner orders
--   • so_bridge_requests — store → driver invoice-prefill bridge
--
-- Shape:  items = [ { "name": "Whole Milk", "qty": 10, "price": 3.5 }, … ]
--
-- Backward compatible: the existing product_name / quantity / price columns are
-- still written with the FIRST line as a summary, so old clients (and rows
-- created before this migration) keep rendering. New clients only write `items`
-- when a request has 2+ lines; single-line requests never touch this column, so
-- deploying the client before this migration cannot regress single-item orders.
-- ════════════════════════════════════════════════════════════════════════════

do $$
begin
  if to_regclass('public.connection_orders') is not null then
    alter table connection_orders  add column if not exists items jsonb;
  end if;
  if to_regclass('public.so_orders') is not null then
    alter table so_orders          add column if not exists items jsonb;
  end if;
  if to_regclass('public.so_bridge_requests') is not null then
    alter table so_bridge_requests add column if not exists items jsonb;
  end if;
end $$;

-- ── Verify (per project convention: anon REST probe) ─────────────────────────
-- After running, confirm the column is live with:
--   GET $URL/rest/v1/connection_orders?select=items&limit=1
--   GET $URL/rest/v1/so_orders?select=items&limit=1
--   GET $URL/rest/v1/so_bridge_requests?select=items&limit=1
-- 42703 = column still missing, 42P01 = table missing, [] or rows = OK.
