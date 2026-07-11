-- ============================================================================
-- KEIRO — CONSOLIDATED SUPABASE SCHEMA
-- ============================================================================
-- One file, run once. This supersedes the nine individual supabase-*.sql
-- migrations (and the scattered saved queries in the SQL Editor) — paste this
-- whole file into Supabase Dashboard -> SQL Editor -> New query -> Run.
--
-- SAFE TO RE-RUN. Every section is idempotent and self-healing:
--   * create table if not exists / add column if not exists
--   * drop policy if exists ... then create policy (also drops older policy names)
--   * create or replace function / drop trigger if exists
-- Re-running never drops data and never errors on an already-applied section.
--
-- PREREQUISITES (created by the initial app setup, NOT by this file):
--   * auth.users            — Supabase Auth (always present)
--   * invoices, invoice_items — the base invoicing tables (sections 05 & 08
--     ALTER these; if they are missing those two sections will error).
--
-- SECTIONS (dependency order):
--   01  User profiles
--   02  Connections (invite-only driver <-> store links) + redeem RPC
--   03  Connection requests (marketplace path)
--   04  Connection orders (cross-account orders)
--   05  Shared invoices (store reads its driver's invoice)
--   06  Receiving confirmation
--   07  Invoice signatures (cloud proof-of-delivery)
--   08  invoices.updated_at + change trigger
--   09  Order line items (multi-item requests)
--
-- VERIFY AFTER RUNNING (per project convention — anon REST probe):
--   GET $URL/rest/v1/<table>?select=<column>&limit=1
--   42P01 = table missing, 42703 = column missing, [] or rows = OK.
-- ============================================================================


-- ==========================================================================
-- 01. USER PROFILES
-- ==========================================================================
-- One row per user (id = auth uid): first/last name, role (driver |
-- store_owner), store & business name, plan. Owner-only RLS on
-- select/insert/update. Self-heals older tables by adding any missing
-- columns.
--
-- (was: supabase-profiles.sql)

create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  first_name    text not null,
  last_name     text not null,
  email         text,
  role          text not null check (role in ('driver', 'store_owner')),
  store_name    text,
  business_name text,
  plan          text not null default 'basic',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- Heal tables created by earlier variants that lacked these columns.
alter table public.profiles add column if not exists store_name    text;
alter table public.profiles add column if not exists business_name text;
alter table public.profiles add column if not exists plan          text not null default 'basic';
alter table public.profiles add column if not exists created_at    timestamptz default now();
alter table public.profiles add column if not exists updated_at    timestamptz default now();

alter table public.profiles enable row level security;

-- ── RLS: owner-only on every verb ─────────────────────────────────────────────
drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);


-- ==========================================================================
-- 02. CONNECTIONS — INVITE-ONLY DRIVER <-> STORE LINKS
-- ==========================================================================
-- The heart of the two-sided model. One side creates a PENDING row
-- carrying a random, unguessable invite_code; the other side redeems it
-- through the redeem_connection() SECURITY DEFINER RPC, which matches the
-- exact code, stamps the caller onto the empty side, and flips status to
-- 'active'. RLS is participants-only, so pending rows are invisible
-- through the table and codes cannot be enumerated or hijacked.
--
-- (was: supabase-connections.sql)

create table if not exists connections (
  id             text primary key,
  invite_code    text not null unique,
  inviter_role   text not null check (inviter_role in ('driver','store_owner')),
  inviter_name   text not null default '',
  redeemer_name  text not null default '',
  driver_user_id uuid references auth.users(id) on delete cascade,  -- null until a driver joins
  store_user_id  uuid references auth.users(id) on delete cascade,  -- null until a store joins
  status         text not null default 'pending' check (status in ('pending','active')),
  invited_by     uuid not null references auth.users(id) on delete cascade,
  created_at     timestamptz not null default now(),
  activated_at   timestamptz
);

-- Heal tables created by earlier variants that lacked these columns.
alter table connections add column if not exists activated_at  timestamptz;
alter table connections add column if not exists redeemer_name text not null default '';

alter table connections enable row level security;

-- ── RLS: participants only, on every verb ─────────────────────────────────────
-- Pending rows are deliberately invisible through the table; the invitee never
-- reads them directly — redemption happens inside redeem_connection() below.

drop policy if exists "connections: read own or pending" on connections;       -- earlier variant
drop policy if exists "connections: visible to participants" on connections;   -- earlier variant
drop policy if exists "connections: read own" on connections;
create policy "connections: read own"
  on connections for select to authenticated
  using (
    auth.uid() = invited_by
    or auth.uid() = driver_user_id
    or auth.uid() = store_user_id
  );

drop policy if exists "connections: inviter can insert" on connections;        -- earlier variant
drop policy if exists "connections: insert own" on connections;
create policy "connections: insert own"
  on connections for insert to authenticated
  with check (auth.uid() = invited_by);

drop policy if exists "connections: update own or redeem" on connections;      -- earlier variant
drop policy if exists "connections: participants can update" on connections;   -- earlier variant
drop policy if exists "connections: update own" on connections;
create policy "connections: update own"
  on connections for update to authenticated
  using (
    auth.uid() = invited_by
    or auth.uid() = driver_user_id
    or auth.uid() = store_user_id
  );

drop policy if exists "connections: inviter can delete" on connections;        -- earlier variant
drop policy if exists "connections: delete own" on connections;
create policy "connections: delete own"
  on connections for delete to authenticated
  using (auth.uid() = invited_by);

-- ── Redemption RPC ────────────────────────────────────────────────────────────
-- SECURITY DEFINER so it can see the pending row the caller cannot. Matches
-- only an EXACT code, validates, stamps the caller onto the empty side, and
-- returns the now-active row. Authenticated callers only.
create or replace function redeem_connection(p_code text, p_name text default '')
returns connections
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conn connections;
  v_uid  uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select * into v_conn from connections where invite_code = upper(trim(p_code));
  if not found then
    raise exception 'invite not found';
  end if;
  if v_conn.invited_by = v_uid then
    raise exception 'cannot redeem your own invite';
  end if;

  if v_conn.status = 'active' then
    -- no-op success for a party already on the connection
    if v_uid = v_conn.driver_user_id or v_uid = v_conn.store_user_id then
      return v_conn;
    end if;
    raise exception 'invite already used';
  end if;

  if v_conn.inviter_role = 'driver' then
    update connections
       set store_user_id = v_uid, status = 'active', activated_at = now(),
           redeemer_name = coalesce(nullif(trim(p_name), ''), redeemer_name)
     where id = v_conn.id and status = 'pending'
     returning * into v_conn;
  else
    update connections
       set driver_user_id = v_uid, status = 'active', activated_at = now(),
           redeemer_name = coalesce(nullif(trim(p_name), ''), redeemer_name)
     where id = v_conn.id and status = 'pending'
     returning * into v_conn;
  end if;

  if not found then
    raise exception 'invite already used';
  end if;
  return v_conn;
end;
$$;

revoke all on function redeem_connection(text, text) from public;
revoke all on function redeem_connection(text, text) from anon;
grant execute on function redeem_connection(text, text) to authenticated;

-- ── Indexes (names match those an earlier variant may have already created) ──
create index if not exists idx_connections_invite_code    on connections(invite_code);
create index if not exists idx_connections_invited_by     on connections(invited_by);
create index if not exists idx_connections_driver_user_id on connections(driver_user_id);
create index if not exists idx_connections_store_user_id  on connections(store_user_id);


-- ==========================================================================
-- 03. CONNECTION REQUESTS — MARKETPLACE PATH
-- ==========================================================================
-- Widens the connections.status CHECK to also allow 'declined', so a
-- marketplace match can insert a both-sides-filled pending row that the
-- recipient accepts (-> active) or turns down (-> declined). Reuses the
-- participants-only policies from section 02; no new policies. Drops
-- whatever the current status constraint is named first, so it is re-
-- runnable.
--
-- (was: supabase-connection-requests.sql)

do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
     where conrelid = 'public.connections'::regclass
       and contype  = 'c'
       and pg_get_constraintdef(oid) like '%status%'
  loop
    execute format('alter table connections drop constraint %I', r.conname);
  end loop;
end $$;

alter table connections
  add constraint connections_status_check
  check (status in ('pending','active','declined'));


-- ==========================================================================
-- 04. CONNECTION ORDERS — CROSS-ACCOUNT ORDERS
-- ==========================================================================
-- Orders that travel store -> driver over an ACTIVE connection and
-- surface in the driver's Route tab. INSERT is gated on a live connection
-- that actually links the two accounts, so orders cannot be forged at
-- arbitrary drivers. Status flows pending -> accepted -> delivered,
-- carrying invoice_number back to the store. Requires section 02.
--
-- (was: supabase-connection-orders.sql)

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


-- ==========================================================================
-- 05. SHARED INVOICES — STORE READS ITS DRIVER'S INVOICE
-- ==========================================================================
-- Adds store_user_id to the base invoices table; the addressed store
-- account then reads that invoice header and its line items READ-ONLY in
-- its Invoices tab. Writes stay owner-only. Backfills invoices already
-- generated from connection orders. PREREQUISITE: the base `invoices` and
-- `invoice_items` tables must already exist (initial app setup). Requires
-- sections 02 and 04.
--
-- (was: supabase-shared-invoices.sql)

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


-- ==========================================================================
-- 06. RECEIVING CONFIRMATION
-- ==========================================================================
-- Adds received_confirmed / received_quantity / receiving_notes to
-- connection_orders so a store owner can confirm the quantity actually
-- received after a driver marks an order delivered, and flag a
-- discrepancy. Existing participant RLS already permits the update.
-- Requires section 04.
--
-- (was: supabase-receiving-confirmation.sql)

alter table connection_orders
  add column if not exists received_confirmed boolean default false,
  add column if not exists received_quantity  integer,
  add column if not exists receiving_notes     text;


-- ==========================================================================
-- 07. INVOICE SIGNATURES — CLOUD PROOF-OF-DELIVERY
-- ==========================================================================
-- One row per (user, invoice) holding seller/buyer signature PNG data
-- URLs (nullable, so an invoice can carry just one). Owner-only RLS on
-- every verb. Previously localStorage-only, so signatures never reached
-- the cloud or other devices; this table backs them up and syncs them.
--
-- (was: supabase-signatures.sql)

create table if not exists invoice_signatures (
  user_id        uuid not null references auth.users(id) on delete cascade,
  invoice_number int  not null,
  seller         text,
  buyer          text,
  updated_at     timestamptz not null default now(),
  primary key (user_id, invoice_number)
);

alter table invoice_signatures enable row level security;

-- ── RLS: owner-only for every operation ──────────────────────────────────────
drop policy if exists "invoice_signatures: select own" on invoice_signatures;
create policy "invoice_signatures: select own"
  on invoice_signatures for select
  using (auth.uid() = user_id);

drop policy if exists "invoice_signatures: insert own" on invoice_signatures;
create policy "invoice_signatures: insert own"
  on invoice_signatures for insert
  with check (auth.uid() = user_id);

drop policy if exists "invoice_signatures: update own" on invoice_signatures;
create policy "invoice_signatures: update own"
  on invoice_signatures for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "invoice_signatures: delete own" on invoice_signatures;
create policy "invoice_signatures: delete own"
  on invoice_signatures for delete
  using (auth.uid() = user_id);


-- ==========================================================================
-- 08. INVOICES.UPDATED_AT + CHANGE TRIGGER
-- ==========================================================================
-- Adds updated_at plus a BEFORE UPDATE trigger that stamps it on every
-- row change, so the store side can badge a payment-status change on a
-- shared invoice. The client only READS the column (the trigger owns
-- writes), so payment updates work with or without this migration; the
-- badge simply stays dormant until it is run. PREREQUISITE: base
-- `invoices` table.
--
-- (was: supabase-invoice-updated-at.sql)

alter table invoices add column if not exists updated_at timestamptz;

-- Backfill existing rows once (idempotent: only touches NULLs).
update invoices set updated_at = created_at where updated_at is null;

-- New inserts get a timestamp without the client having to send one.
alter table invoices alter column updated_at set default now();

-- Stamp updated_at on every row change (payment status, edits, re-saves).
create or replace function set_invoices_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_invoices_updated_at on invoices;
create trigger trg_invoices_updated_at
  before update on invoices
  for each row execute function set_invoices_updated_at();


-- ==========================================================================
-- 09. ORDER LINE ITEMS — MULTI-ITEM REQUESTS
-- ==========================================================================
-- Adds a nullable items jsonb to the three order-carrying tables
-- (connection_orders, so_orders, so_bridge_requests) so a single request
-- can hold multiple {name, qty, price} lines. Guarded by to_regclass, so
-- a table that does not exist is skipped rather than erroring. Backward
-- compatible: single-line orders never touch this column, so old clients
-- and pre-migration rows keep working.
--
-- (was: supabase-order-line-items.sql)

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
