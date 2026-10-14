# Shared product names: a barcode one driver names, every driver can scan

**Status**
- [x] Design written (2026-10-13)
- [ ] Owner decisions below answered
- [ ] Privacy policy updated (required before the feature ships)
- [ ] SQL run in Supabase (via a cowork prompt) and probed
- [ ] Client built, tested, merged
- [ ] Checked on two phones with two real accounts

**Build it when:** a second driver account starts using Keiro. With one driver, his own catalog
already does this: a name typed after a failed scan fills in on the next scan (PR #187 made that
work for guests too).

**Depends on:** PR #187 (api/barcode.js, phone-catalog fallback) merged.

---

## Why

A scan is named by, in order: the driver's own catalog → Open Food Facts (food only) →
`/api/barcode` → UPCitemdb (general merchandise, free tier **100 lookups/day shared by all Keiro
users**). Drivers who supply the same kind of stores scan the same products (sodas, chips, motor
oil). Today every driver has to type each of those names themselves, and every one of their scans
spends UPCitemdb quota.

The names already exist: every product a signed-in driver adds after a scan is saved in the
`products` table as `(user_id, barcode, name, last_price)`. RLS keeps each account's rows private.
This feature lets any signed-in account ask **"what do Keiro drivers call this barcode?"** and get
back **only a name**: never a price, never who saved it.

Result: once any driver has added a product, nobody needs Open Food Facts or UPCitemdb for that
barcode again, and the 100/day quota only applies to barcodes no Keiro driver has ever added.

## Design

### No new table

The answer is computed from `products` at lookup time by a `SECURITY DEFINER` function. So:
- Nothing new is written and nothing new can go stale. Names typed before this ships count.
- Deleting an account deletes its `products` rows (`on delete cascade`), which removes its
  contributions automatically.
- Editing or deleting a product in the Products page changes what's shared.

### Lookup order after this ships

1. Driver's own catalog: `storage.getProductByBarcode`, with name **and price**.
2. **Shared name** (new): name only, so the price stays empty.
3. Open Food Facts.
4. `/api/barcode` → UPCitemdb.

A name from step 2, 3 or 4 is only a prefill the driver can edit. When they add the item,
`addItem()` saves it to their own catalog with their price, so their own name wins for them from
then on.

### Which name, when drivers disagree

Group the barcode's rows by `lower(trim(name))`, count **distinct accounts** per spelling, and return
the spelling with the most accounts (ties go to the most recently updated), shown as the most recent
original-case spelling. A spelling is only eligible once **K accounts** have used it (see Decision 1).

### Barcode forms

The same UPC can be saved as 12 digits (`071924145009`) or 13 (`0071924145009`), depending on what
the scanner reports. Match on the GTIN-14 form, `lpad(barcode, 14, '0')`, and only for digit-only
8–14 character codes. That also skips the `manual_…` keys Products.jsx makes for typed-in items.

### SQL: `supabase-shared-product-names.sql` (additive, safe to run before the client ships)

**Draft. Not yet run against any database**; the build session validates it before the cowork run.

```sql
-- Barcode lookups across accounts; partial index matches the function's WHERE exactly.
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
      and barcode ~ '^[0-9]{8,14}$'
      and lpad(barcode, 14, '0') = lpad(p_barcode, 14, '0')
  ),
  grouped as (
    select lower(btrim(name)) as key,
           count(distinct user_id) as accounts,
           max(updated_at) as last_used
    from candidates
    group by 1
  )
  select (select c.name from candidates c
          where lower(btrim(c.name)) = g.key
          order by c.updated_at desc limit 1)
  from grouped g
  where g.accounts >= 2                         -- K, see Decision 1
  order by g.accounts desc, g.last_used desc
  limit 1;
$$;

-- Postgres grants EXECUTE to PUBLIC by default, so revoking only anon would leave it open.
revoke all on function shared_product_name(text) from public, anon;
grant execute on function shared_product_name(text) to authenticated;
```

### Client

- `db.getSharedProductName(barcode)`: `supabase.rpc('shared_product_name', { p_barcode })`, with
  the `noSession()` guard like its siblings. Any error (including the function not existing yet)
  resolves to `null`, so the client can merge before or after the SQL runs.
- `useInvoiceForm.handleScan`: insert step 2 between the own-catalog check and `lookupBarcode`.
  On a shared hit, set the name and leave the price empty.
- Optional UI hint under the name field on a shared hit: "Name from other Keiro drivers. Edit it if
  it's wrong." (Decision 4.)
- Offline or guest: skip step 2 (no session), same as today.

### Tests (write first)

- handleScan order: own catalog wins; shared name used when own misses; shared hit skips Open Food
  Facts and the route; shared miss falls through; an RPC error falls through.
- A shared hit fills the name only, never a price.
- `db.getSharedProductName`: no session → no RPC call; RPC error → `null`.
- SQL, probed after the cowork run with throwaway `+tag` accounts (see CLAUDE.md):
  - anon → permission denied
  - one account named it → `null` (K = 2)
  - two accounts → that name
  - 12 vs 13-digit forms match
  - a 15-digit or `manual_…` input → `null`
  - price never appears in any response

## Owner decisions (answer before building)

1. **K, how many accounts must use a name before others see it.** Recommended: **2**. One driver's
   private nickname ("Ahmed's special order") never reaches anyone. The cost is that the first two
   drivers each type a product once before it's shared. K = 1 shares sooner but leaks one-off
   names; if chosen, it needs Decision 3's opt-out.
2. **Guests.** Recommended: **signed-in only**. The anon key ships in the app, so an anon-callable
   function would be a free public barcode API anyone could query.
3. **Opt-out toggle in Settings.** Recommended: **not for v1 if K = 2**. It needs a profiles column
   and a filter in the function. Required if K = 1.
4. **"From other drivers" hint.** Recommended: **yes**. It tells the driver the name isn't verified
   and invites a fix.

## Privacy policy (required before shipping)

PRIVACY.md currently says "each account can only access its own data" (§3) and lists sharing only
with service providers and when required by law (§5). Both need updating. Draft wording:

- §3, after the RLS sentence: "One exception: the **name** you give a product barcode can be shown
  to other Keiro users who scan the same barcode, once at least two accounts have used that name.
  Prices, quantities, stores, and who saved it are never shared."
- §5, new bullet: "**Barcode lookups.** When a scanned barcode isn't in your catalog, its number
  (only the number) is sent to Open Food Facts and, through our server, to UPCitemdb to look up the
  product's name." This was already true before this feature and isn't listed today.

## Cost

$0 on the current Supabase free plan (500 MB database, 5 GB egress a month):
- No new rows. The index is roughly one entry per scanned product row (tens of bytes each).
- One RPC per scan that misses the driver's own catalog, returning one short name. That's far
  below the egress cap (the rule in CLAUDE.md "Egress" is about unbounded list reads, not this).
- It **reduces** UPCitemdb calls, delaying the need for a paid lookup plan (UPCitemdb DEV $99/mo,
  EAN-Search €19/mo).

## Rollout

1. Owner answers the decisions; update the SQL's K and grants to match.
2. PRIVACY.md change merged (or in the same PR as the client).
3. Cowork prompt runs the SQL in the Supabase dashboard, one statement per paste, then the probes
   above. Claude re-verifies the probes.
4. Client PR merged → Vercel deploy → OTA reaches the iOS app (no native change, no new IPA).
5. Two-phone check: driver A adds a product after a failed scan; driver B (second account) scans
   the same barcode and gets A's name, with the price empty and A's price not visible anywhere.

## Out of scope / follow-ups

- Normalizing barcodes when saving to the driver's own catalog (12 vs 13 digits can still miss in
  step 1 if one phone reports a different form; the shared step already handles both).
- Contributing names back to Open Food Facts / Open Products Facts.
- Moderation tooling (flag a bad name). K = 2 plus "most accounts wins" is the v1 defense.
- Paying for a bigger lookup source before public launch.
