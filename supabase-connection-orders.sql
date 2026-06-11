-- ════════════════════════════════════════════════════════════════════════════
-- Keiro Connection Orders — orders that travel ACROSS accounts over an
-- established driver ↔ store connection.
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → New query → paste this → Run.
-- Safe to re-run (if not exists / drop policy if exists).
--
-- A connected store places an order; it appears in the connected driver's
-- Route tab. The driver accepts, fills it into an invoice, and on generate the
-- order flips to 'delivered' carrying the invoice_number back to the store.
--
-- Requires the `connections` table (supabase-connections.sql).
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists connection_orders (
  id             text primary key,
  connection_id  text not null references connections(id) on delete cascade,
  store_user_id  uuid not null references auth.users(id) on delete cascade,
  driver_user_id uuid not null references auth.users(id) on delete cascade,
  store_name     text not null default '',   -- denormalised display names so each
  driver_name    text not null default '',   -- side renders without a join
  product_name   text not null,
  quantity       numeric not null default 1,
  price          numeric not null default 0, -- unit price; 0 = driver sets it
  delivery_date  date,
  notes          text not null default '',
  status         text not null default 'pending'
                 check (status in ('pending','accepted','delivered','cancelled')),
  invoice_number bigint,                     -- stamped when the driver generates
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table connection_orders enable row level security;

-- ── RLS: both parties read their shared orders ───────────────────────────────
drop policy if exists "conn_orders: read participants" on connection_orders;
create policy "conn_orders: read participants"
  on connection_orders for select to authenticated
  using (auth.uid() = store_user_id or auth.uid() = driver_user_id);

-- ── RLS: only the store inserts, and only over a LIVE connection that really
--        links them to the targeted driver — orders cannot be forged at
--        arbitrary drivers. ───────────────────────────────────────────────────
drop policy if exists "conn_orders: store inserts over live connection" on connection_orders;
create policy "conn_orders: store inserts over live connection"
  on connection_orders for insert to authenticated
  with check (
    auth.uid() = store_user_id
    and exists (
      select 1 from connections c
       where c.id = connection_orders.connection_id
         and c.status = 'active'
         and c.store_user_id  = auth.uid()
         and c.driver_user_id = connection_orders.driver_user_id
    )
  );

-- ── RLS: either party updates (driver accepts/delivers, store cancels) ───────
drop policy if exists "conn_orders: participants update" on connection_orders;
create policy "conn_orders: participants update"
  on connection_orders for update to authenticated
  using (auth.uid() = store_user_id or auth.uid() = driver_user_id);

-- ── RLS: only the store removes its own order ────────────────────────────────
drop policy if exists "conn_orders: store deletes" on connection_orders;
create policy "conn_orders: store deletes"
  on connection_orders for delete to authenticated
  using (auth.uid() = store_user_id);

-- ── Indexes ──────────────────────────────────────────────────────────────────
create index if not exists idx_conn_orders_store  on connection_orders(store_user_id);
create index if not exists idx_conn_orders_driver on connection_orders(driver_user_id);
create index if not exists idx_conn_orders_status on connection_orders(status);
