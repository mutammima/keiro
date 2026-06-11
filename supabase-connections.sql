-- ════════════════════════════════════════════════════════════════════════════
-- Keiro Connections — invite-only driver ↔ store links
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → New query → paste this → Run.
-- Safe to re-run, and SELF-HEALING: it reconciles tables created by earlier
-- variants of this script (adds missing columns, replaces old policies).
--
-- MODEL: one side creates a connection as a PENDING invite carrying a random,
-- unguessable invite_code. The other side redeems that code via the
-- redeem_connection() RPC below, which stamps their user id onto the empty
-- side and flips the row to 'active'.
--
-- SECURITY: pending rows are NOT readable or writable through the table —
-- policies are participants-only. All redemption goes through the
-- SECURITY DEFINER function, which only ever matches an EXACT invite code,
-- so codes cannot be enumerated or hijacked.
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
