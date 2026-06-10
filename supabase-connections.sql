-- ════════════════════════════════════════════════════════════════════════════
-- Keiro Connections — invite-only driver ↔ store links
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → New query → paste this → Run.
-- Safe to re-run (everything is `if not exists` / `drop policy if exists`).
--
-- MODEL: one side creates a connection as a PENDING invite carrying a random,
-- unguessable invite_code. The other side "redeems" that code (via a shared
-- link or by typing it), which stamps their user id onto the empty side and
-- flips the row to 'active'. This is the same trust model as an unguessable
-- share link: whoever holds the code may complete the connection.
--
-- inviter_role tells us which side is already filled:
--   'driver'      → driver_user_id is set, store_user_id is filled on redeem
--   'store_owner' → store_user_id  is set, driver_user_id is filled on redeem
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists connections (
  id             text primary key,
  invite_code    text not null unique,
  inviter_role   text not null check (inviter_role in ('driver','store_owner')),
  inviter_name   text not null default '',
  driver_user_id uuid references auth.users(id) on delete cascade,  -- null until a driver joins
  store_user_id  uuid references auth.users(id) on delete cascade,  -- null until a store joins
  status         text not null default 'pending' check (status in ('pending','active')),
  invited_by     uuid not null references auth.users(id) on delete cascade,
  created_at     timestamptz not null default now(),
  activated_at   timestamptz
);

alter table connections enable row level security;

-- ── RLS: read your own connections, OR resolve a still-pending invite by code ──
-- The pending-row read is what lets an invitee look up a code before they are
-- linked. Codes are random, so this is the unguessable-link model.
drop policy if exists "connections: read own or pending" on connections;
create policy "connections: read own or pending"
  on connections for select
  using (
    auth.uid() = invited_by
    or auth.uid() = driver_user_id
    or auth.uid() = store_user_id
    or status = 'pending'
  );

-- ── RLS: create an invite only where you stamp yourself as the inviter ────────
drop policy if exists "connections: insert own" on connections;
create policy "connections: insert own"
  on connections for insert
  with check (auth.uid() = invited_by);

-- ── RLS: the inviter manages their invite; an invitee redeems a pending one ───
-- A non-owner may update a row only while it is still 'pending' (redemption).
drop policy if exists "connections: update own or redeem" on connections;
create policy "connections: update own or redeem"
  on connections for update
  using (
    auth.uid() = invited_by
    or auth.uid() = driver_user_id
    or auth.uid() = store_user_id
    or status = 'pending'
  );

-- ── RLS: only the inviter can delete (cancel) their invite ────────────────────
drop policy if exists "connections: delete own" on connections;
create policy "connections: delete own"
  on connections for delete
  using (auth.uid() = invited_by);

-- ── Indexes ──────────────────────────────────────────────────────────────────
create index if not exists idx_connections_code    on connections(invite_code);
create index if not exists idx_connections_driver  on connections(driver_user_id);
create index if not exists idx_connections_store   on connections(store_user_id);
create index if not exists idx_connections_inviter on connections(invited_by);
