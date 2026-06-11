-- ════════════════════════════════════════════════════════════════════════════
-- Keiro — invoices.updated_at for payment-change badges
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → New query → paste this → Run.
-- Safe to re-run.
--
-- Adds an updated_at column plus a BEFORE UPDATE trigger that stamps it on every
-- row change. The store side reads it to badge a payment-status change on a
-- shared invoice (e.g. the driver marks it paid). The client only READS the
-- column — a trigger owns the writes — so payment-status updates keep working
-- whether or not this migration has been run; the payment badge simply stays
-- dormant until it is.
-- ════════════════════════════════════════════════════════════════════════════

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
