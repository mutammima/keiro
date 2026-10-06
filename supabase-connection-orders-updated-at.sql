-- ════════════════════════════════════════════════════════════════════════════
-- Keiro — connection_orders.updated_at stamped by the server
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → New query → paste this → Run.
-- Safe to re-run.
--
-- The app refreshes cross-account orders incrementally: after the first load
-- it only fetches rows whose updated_at moved (see connectionOrderStorage.js).
-- Without this trigger, updated_at is whatever the UPDATING PHONE's clock said,
-- so a phone running slow could stamp a change "in the past" and the other side
-- would only see it on its next full load. A BEFORE UPDATE trigger makes the
-- server's clock the only one that counts. The client keeps sending its own
-- stamp; the trigger simply overrides it, so nothing breaks before this runs.
-- Same pattern as supabase-invoice-updated-at.sql.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function set_connection_orders_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_connection_orders_updated_at on connection_orders;
create trigger trg_connection_orders_updated_at
  before update on connection_orders
  for each row execute function set_connection_orders_updated_at();
