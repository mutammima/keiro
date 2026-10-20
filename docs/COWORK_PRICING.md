# Cowork: turn on Keiro's free plan and Pro in Supabase

Self-contained instructions for a cowork session. It adds two tables, eight functions and three triggers, and changes no existing rows except one new Pro record (the owner's dad, step 2). The SQL is safe to re-run.

**Project:** Keiro, Supabase project ref `dcfplaqknngtnixvsiju`.
If its URL doesn't resolve, the free project is paused; open the dashboard and click Restore first.

**Order matters:** run this before the app update that turns the limits on. If the update goes out first, the dad's account falls to Free and is moved to Easy Mode.

## 1. Run the SQL

1. Supabase Dashboard → project `dcfplaqknngtnixvsiju` → SQL Editor → New query.
2. Paste the whole of the SQL below → Run.
3. Expected: "Success. No rows returned".

If the editor rejects multiple statements, run the statements one at a time, in order (a function ends at its `$$;`).

```sql
-- Pricing: who is Pro.
create table if not exists subscriptions (
  user_id                uuid primary key references auth.users(id) on delete cascade,
  source                 text not null check (source in ('stripe', 'manual')),
  status                 text not null default 'active',
  pro_until              timestamptz,                      -- null with source 'manual' = free forever
  interval               text check (interval in ('month', 'year')),
  cancels                boolean not null default false,   -- cancelled: ends at pro_until
  stripe_customer_id     text unique,
  stripe_subscription_id text unique,
  updated_at             timestamptz not null default now()
);
alter table subscriptions add column if not exists cancels boolean not null default false;

create table if not exists invoice_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  month   date not null,                                   -- first day of the UTC month
  count   integer not null default 0,
  primary key (user_id, month)
);

alter table subscriptions enable row level security;
alter table invoice_usage enable row level security;

drop policy if exists "subscriptions: read own" on subscriptions;
create policy "subscriptions: read own" on subscriptions
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "invoice_usage: read own" on invoice_usage;
create policy "invoice_usage: read own" on invoice_usage
  for select to authenticated using (user_id = auth.uid());

-- Supabase's default privileges open new tables to anon and authenticated, with every
-- privilege (TRUNCATE, REFERENCES and TRIGGER too). Close all of it, then give back reading
-- only: the policies above limit that to each user's own rows.
revoke all on subscriptions from anon, authenticated;
revoke all on invoice_usage from anon, authenticated;
grant select on subscriptions to authenticated;
grant select on invoice_usage to authenticated;

-- The rules the functions below share, each written once.

-- The most new invoices a free account can upload in a UTC month. The app stops at 20; the
-- spare 5 absorb offline invoices that upload after the 1st, the UTC-vs-local month edge and
-- two phones used at once.
create or replace function free_cap()
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$
  select 25;
$$;

-- The UTC month (as its first day) a moment falls in: how invoices are counted and checked.
create or replace function utc_month(p_at timestamptz)
returns date
language sql
immutable
set search_path = public, pg_temp
as $$
  select (date_trunc('month', p_at at time zone 'utc'))::date;
$$;

-- The refusal. The app recognises the message KEIRO_FREE_LIMIT; the hint is for people.
create or replace function refuse_free_limit()
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'KEIRO_FREE_LIMIT'
    using errcode = 'P0001', hint = 'Free plan: 20 new invoices a month.';
end
$$;

create or replace function is_pro(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from subscriptions s
    where s.user_id = p_uid
      and (   (s.source = 'manual' and (s.pro_until is null or s.pro_until > now()))
           or (s.source = 'stripe' and s.status in ('active', 'past_due') and s.pro_until > now())));
$$;

create or replace function invoices_free_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_month date := utc_month(now());
  v_used  integer;
begin
  -- This row-level check stays although the statement-level one below also covers a single
  -- row: it refuses before the row is stored or counted.
  -- Only invoices made this month can be refused: history uploads never are.
  if new.created_at is null or utc_month(new.created_at) <> v_month then
    return new;
  end if;
  -- An upsert of an invoice that already exists is an edit: never refused.
  -- (Postgres runs BEFORE INSERT triggers on insert … on conflict do update.)
  if exists (select 1 from invoices i
             where i.user_id = new.user_id and i.invoice_number = new.invoice_number) then
    return new;
  end if;
  if is_pro(new.user_id) then
    return new;
  end if;
  select u.count into v_used from invoice_usage u
   where u.user_id = new.user_id and u.month = v_month;
  if coalesce(v_used, 0) >= free_cap() then
    perform refuse_free_limit();
  end if;
  return new;
end
$$;

create or replace function invoices_count_usage()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_month date := utc_month(now());
begin
  if new.created_at is not null and utc_month(new.created_at) = v_month then
    insert into invoice_usage as u (user_id, month, count) values (new.user_id, v_month, 1)
    on conflict (user_id, month) do update set count = u.count + 1;
  end if;
  return null;
end
$$;

-- One request can insert many invoices at once, and invoices_free_limit() only sees the
-- count from before the request. The row-level AFTER triggers (the counting) fire first,
-- then this statement-level one checks the total: a free account past 25 this month is
-- refused and the whole request is rolled back.
create or replace function invoices_free_limit_batch()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_month date := utc_month(now());
begin
  if exists (
    select 1
    from (select distinct r.user_id from new_rows r
           where r.created_at is not null
             and utc_month(r.created_at) = v_month) n
    join invoice_usage u on u.user_id = n.user_id and u.month = v_month
    where u.count > free_cap() and not is_pro(n.user_id)) then
    perform refuse_free_limit();
  end if;
  return null;
end
$$;

drop trigger if exists trg_invoices_free_limit on invoices;
create trigger trg_invoices_free_limit
  before insert on invoices
  for each row execute function invoices_free_limit();

-- AFTER INSERT fires only for rows actually inserted, so an edit never counts.
drop trigger if exists trg_invoices_count_usage on invoices;
create trigger trg_invoices_count_usage
  after insert on invoices
  for each row execute function invoices_count_usage();

-- new_rows holds only the rows this request inserted (an edit is an update, not an insert).
drop trigger if exists trg_invoices_free_limit_batch on invoices;
create trigger trg_invoices_free_limit_batch
  after insert on invoices
  referencing new table as new_rows
  for each statement execute function invoices_free_limit_batch();

create or replace function my_plan()
returns json
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select json_build_object(
    'pro',             is_pro(auth.uid()),
    'source',          s.source,
    'status',          s.status,
    'pro_until',       s.pro_until,
    'interval',        s.interval,
    'cancels',         coalesce(s.cancels, false),
    'used_this_month', coalesce((select u.count from invoice_usage u
                                  where u.user_id = auth.uid()
                                    and u.month = utc_month(now())), 0),
    'month',           to_char(utc_month(now()), 'YYYY-MM'),
    'free_limit',      20)
  from (select 1) as one
  left join subscriptions s on s.user_id = auth.uid()
  where auth.uid() is not null;
$$;

revoke execute on function free_cap() from public, anon, authenticated;
revoke execute on function utc_month(timestamptz) from public, anon, authenticated;
revoke execute on function refuse_free_limit() from public, anon, authenticated;
revoke execute on function is_pro(uuid) from public, anon, authenticated;
revoke execute on function invoices_free_limit() from public, anon, authenticated;
revoke execute on function invoices_count_usage() from public, anon, authenticated;
revoke execute on function invoices_free_limit_batch() from public, anon, authenticated;
revoke execute on function my_plan() from public, anon;
grant execute on function my_plan() to authenticated;
```

## 2. Make the owner's dad Pro, free forever

Ask the owner for the email his dad signs in to Keiro with. Put it where `DAD_EMAIL` is (inside the single quotes) in both statements below.

**First, check it is the right account.** Run:

```
select u.id as user_id, u.email, u.created_at, u.last_sign_in_at,
       (select count(*) from invoices i where i.user_id = u.id) as invoices
from auth.users u
where lower(u.email) = lower('DAD_EMAIL');
```

Show the owner the row in plain words: the email, the day the account was created (`created_at`), the day it last signed in (`last_sign_in_at`) and how many invoices it holds (`invoices`). His dad already uses Keiro, so expect an account that has been around a while, signed in recently, with invoices. Ask the owner: "Is this your dad's account?" **Do not go on until the owner says yes.**

- No row at all: no account has that email. Show the owner `select email from auth.users order by created_at;` and ask for the right one.
- More than one row, or an account that looks wrong (brand new, no invoices, never signed in), or the owner isn't sure: stop and ask. Do not run the next statement.

Only after the owner says yes, run:

```
insert into subscriptions (user_id, source, status, pro_until)
select id, 'manual', 'active', null from auth.users where lower(email) = lower('DAD_EMAIL')
on conflict (user_id) do update set source = 'manual', status = 'active', pro_until = null, updated_at = now()
returning user_id;
```

Expected: one result row, his `user_id`. Keep it: step 4 asks for it.

## 3. Verify

Runs 1–3 are wrapped in `begin;` … `rollback;`, so nothing is kept. Runs 2 and 3 end in an error on purpose, and an error skips the `rollback;` line, so after each of them run `rollback;` on its own. If any run says `current transaction is aborted, commands ignored until end of transaction block`, that is why: run `rollback;` on its own, then repeat the run that failed.

### Check: the triggers are there

The dashboard assistant can rewrite SQL before it runs, so look at what the database really has:

```
select tgname from pg_trigger where tgrelid = 'public.invoices'::regclass and not tgisinternal order by tgname;
```

Expected: `trg_invoices_count_usage`, `trg_invoices_free_limit`, `trg_invoices_free_limit_batch` and `trg_invoices_updated_at`. The first three come from this setup; the last was already there. If one of the first three is missing, the SQL did not fully run: go back to step 1, run it again (it is safe to re-run), and check again. Do not go on with a trigger missing.

### Get his id

Use his email as in step 2. It replaces every `DAD_ID` in Runs 1 and 3 (inside the single quotes):

```
select id from auth.users where lower(email) = lower('DAD_EMAIL');
```

### Run 1: as the dad

```
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'DAD_ID';
select my_plan();
rollback;
```

Expected: JSON with `"pro" : true`, `"source" : "manual"`, `"pro_until" : null`, `"free_limit" : 20`.

### Run 2: guests are refused

```
begin;
set local role anon;
select my_plan();
rollback;
```

Expected: `ERROR: permission denied for function my_plan`.

### Run 3: users can't write the Pro record

```
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'DAD_ID';
update subscriptions set status = status where user_id = 'DAD_ID';
rollback;
```

Expected: `ERROR: permission denied for table subscriptions`.

The update sets `status` to what it already is, on purpose: if the editor ran the lines one at a time and ignored `set local role`, it would run as the admin and still change nothing. Leave it as written.

## 4. Report back

Paste into the chat: whether the SQL ran (or the exact error), the `user_id` that step 2 returned (his id), what the trigger check returned, and the results of Runs 1–3 verbatim.

## Later: the owner's switch

Kept for reference. **Never run any of this during setup.**

If the person already pays by card, cancel their subscription in Stripe first (Stripe dashboard → Customers → their subscription → Cancel), otherwise Stripe keeps charging them.

Use step 2's check first, to make sure the email is the right account. Then:

**Free forever:** step 2's `insert` statement with that person's email.

**Pro until a date:** step 2's `insert` statement with that person's email, with `null` replaced by the end of that day in New York time, like `'2026-12-01 23:59:59 America/New_York'` (put in the date wanted), in both places. In plain words: Pro lasts through that whole day, and the account is Free from the next day.

**Back to Free** (removes only a switch, never a Stripe subscription), with that person's email in place of `EMAIL`:

```
delete from subscriptions where source = 'manual' and user_id = (select id from auth.users where lower(email) = lower('EMAIL'));
```
