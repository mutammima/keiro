# Cowork: turn on shared product names in Keiro's Supabase

Self-contained instructions for a cowork session. Nothing here changes existing data.

**Project:** Keiro, Supabase project ref `dcfplaqknngtnixvsiju`.
If its URL doesn't resolve, the free project is paused; open the dashboard and click Restore first.

## 1. Run the SQL

1. Supabase Dashboard → project `dcfplaqknngtnixvsiju` → SQL Editor → New query.
2. Paste the whole of `supabase-shared-product-names.sql` (from the Keiro repo, main branch) → Run.
   If the editor complains about multiple statements, run it in 4 pastes:
   - the index
   - `shared_product_name`
   - `suggest_product_names`
   - the four revoke/grant lines
3. Expected: "Success. No rows returned".

## 2. Check it (nothing is kept: everything runs inside a transaction that is rolled back)

Find two real user ids: `select id, email from auth.users order by created_at limit 5;`
Pick any two (A and B). Then run, replacing A and B:

    begin;
    insert into products (user_id, barcode, name, last_price) values
      ('A', '000000000017', 'COWORK TEST NAME', 1), ('B', '0000000000017', 'cowork test name', 2);
    set local role authenticated;
    set local request.jwt.claim.sub = 'A';
    select shared_product_name('000000000017')  as shared,      -- expect: COWORK TEST NAME or cowork test name
           (select array_agg(n) from suggest_product_names('cowork') n) as suggested;  -- expect: one name
    reset role;
    set local role anon;
    select shared_product_name('000000000017');                 -- expect: ERROR permission denied
    rollback;

The last select failing with "permission denied for function shared_product_name" is the expected result.

## 3. Report back

Paste the three results (shared, suggested, the anon error) into the chat. Claude then checks from
outside that the functions exist and refuse anonymous callers.
