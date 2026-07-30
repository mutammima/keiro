-- supabase-realtime.sql — enable Realtime on the cross-account tables.
--
-- WHY: App.jsx used to poll these tables every 30 seconds (~2,880 requests per
-- day per open session), re-downloading the full set each time. That was the
-- main driver of the Supabase free-plan EGRESS overage (5.9 GB / 5 GB) that
-- paused the project. It now subscribes over a websocket instead: data moves
-- only when data actually changes, and cross-account updates land instantly
-- rather than up to 30s late.
--
-- Realtime's `postgres_changes` only emits for tables in the `supabase_realtime`
-- publication. WITHOUT THIS FILE HAVING BEEN RUN, the subscription connects but
-- receives nothing. The app is written to survive that (it falls back to a
-- 1-minute poll instead of the 10-minute one), so this is a performance and
-- latency fix, not a correctness requirement.
--
-- Idempotent: safe to re-run.

-- 1. Ensure the publication exists (Supabase creates it by default; this is a
--    no-op on a normal project and a safety net on one where it was dropped).
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

-- 2. Add the cross-account tables. `add table` errors if the table is already a
--    member, so each is guarded by a membership check.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'connection_orders'
  ) then
    alter publication supabase_realtime add table public.connection_orders;
  end if;

  -- A store owner's "shared invoices" are rows in `invoices` carrying their
  -- store_user_id — there is no separate shared_invoices table.
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'invoices'
  ) then
    alter publication supabase_realtime add table public.invoices;
  end if;
end $$;

-- 3. Verify. Should list both tables.
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public'
order by tablename;

-- NOTE ON SECURITY: Realtime respects Row Level Security for postgres_changes,
-- so a subscriber is only sent changes to rows its RLS policies already allow it
-- to read. The client subscribes without a filter for exactly this reason — RLS
-- does the scoping, and an event only ever triggers a refetch (which is itself
-- RLS-scoped), never a direct render of pushed data.
