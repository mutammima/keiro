-- ════════════════════════════════════════════════════════════════════════════
-- supabase-profiles.sql — user profiles for the phone-OTP onboarding flow.
--
-- RUN THIS MANUALLY in the Supabase SQL editor BEFORE the phone-auth onboarding
-- can save profiles. Idempotent + self-healing — safe to re-run.
--
-- After running, verify with an anon REST probe (should 401/empty for anon):
--   GET $URL/rest/v1/profiles?select=id&limit=1   (42P01 = table missing)
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  first_name    text not null,
  last_name     text not null,
  email         text,
  role          text not null check (role in ('driver', 'store_owner')),
  store_name    text,
  business_name text,
  plan          text not null default 'basic',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- Heal tables created by earlier variants that lacked these columns.
alter table public.profiles add column if not exists store_name    text;
alter table public.profiles add column if not exists business_name text;
alter table public.profiles add column if not exists plan          text not null default 'basic';
alter table public.profiles add column if not exists created_at    timestamptz default now();
alter table public.profiles add column if not exists updated_at    timestamptz default now();

alter table public.profiles enable row level security;

-- ── RLS: owner-only on every verb ─────────────────────────────────────────────
drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id);
