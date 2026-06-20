-- ════════════════════════════════════════════════════════════════════════════
-- supabase-receiving-confirmation.sql
--
-- Adds receiving-confirmation fields to connection_orders so a store owner can
-- confirm the quantity they actually received after a driver marks an order
-- delivered (and flag a discrepancy).
--
-- RUN THIS MANUALLY in the Supabase SQL editor. Idempotent + safe to re-run.
-- Existing RLS on connection_orders already lets participants update the row.
-- ════════════════════════════════════════════════════════════════════════════

alter table connection_orders
  add column if not exists received_confirmed boolean default false,
  add column if not exists received_quantity  integer,
  add column if not exists receiving_notes     text;
