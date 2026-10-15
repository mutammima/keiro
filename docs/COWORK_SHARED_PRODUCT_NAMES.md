# Cowork: turn on shared product names in Keiro's Supabase

Self-contained instructions for a cowork session. Nothing here changes existing data.

**Project:** Keiro, Supabase project ref `dcfplaqknngtnixvsiju`.
If its URL doesn't resolve, the free project is paused; open the dashboard and click Restore first.

## 1. Run the SQL

1. Supabase Dashboard → project `dcfplaqknngtnixvsiju` → SQL Editor → New query.
2. Paste the whole of the SQL below → Run.
   If the editor complains about multiple statements, run it in 4 pastes:
   - the index (lines 1–4 below)
   - `shared_product_name` function (lines 6–19 below)
   - `suggest_product_names` function (lines 21–34 below)
   - the four revoke/grant lines (lines 36–39 below)

```sql
-- Barcode lookups across accounts; the partial index matches the function's WHERE.
create index if not exists idx_products_gtin
  on products (lpad(barcode, 14, '0'))
  where barcode ~ '^[0-9]{8,14}$';

create or replace function shared_product_name(p_barcode text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  with candidates as (
    select name, user_id, updated_at
    from products
    where auth.uid() is not null
      and p_barcode ~ '^[0-9]{8,14}$'          -- lpad truncates longer input; never match it
      and barcode ~ '^[0-9]{8,14}$'            -- skips manual_… catalog keys
      and lpad(barcode, 14, '0') = lpad(p_barcode, 14, '0')   -- 12- and 13-digit forms match
  ),
  grouped as (
    select lower(btrim(name)) as key,
           count(distinct user_id) as accounts,
           max(updated_at) as last_used
    from candidates
    group by 1
  )
  select (select btrim(c.name) from candidates c
          where lower(btrim(c.name)) = g.key
          order by c.updated_at desc limit 1)
  from grouped g
  where g.accounts >= 2                         -- K = 2 (owner, 2026-10-14)
  order by g.accounts desc, g.last_used desc
  limit 1;
$$;

-- Names other drivers use that contain the typed text. Same K rule; 8 at most.
create or replace function suggest_product_names(p_query text)
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  with matches as (
    select lower(btrim(name)) as key, name, user_id, updated_at
    from products
    where auth.uid() is not null
      and length(btrim(p_query)) >= 2
      and strpos(lower(name), lower(btrim(p_query))) > 0   -- substring, like AutofillInput
  ),
  grouped as (
    select key, count(distinct user_id) as accounts, max(updated_at) as last_used
    from matches
    group by key
    having count(distinct user_id) >= 2
  )
  select (select btrim(m.name) from matches m where m.key = g.key order by m.updated_at desc limit 1)
  from grouped g
  order by g.accounts desc, g.last_used desc
  limit 8;
$$;

-- Postgres grants EXECUTE to PUBLIC by default, so revoking only anon would leave it open.
revoke all on function shared_product_name(text) from public, anon;
revoke all on function suggest_product_names(text) from public, anon;
grant execute on function shared_product_name(text) to authenticated;
grant execute on function suggest_product_names(text) to authenticated;
```

3. Expected: "Success. No rows returned".

## 2. Check it (nothing is kept: everything runs inside a transaction that is rolled back)

Find two real user ids: `select id, email from auth.users order by created_at limit 5;`
Pick any two (A and B). A and B are two different `id` values from that query, pasted inside single quotes.

### Run 1: test the authenticated case

```sql
begin;
insert into products (user_id, barcode, name, last_price) values
  ('A', '000000000017', 'COWORK TEST NAME', 1), ('B', '0000000000017', 'cowork test name', 2);
set local role authenticated;
set local request.jwt.claim.sub = 'A';
select shared_product_name('000000000017')  as shared,
       (select array_agg(n) from suggest_product_names('cowork') n) as suggested;
rollback;
```

Expected: `shared` = `COWORK TEST NAME` or `cowork test name` (one of the two spellings you entered);
`suggested` = an array with one name (the shared name).

If the insert errors because another column is required, add that column with any valid value and run it again; everything is rolled back.

### Run 2: test the anon rejection

```sql
begin;
set local role anon;
select shared_product_name('000000000017');
rollback;
```

Expected: `ERROR: permission denied for function shared_product_name`.

## 3. Report back

Paste the Run 1 result row (the `shared` and `suggested` columns) and the Run 2 error message into the chat. Claude then checks from
outside that the functions exist and refuse anonymous callers.
