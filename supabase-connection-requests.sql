-- ════════════════════════════════════════════════════════════════════════════
-- Keiro Connection Requests — marketplace-initiated connections
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → New query → paste this → Run.
-- Safe to re-run.
--
-- Marketplace rows carry the counterparty's user id, so no invite code needs
-- to travel: the requester inserts a connections row with BOTH sides filled
-- and status 'pending'; the recipient (already a participant by RLS) accepts
-- by flipping it to 'active' or turns it down with 'declined'.
--
-- This migration only widens the status check to allow 'declined'. No policy
-- changes: the existing participants-only insert/select/update policies
-- (supabase-connections.sql) already cover the request flow.
-- ════════════════════════════════════════════════════════════════════════════

-- Drop whatever the current status CHECK is called (the table may have been
-- created by an earlier script variant), then recreate it with 'declined'.
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
