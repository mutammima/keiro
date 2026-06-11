-- ════════════════════════════════════════════════════════════════════════════
-- Keiro Shared Invoices — a driver's invoice, visible to the connected store
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → New query → paste this → Run.
-- Safe to re-run (if not exists / drop policy if exists).
--
-- The driver stamps store_user_id on an invoice when it was generated from a
-- connection order, or when the typed store name matches an active connection.
-- The store account then reads that invoice (and its line items) READ-ONLY in
-- its Invoices tab. Writes stay owner-only — no policy change on
-- INSERT/UPDATE/DELETE.
--
-- Requires: supabase-connections.sql, supabase-connection-orders.sql.
-- ════════════════════════════════════════════════════════════════════════════

alter table invoices add column if not exists store_user_id uuid references auth.users(id) on delete set null;
create index if not exists idx_invoices_store_user on invoices(store_user_id);

-- ── RLS: the addressed store may READ the invoice header ─────────────────────
drop policy if exists "invoices: connected store reads" on invoices;
create policy "invoices: connected store reads"
  on invoices for select to authenticated
  using (auth.uid() = store_user_id);

-- ── RLS: …and its line items (via the parent header) ─────────────────────────
drop policy if exists "invoice_items: connected store reads" on invoice_items;
create policy "invoice_items: connected store reads"
  on invoice_items for select to authenticated
  using (
    exists (
      select 1 from invoices i
       where i.id = invoice_items.invoice_id
         and i.store_user_id = auth.uid()
    )
  );

-- ── Backfill: invoices already generated from connection orders ──────────────
update invoices i
   set store_user_id = co.store_user_id
  from connection_orders co
 where co.invoice_number is not null
   and co.driver_user_id  = i.user_id
   and co.invoice_number  = i.invoice_number
   and i.store_user_id is null;
