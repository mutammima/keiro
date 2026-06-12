-- ════════════════════════════════════════════════════════════════════════════
-- Keiro Invoice Signatures — private, per-user proof-of-delivery storage
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → New query → paste this → Run.
-- Safe to re-run (everything is `if not exists` / `drop policy if exists`).
--
-- WHY: signatures (seller + buyer PNG data URLs) were previously localStorage-
-- only, so proof-of-delivery never reached the cloud and was invisible on any
-- other device — and lost if the phone was wiped. This table backs them up and
-- syncs them, scoped strictly to the owner (standard private-table RLS).
--
-- One row per (user, invoice). `seller` / `buyer` hold base64 PNG data URLs and
-- are nullable so an invoice can carry just one signature.
-- ════════════════════════════════════════════════════════════════════════════

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
