-- ════════════════════════════════════════════════════════════════════════════
-- Keiro — shared product names (docs/specs/2026-10-13-shared-product-catalog.md, Part B)
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → New query → paste this → Run.
-- Safe to re-run. Additive: the app treats a missing function as "no shared name".
--
-- Lets a signed-in driver ask "what do Keiro drivers call this barcode?" and get
-- back ONLY a product name — never a price, quantity, store, or who saved it —
-- and only once at least two OTHER accounts (not the caller's own) use that name
-- (one driver's one-off label never reaches anyone). Matches every row in the
-- `products` catalog, including manual items typed without scanning. Computed live
-- from `products`, so deleting an account (on delete cascade) removes its contributions.
-- ════════════════════════════════════════════════════════════════════════════

-- Barcode lookups across accounts; the partial index matches the function's WHERE.
create index if not exists idx_products_gtin
  on products (lpad(barcode, 14, '0'))
  where barcode ~ '^[0-9]{8,14}$';

create or replace function shared_product_name(p_barcode text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with candidates as (
    select name, user_id, updated_at
    from products
    where auth.uid() is not null
      and user_id <> auth.uid()                -- other accounts only: your own copy never counts
      and btrim(name) <> ''                    -- blank names are never shared
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
  where g.accounts >= 2                         -- K = 2 other accounts (owner, 2026-10-14)
  order by g.accounts desc, g.last_used desc
  limit 1;
$$;

-- Names other drivers use that contain the typed text. Same K rule; 8 at most.
create or replace function suggest_product_names(p_query text)
returns setof text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with matches as (
    select lower(btrim(name)) as key, name, user_id, updated_at
    from products
    where auth.uid() is not null
      and user_id <> auth.uid()                -- other accounts only
      and btrim(name) <> ''                    -- blank names are never shared
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
