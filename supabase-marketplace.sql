-- ════════════════════════════════════════════════════════════════════════════
-- InvoGo Marketplace — shared, cross-user tables
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → New query → paste this → Run.
-- Safe to re-run (everything is `if not exists` / `drop policy if exists`).
--
-- WHY THESE ARE DIFFERENT: every other table in this app is private — RLS scopes
-- each row to its owner. The marketplace is the opposite: a driver must be able
-- to READ open store orders from OTHER users, and a store must be able to READ
-- driver listings from OTHER users. So SELECT is open to any signed-in user,
-- while INSERT / UPDATE / DELETE stay owner-only.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Driver supply: what each driver carries, and at what price ───────────────
create table if not exists marketplace_listings (
  id           text primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  driver_name  text not null default '',
  driver_phone text not null default '',
  product_name text not null default '',
  price        numeric(10,2) not null default 0,
  unit         text not null default 'each',
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ── Store demand: open orders any driver can browse and accept ───────────────
create table if not exists marketplace_demand (
  id            text primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  store_name    text not null default '',
  store_phone   text not null default '',
  product_name  text not null default '',
  quantity      int  not null default 1,
  target_price  numeric(10,2) not null default 0,
  needed_by     text not null default '',
  notes         text not null default '',
  status        text not null default 'open',   -- open | claimed | fulfilled | cancelled
  claimed_by    uuid,                            -- driver user_id who accepted
  claimed_name  text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table marketplace_listings enable row level security;
alter table marketplace_demand   enable row level security;

-- ── RLS: anyone signed in can READ the whole marketplace ─────────────────────
drop policy if exists "marketplace_listings: read all" on marketplace_listings;
create policy "marketplace_listings: read all"
  on marketplace_listings for select
  using (auth.role() = 'authenticated');

drop policy if exists "marketplace_demand: read all" on marketplace_demand;
create policy "marketplace_demand: read all"
  on marketplace_demand for select
  using (auth.role() = 'authenticated');

-- ── RLS: you can only write YOUR OWN listings ────────────────────────────────
drop policy if exists "marketplace_listings: insert own" on marketplace_listings;
create policy "marketplace_listings: insert own"
  on marketplace_listings for insert
  with check (auth.uid() = user_id);

drop policy if exists "marketplace_listings: update own" on marketplace_listings;
create policy "marketplace_listings: update own"
  on marketplace_listings for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "marketplace_listings: delete own" on marketplace_listings;
create policy "marketplace_listings: delete own"
  on marketplace_listings for delete
  using (auth.uid() = user_id);

-- ── RLS: store owners write their own demand ─────────────────────────────────
drop policy if exists "marketplace_demand: insert own" on marketplace_demand;
create policy "marketplace_demand: insert own"
  on marketplace_demand for insert
  with check (auth.uid() = user_id);

drop policy if exists "marketplace_demand: update own" on marketplace_demand;
create policy "marketplace_demand: update own"
  on marketplace_demand for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "marketplace_demand: delete own" on marketplace_demand;
create policy "marketplace_demand: delete own"
  on marketplace_demand for delete
  using (auth.uid() = user_id);

-- ── RLS: a driver can CLAIM an open demand row (cross-user update) ───────────
-- Permissive policy OR'd with the owner policy above. A non-owner may update a
-- row only while it is still 'open', and only if they stamp themselves as the
-- claimer — they cannot silently take over someone else's claim.
drop policy if exists "marketplace_demand: driver claims open" on marketplace_demand;
create policy "marketplace_demand: driver claims open"
  on marketplace_demand for update
  using (auth.role() = 'authenticated' and status = 'open')
  with check (claimed_by = auth.uid());

-- ── Indexes ──────────────────────────────────────────────────────────────────
create index if not exists idx_mkt_listings_product on marketplace_listings(product_name);
create index if not exists idx_mkt_listings_user    on marketplace_listings(user_id);
create index if not exists idx_mkt_demand_product   on marketplace_demand(product_name, status);
create index if not exists idx_mkt_demand_user      on marketplace_demand(user_id);
