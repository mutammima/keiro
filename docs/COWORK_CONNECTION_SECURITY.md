# Cowork: close three connection-security holes in Keiro's Supabase

Self-contained instructions for a cowork session. The SQL changes **rules only, no data**: one
replaced INSERT rule on `connections` and three new "guard" triggers. Nothing the Keiro app does
today is refused; only misuse is (see "What it changes" at the end).

There is **no app update** to wait for. It can be run any time, before or after the PR that adds
this file is merged.

**Project:** Keiro, Supabase project ref `dcfplaqknngtnixvsiju` (not "NxM + DuoNotes").
If its URL doesn't resolve, the free project is paused; open the dashboard and click Restore first.

## 1. Check the live tables first (read-only)

SQL Editor → New query → paste → Run:

```sql
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and (table_name, column_name) in (
    ('connections', 'status'), ('connections', 'activated_at'), ('connections', 'invited_by'),
    ('connections', 'inviter_role'), ('connections', 'driver_user_id'), ('connections', 'store_user_id'),
    ('connection_orders', 'status'), ('connection_orders', 'driver_user_id'),
    ('connection_orders', 'store_user_id'), ('connection_orders', 'invoice_number'),
    ('connection_orders', 'received_confirmed'), ('connection_orders', 'received_quantity'),
    ('connection_orders', 'receiving_notes'), ('connection_orders', 'updated_at'),
    ('marketplace_demand', 'user_id'), ('marketplace_demand', 'status'),
    ('marketplace_demand', 'claimed_by'), ('marketplace_demand', 'claimed_name'),
    ('marketplace_demand', 'updated_at'))
order by 1, 2;
```

Expected: **19 rows**. If fewer, **stop** and report which are missing; don't run step 2.

Then, also read-only, the triggers already on these tables:

```sql
select event_object_table as table_name, trigger_name, action_timing, event_manipulation
from information_schema.triggers
where event_object_schema = 'public'
  and event_object_table in ('connections', 'connection_orders', 'marketplace_demand')
order by 1, 2;
```

Copy the result for the report (expected: `trg_connection_orders_updated_at` and maybe realtime
ones; none named `*_guard` yet).

## 2. Run the SQL

1. SQL Editor → New query.
2. Paste the whole block below (it's `supabase-connection-security.sql` from the repo root) → Run.
3. Expected: "Success. No rows returned".

Paste it exactly. If the dashboard's assistant offers to rewrite or "simplify" it, decline. If the
editor rejects several statements at once, run it in pieces, in order: the `drop policy` + `create
policy`; then each `create or replace function … $$;` together with the `drop trigger` / `create
trigger` lines under it; then the three `revoke` lines.

```sql
-- ============================================================================
-- KEIRO — CONNECTION SECURITY (2026-11-07)
-- ============================================================================
-- Closes three holes found in the live policies on 2026-11-07:
--   1. connections — the sender of a request could accept it themselves, or
--      insert a connection that was already active. Driver ids are visible on
--      marketplace posts, so anyone could connect to any driver and then send
--      them orders (the order INSERT policy trusts status = 'active').
--   2. marketplace_demand — the "claim" policy let the claimer rewrite every
--      column of an open request, including who owns it.
--   3. connection_orders — either side could rewrite the whole order: a driver
--      could change what the store ordered, a store could hand it to a
--      different driver or stamp the driver's invoice number.
--
-- How: one tightened INSERT policy plus three BEFORE UPDATE guard triggers.
-- A policy decides WHICH ROWS a user may update but not WHICH COLUMNS, so the
-- column rules live in the triggers. The guards only apply to the app's own
-- database roles (anon, authenticated); the dashboard and SECURITY DEFINER
-- functions such as redeem_connection() run as the table owner and are never
-- blocked. Everything the app itself writes (src/services/db.js) still passes:
-- see src/__tests__/connectionSecuritySql.test.js, which runs this file.
--
-- A refused change raises 42501 (insufficient privilege) with a plain message.
-- SAFE TO RE-RUN: create or replace / drop … if exists throughout.
-- Apply with docs/COWORK_CONNECTION_SECURITY.md.
-- ============================================================================

-- ── 1. connections ──────────────────────────────────────────────────────────

-- A new connection is always a pending request, sent by the caller, with the
-- caller on their own side. (The other side is empty for an invite code, or
-- the chosen account for a marketplace request.)
drop policy if exists "connections: insert own" on connections;
create policy "connections: insert own"
  on connections for insert to authenticated
  with check (
    auth.uid() = invited_by
    and status = 'pending'
    and activated_at is null
    and (   (inviter_role = 'driver'      and driver_user_id = auth.uid())
         or (inviter_role = 'store_owner' and store_user_id  = auth.uid()))
  );

-- Through the table, a connection can only be answered: once, from pending to
-- active or declined, by the person who received it. Nothing else on the row
-- changes. (Redeeming an invite code goes through redeem_connection().)
create or replace function connections_guard_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user not in ('anon', 'authenticated') or new is not distinct from old then
    return new;
  end if;
  if auth.uid() = old.invited_by then
    raise exception 'Only the person who received a connection request can answer it'
      using errcode = '42501';
  end if;
  if old.status <> 'pending' or new.status not in ('active', 'declined') then
    raise exception 'This connection request has already been answered'
      using errcode = '42501';
  end if;
  if (to_jsonb(new) - array['status', 'activated_at'])
     is distinct from (to_jsonb(old) - array['status', 'activated_at']) then
    raise exception 'Answering a connection request can''t change anything else on it'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_connections_guard on connections;
create trigger trg_connections_guard
  before update on connections
  for each row execute function connections_guard_update();

-- ── 2. connection_orders ────────────────────────────────────────────────────

-- What was ordered, and between whom, is fixed once the store sends it. Either
-- side moves the status; only the driver stamps the invoice number; only the
-- store records what it received.
create or replace function connection_orders_guard_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_uid     uuid   := auth.uid();
  v_allowed text[] := array['status', 'updated_at'];
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if v_uid = old.driver_user_id then
    v_allowed := v_allowed || array['invoice_number'];
  end if;
  if v_uid = old.store_user_id then
    v_allowed := v_allowed || array['received_confirmed', 'received_quantity', 'receiving_notes'];
  end if;
  if (to_jsonb(new) - v_allowed) is distinct from (to_jsonb(old) - v_allowed) then
    raise exception 'A sent order can''t be changed: only its status, the driver''s invoice number and the store''s receiving check'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_connection_orders_guard on connection_orders;
create trigger trg_connection_orders_guard
  before update on connection_orders
  for each row execute function connection_orders_guard_update();

-- ── 3. marketplace_demand ───────────────────────────────────────────────────

-- The store edits its own request freely. Anyone else can only claim an open
-- one, for themselves: status open → claimed, claimed_by = them, their name.
create or replace function marketplace_demand_guard_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_claim text[] := array['status', 'claimed_by', 'claimed_name', 'updated_at'];
begin
  if current_user not in ('anon', 'authenticated') or auth.uid() = old.user_id then
    return new;
  end if;
  if old.status <> 'open'
     or new.status <> 'claimed'
     or new.claimed_by is distinct from auth.uid()
     or (to_jsonb(new) - v_claim) is distinct from (to_jsonb(old) - v_claim) then
    raise exception 'Someone else''s request can only be claimed, not changed'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_marketplace_demand_guard on marketplace_demand;
create trigger trg_marketplace_demand_guard
  before update on marketplace_demand
  for each row execute function marketplace_demand_guard_update();

-- Trigger functions aren't for calling directly.
revoke execute on function connections_guard_update()        from public, anon, authenticated;
revoke execute on function connection_orders_guard_update()  from public, anon, authenticated;
revoke execute on function marketplace_demand_guard_update() from public, anon, authenticated;
```

## 3. Check it (read-only)

New query → paste → Run:

```sql
select tgrelid::regclass::text as table_name, tgname, tgenabled
from pg_trigger
where tgname in ('trg_connections_guard', 'trg_connection_orders_guard', 'trg_marketplace_demand_guard')
order by 1;
```

Expected, exactly 3 rows, each with `tgenabled` = `O`:
`connection_orders | trg_connection_orders_guard`, `connections | trg_connections_guard`,
`marketplace_demand | trg_marketplace_demand_guard`.

```sql
select policyname, roles, with_check
from pg_policies
where schemaname = 'public' and tablename = 'connections' and cmd = 'INSERT';
```

Expected, exactly 1 row: `connections: insert own`, roles `{authenticated}`, and a `with_check` that
mentions `status = 'pending'` and `inviter_role`.

Don't test the triggers by updating rows in the SQL editor: the editor runs as the owner, which
the guards deliberately let through, so it proves nothing.

## 4. Report back

Paste the two step 1 results, the step 2 result, and the two step 3 results, unedited.

## What it changes

- **Connections:** a new connection must be a *pending* request with the sender on their own
  side. Only the person who **received** a request can answer it (accept or decline), only once,
  and answering can't change anything else on the row. Invite codes still work: redeeming goes
  through `redeem_connection()`, which the guard lets through.
- **Orders:** what was ordered, and between whom, is fixed once sent. Either side can move the
  status; only the driver stamps the invoice number; only the store records what it received.
- **Marketplace requests:** the store edits its own request freely; anyone else can only claim an
  open one, for themselves.
