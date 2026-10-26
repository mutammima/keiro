-- ════════════════════════════════════════════════════════════════════════════
-- Keiro — delete_my_account(): in-app account deletion (Apple 5.1.1(v))
--
-- HOW TO RUN: via docs/COWORK_ACCOUNT_DELETION.md (Supabase Dashboard → SQL
-- Editor). Safe to re-run. Run it BEFORE the app update that adds the Delete
-- account button: without it the button says deletion isn't available yet.
--
-- Spec: docs/specs/2026-10-26-account-deletion.md. Owner decisions 2026-10-26:
-- everything goes, including the invoices a connected store could see, at once
-- (no grace period).
--
-- Written from the live database's foreign keys (queried 2026-10-26), not the
-- repo's SQL: every user table references auth.users, almost all ON DELETE
-- CASCADE, so deleting the auth user removes the rest. Two exceptions, handled
-- below before the auth user goes:
--   • connections.driver_user_id / store_user_id are SET NULL on the live
--     database (the repo's file says CASCADE; the table predates it). Left to
--     the FK, the other person would keep a "connection" to nobody. Only
--     invited_by cascades.
--   • profiles keys on id, which that query didn't cover; it is deleted here
--     whatever its FK says.
-- invoices.store_user_id is SET NULL on purpose and stays so: a store deleting
-- its account leaves its drivers' invoices with the drivers.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;

  -- Both sides, any status (pending requests too). Their connection_orders
  -- cascade on connection_id.
  delete from public.connections
   where driver_user_id = uid or store_user_id = uid or invited_by = uid;

  delete from public.profiles where id = uid;

  -- Cascades to every other table that holds this account's rows, and to
  -- Supabase's own identities, sessions and refresh tokens.
  delete from auth.users where id = uid;
end;
$$;

-- Supabase opens new functions to everyone by default. Only a signed-in user
-- may call it, and it only ever touches auth.uid()'s own account.
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
