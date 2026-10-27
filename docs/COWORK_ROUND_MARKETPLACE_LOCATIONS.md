# Cowork: round the locations already saved on Marketplace posts

Self-contained instructions for a cowork session. Run this **after** the app update that rounds new
posts (the PR adding this file) is live. Otherwise a post saved in between keeps its exact location.

**Why:** a Marketplace post (a driver listing or a store request) is readable by every signed-in
Keiro user, and posts used to carry the phone's exact GPS position. New posts now go up rounded to
about 1 km (two decimal places). This does the same to posts already saved. It also clears the 0°, 0°
location that posts made without location permission were saved with (a bug fixed in the same PR):
those had no location, and 0°, 0° made their distance read thousands of miles.

It changes only `lat` and `lng` on `marketplace_listings` and `marketplace_demand`. No row is added
or deleted, and nothing else on a row changes. It's safe to re-run: rounding a rounded number
changes nothing.

**Project:** Keiro, Supabase project ref `dcfplaqknngtnixvsiju`.
If its URL doesn't resolve, the free project is paused; open the dashboard and click Restore first.

## 1. Look first (read-only)

Supabase Dashboard → project `dcfplaqknngtnixvsiju` → SQL Editor → New query → paste → Run:

```sql
select 'listings' as posts,
       count(*) filter (where lat is not null and (lat <> round(lat::numeric, 2) or lng <> round(lng::numeric, 2))) as exact,
       count(*) filter (where lat = 0 and lng = 0) as at_zero_zero,
       count(*) as total
from marketplace_listings
union all
select 'requests',
       count(*) filter (where lat is not null and (lat <> round(lat::numeric, 2) or lng <> round(lng::numeric, 2))),
       count(*) filter (where lat = 0 and lng = 0),
       count(*)
from marketplace_demand;
```

Report the two rows exactly as shown. If `exact` and `at_zero_zero` are 0 in both, stop here:
there's nothing to change.

## 2. Round them

New query → paste → Run:

```sql
update marketplace_listings set lat = null, lng = null where lat = 0 and lng = 0;
update marketplace_demand   set lat = null, lng = null where lat = 0 and lng = 0;

update marketplace_listings
   set lat = round(lat::numeric, 2), lng = round(lng::numeric, 2)
 where lat is not null and (lat <> round(lat::numeric, 2) or lng <> round(lng::numeric, 2));
update marketplace_demand
   set lat = round(lat::numeric, 2), lng = round(lng::numeric, 2)
 where lat is not null and (lat <> round(lat::numeric, 2) or lng <> round(lng::numeric, 2));
```

Expected: "Success", with each statement's row count matching step 1.

## 3. Check

Run the step 1 query again. `exact` and `at_zero_zero` must now be 0 in both rows, and `total` must
match step 1.

## 4. Report back

Paste the step 1 output, the step 2 row counts, and the step 3 output, unedited.
