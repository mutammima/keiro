# Cowork: turn on in-app account deletion in Keiro's Supabase

Self-contained instructions for a cowork session. Running the SQL adds one function and changes no
data. The function deletes an account only when that account's own signed-in user calls it from the
app's Delete account button.

**Run this before the app update that adds the button** (the PR adding this file). Until it's run,
the button says deletion isn't available yet and nothing is deleted.

**Project:** Keiro, Supabase project ref `dcfplaqknngtnixvsiju` (not "NxM + DuoNotes").
If its URL doesn't resolve, the free project is paused; open the dashboard and click Restore first.

## 1. Run the SQL

1. Supabase Dashboard → project `dcfplaqknngtnixvsiju` → SQL Editor → New query.
2. Paste the whole of `supabase-account-deletion.sql` (repo root, below) → Run.
3. Expected: "Success. No rows returned".

If the editor rejects multiple statements, run it in 3 pastes: the `create or replace function`
through the `$$;` that ends it, then the `revoke` line, then the `grant` line.

```sql
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
```

Paste it exactly. If the dashboard's assistant offers to rewrite it, decline: the two `delete`
lines before `auth.users` are on purpose. On the live database, `connections` would otherwise keep a
row pointing at nobody.

## 2. Check it (read-only)

New query → paste → Run:

```sql
select p.proname                                             as function,
       p.prosecdef                                           as security_definer,
       has_function_privilege('anon', p.oid, 'execute')          as anon_can_call,
       has_function_privilege('authenticated', p.oid, 'execute') as signed_in_can_call
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'delete_my_account';
```

Expected, exactly one row: `delete_my_account | true | false | true`.

Do **not** test it by calling `delete_my_account()` in the SQL editor: there it runs without a
signed-in user and only says "not signed in", which proves nothing. The owner tests it from the app
with a throwaway `+tag` account.

## 3. Report back

Paste the step 1 result and the step 2 row, unedited.
