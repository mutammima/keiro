-- ════════════════════════════════════════════════════════════════════════════
-- Keiro — pricing: the Pro record and the free plan's monthly invoice count
-- (docs/specs/2026-10-16-pricing-design.md §3)
--
-- HOW TO RUN: through docs/COWORK_PRICING.md (Supabase Dashboard → SQL Editor).
-- Safe to re-run. Run it BEFORE the app update that turns the limits on.
--
-- subscriptions  — who is Pro: Stripe subscribers (written by api/stripe-webhook
--                  with the service-role key) and the owner's switch (by hand).
-- invoice_usage  — new invoices per account per UTC month, kept by triggers.
-- A free account's upload is refused past 25 in a month (the app stops at 20), and a
-- request inserting many invoices at once is refused whole if it would pass 25.
-- Only invoices whose own created_at is in the current UTC month count or can be
-- refused, so a guest's history, a restored backup or last month's offline
-- invoice always uploads. Users read their own rows in both tables, write neither.
-- ════════════════════════════════════════════════════════════════════════════

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

-- Supabase's default privileges open new tables to anon and authenticated.
revoke all on subscriptions from anon;
revoke all on invoice_usage from anon;
revoke insert, update, delete, truncate on subscriptions from authenticated;
revoke insert, update, delete, truncate on invoice_usage from authenticated;
grant select on subscriptions to authenticated;
grant select on invoice_usage to authenticated;

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
  v_month date := (date_trunc('month', now() at time zone 'utc'))::date;
  v_used  integer;
begin
  -- Only invoices made this month can be refused: history uploads never are.
  if new.created_at is null
     or (date_trunc('month', new.created_at at time zone 'utc'))::date <> v_month then
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
  if coalesce(v_used, 0) >= 25 then
    raise exception 'KEIRO_FREE_LIMIT'
      using errcode = 'P0001', hint = 'Free plan: 20 new invoices a month.';
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
  v_month date := (date_trunc('month', now() at time zone 'utc'))::date;
begin
  if new.created_at is not null
     and (date_trunc('month', new.created_at at time zone 'utc'))::date = v_month then
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
  v_month date := (date_trunc('month', now() at time zone 'utc'))::date;
begin
  if exists (
    select 1
    from (select distinct r.user_id from new_rows r
           where r.created_at is not null
             and (date_trunc('month', r.created_at at time zone 'utc'))::date = v_month) n
    join invoice_usage u on u.user_id = n.user_id and u.month = v_month
    where u.count > 25 and not is_pro(n.user_id)) then
    raise exception 'KEIRO_FREE_LIMIT'
      using errcode = 'P0001', hint = 'Free plan: 20 new invoices a month.';
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
                                    and u.month = (date_trunc('month', now() at time zone 'utc'))::date), 0),
    'month',           to_char(now() at time zone 'utc', 'YYYY-MM'),
    'free_limit',      20)
  from (select 1) as one
  left join subscriptions s on s.user_id = auth.uid()
  where auth.uid() is not null;
$$;

revoke execute on function is_pro(uuid) from public, anon, authenticated;
revoke execute on function invoices_free_limit() from public, anon, authenticated;
revoke execute on function invoices_count_usage() from public, anon, authenticated;
revoke execute on function invoices_free_limit_batch() from public, anon, authenticated;
revoke execute on function my_plan() from public, anon;
grant execute on function my_plan() to authenticated;
