# Product names: unrecognized barcodes, shared names, and suggestions

Two parts, built at different times:

- **Part A, unrecognized barcodes.** Makes "not found" rarer and clearer for a single driver. No
  database or privacy change. **Can be built now.**
- **Part B, shared names.** A barcode one driver names, every driver can scan; Google-style
  suggestions while typing; an "Is this it?" check after a scan. **Build when a second driver joins.**

**Status**
- [x] Design written (2026-10-13)
- [x] Part A: owner picks items → built, tested, merged (#189, live c9cc5ef)
- [x] Part B: owner decisions answered (2026-10-14: recommendations accepted)
- [ ] Part B: privacy policy updated (required before it ships)
- [ ] Part B: SQL run in Supabase (via a cowork prompt) and probed
- [ ] Part B: client built, tested, merged
- [ ] Part B: checked on two phones with two real accounts

**Depends on:** PR #187 (api/barcode.js, phone-catalog fallback, "type it once" message) merged.

**Part B decisions (owner, 2026-10-14):** K = 2 · signed-in only · no opt-out · "from other drivers"
label. **Since Easy Mode (#190):** the Easy check card already asks (editable name, Add / Cancel), so
in Easy Mode the "Is this it?" step is the card plus a source line; the separate card is normal mode
only. The "(you)" suggestion tag isn't built.

---

## How a scan is named today (after #187)

1. The driver's own catalog (`storage.getProductByBarcode`): name **and** his price.
2. Open Food Facts, called from the app (food only).
3. `/api/barcode` → UPCitemdb (general merchandise; free tier **100 lookups/day shared by all
   Keiro users**, answers CDN-cached).
4. Otherwise: "Not in the product database. Type the name once and Keiro will remember it." The
   typed name is saved under the barcode, so the next scan fills it in.

---

# Part A: when nothing recognizes a barcode

"Not found" has three different causes. Each needs a different fix.

### A1. It exists, but the lookup missed it

**Short barcodes on small items (UPC-E). Recommended.** Cans, gum and small bottles often carry
an 8-digit UPC-E code, a compressed form of a 12-digit UPC-A. UPCitemdb rejects the short form and
only knows the full one. Checked 2026-10-13:

| Code | UPCitemdb | Open Food Facts |
|---|---|---|
| `04963406` (UPC-E, Coke can) | `INVALID_UPC` | found |
| `049000006346` (same code, expanded) | "Coca-Cola Can, 12 fl oz" | found |

Fix: `BarcodeScanner` passes the format html5-qrcode reports (`decodedResult.result.format.formatName`)
along with the text. For `UPC_E`, expand to UPC-A (standard GS1 rule) **before** any lookup, and save
the product under the expanded code so the catalog only ever holds one form. EAN-8 codes are also 8
digits but are not UPC-E, so this goes by the reported format, never by length. Test with known
UPC-E/UPC-A pairs.

**"Couldn't check" vs "not found". Recommended.** Today an offline phone, Open Food Facts being
down (it was briefly unavailable during testing on 2026-10-13) and UPCitemdb's daily quota running
out all look exactly like "no database has this". `lookupBarcode` should return why:
`{ name, status: 'found' | 'not-found' | 'unavailable' }`, where `unavailable` means a timeout,
offline, a 5xx from Open Food Facts, or a 502 from the route. For `unavailable`, show:

> Couldn't check right now (no signal, or the lookup service is busy). Type the name, or **Try again**.

**Try again** re-runs the lookup for the barcode still shown under the field.

**Misreads. No change for v1.** The app already shows "Barcode: …" under the product field, so the
driver can compare it to the label. EAN/UPC check digits reject most misreads before they get here.

### A2. No database has it

**Store-made barcodes. Recommended.** Some barcodes are only meaningful inside one store or company:
weighed deli and meat items, store labels, internal stock codes. In 13-digit form these start with
`02` or `04` (GS1 prefixes 020–029 and 040–049, which include UPC number systems 2 and 4), or with
`2` (GS1 prefixes 200–299). No database will ever name them. Recognize them, skip the remote
lookups (no wait, no quota spent), and say:

> This is a store-made barcode, so no database will have it. Type the name once and Keiro will
> remember it.

**Type it once.** Already shipped in #187. Part B adds suggestions while typing, so he types less.

**Unknown-barcode tally. Optional (Decision 5).** Count barcodes that no source could name
(barcode, number of misses, last seen; no account attached). This shows which products are
commonly missing, which is the evidence for whether a paid lookup database is worth it before
launch. It needs a small table and an RPC, so it goes through the Supabase cowork step.

### A3. The driver doesn't know what it's called

He can name it anything. It's his catalog, and with Part B's two-account rule, his name only
reaches others if another driver independently uses it too. Part B's suggestions help when he knows
part of the name ("mobil").

**Photo → name. Later (Decision 6).** He photographs the package; the server sends the photo to an
AI model that reads the brand and product, and the result appears in Part B's "Is this it?" card.
It costs a small amount per photo, needs an API key on the server, and sends the photo off the
phone, so it has to be priced and added to the privacy policy before it's built.

### Part A tests (write first)

- UPC-E expansion: known pairs; EAN-8 never expanded; the product is saved under the UPC-A form.
- `lookupBarcode` status: OFF hit → found; both miss → not-found; offline, timeout, OFF 5xx and
  route 502 → unavailable (and a hit from the other source still wins).
- handleScan: `unavailable` shows the Try-again message and keeps the barcode; Try again re-runs it.
- Store-made prefixes (`02…`, `04…`, `2…`) make no network calls and show the store-made message;
  ordinary codes (`00…`, `03…`, `07…`) still look up.

---

# Part B: shared names

## Why

Drivers who supply the same kind of stores scan the same products (sodas, chips, motor oil). Today
each driver types each of those names himself, and each scan spends UPCitemdb quota.

The names already exist: every product a signed-in driver adds after a scan is saved in the
`products` table as `(user_id, barcode, name, last_price)`. RLS keeps each account's rows private.
Part B lets any signed-in account ask **"what do Keiro drivers call this barcode?"** and get back
**only a product name**: never a price, never which driver or account saved it, never stores or
quantities.

Result: once any driver has added a product, nobody needs Open Food Facts or UPCitemdb for that
barcode again, and the 100/day quota only applies to barcodes no Keiro driver has ever added.

## Design

### No new table

Answers are computed from `products` at lookup time by `SECURITY DEFINER` functions. So:
- Nothing new is written and nothing can go stale. Names typed before this ships count.
- Deleting an account deletes its `products` rows (`on delete cascade`), which removes its
  contributions automatically.
- Editing or deleting a product in the Products page changes what's shared.

(Alternative considered: a separate log of barcode → name → confirmations with no account
attached. Other drivers would see exactly the same thing, but counting each driver once still means
storing who confirmed, and a deleted account's entries would stay. Not chosen.)

### Lookup order after Part B

1. Driver's own catalog: name **and** price, filled straight in (he named it before).
2. **Shared name** (new): goes to the "Is this it?" card.
3. Open Food Facts: goes to the "Is this it?" card.
4. `/api/barcode` → UPCitemdb: goes to the "Is this it?" card.
5. Nothing: Part A's messages.

### "Is this it?" after a scan

A name that didn't come from the driver's own catalog is shown as a question instead of being
silently filled in:

```
Found: Mobil 1 High Mileage 5W-30 5 Quart
from other Keiro drivers                      ← or "from a product database"
[ Yes, use it ]   [ No, I'll type it ]
```

- **Yes** fills the name (price stays empty). When he adds the item, `addItem()` saves it to his
  own catalog with his price. That is his confirmation, and it's what counts toward the two-account
  rule.
- **No** clears the card and focuses the name field, where suggestions (below) help him type it.
- One tap either way. A wrong name is never saved without him seeing it.

### Suggestions while typing (Google-style)

The Product Name field (`AutofillInput`) already drops down up to 8 matches from the driver's own
last 200 typed names (`inv_product_names`, on the phone). Picking one fills his last price
(`handleProductNameChange` → `getProductByName`). Part B adds names other drivers use:

```
Product Name: [mobil          ]
               ┌──────────────────────────────┐
               │ Mobil 1 5W-30 5qt       (you) │
               │ Mobil 1 High Mileage 5W-30    │
               │ Mobil 1 0W-20 5qt             │
               └──────────────────────────────┘
```

- His own names first, then shared ones, without duplicates (case-insensitive). Still 8 at most.
- Shared names are fetched once he has typed at least 2 characters and paused, reusing the existing
  `AUTOFILL_DEBOUNCE_MS` timer, signed-in only.
- The same two-account rule applies: a name appears only once two different accounts have used it.
- Side benefit: drivers picking the same suggestion spell the product the same way, which is what
  lets the two-account rule match them.
- Not using web search for suggestions: UPCitemdb's free tier allows 20 searches a day, and Open
  Food Facts' search was unavailable during testing. Keiro's own list is free and grows with use.

### Which name, when drivers disagree

Group rows by `lower(trim(name))`, count **distinct accounts** per spelling, and return the spelling
with the most accounts (ties go to the most recently updated), shown as the most recent
original-case spelling. A spelling is only eligible once **K accounts** have used it (Decision 1).

### Barcode forms

The same UPC can be saved as 12 digits (`071924145009`) or 13 (`0071924145009`), depending on what
the scanner reports. Match on the GTIN-14 form, `lpad(barcode, 14, '0')`, and only for digit-only
8–14 character codes. That also skips the `manual_…` keys Products.jsx makes for typed-in items.
(UPC-E codes are expanded before saving by Part A.)

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
      and strpos(lower(name), lower(btrim(p_query))) > 0   -- substring, like AutofillInput; no LIKE escaping needed
  ),
  grouped as (
    select key, count(distinct user_id) as accounts, max(updated_at) as last_used
    from matches
    group by key
    having count(distinct user_id) >= 2         -- K, see Decision 1
  )
  select (select m.name from matches m where m.key = g.key order by m.updated_at desc limit 1)
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

`suggest_product_names` scans `products` without an index. That's fine at today's size; add a
`pg_trgm` GIN index on `lower(name)` if the table grows past roughly 100k rows.

### Client

- `db.getSharedProductName(barcode)` and `db.suggestProductNames(query)`: `supabase.rpc(…)` with the
  `noSession()` guard like their siblings. Any error (including the functions not existing yet)
  resolves to `null` / `[]`, so the client can merge before or after the SQL runs.
- `useInvoiceForm.handleScan`: insert the shared step between the own-catalog check and
  `lookupBarcode`; steps 2–4 set a pending `{ name, source }` for the "Is this it?" card instead of
  `productName`.
- `handleProductNameChange`: in the existing debounce, also fetch shared suggestions; expose them
  merged with `productNames` (own first, deduped).
- `AutofillInput`: optional "(you)" tag on the driver's own names.
- Offline or guest: no shared step, no shared suggestions (no session), same as today.

### Part B tests (write first)

- handleScan order: own catalog fills directly; shared / OFF / route results go to the pending card;
  shared hit skips OFF and the route; an RPC error falls through.
- Card: Yes fills the name only (never a price); No clears it and leaves the field empty.
- Suggestions: own names first; duplicates removed case-insensitively; at most 8; under 2 characters
  or no session → no RPC; a stale response (typing moved on) is ignored.
- SQL, probed after the cowork run with throwaway `+tag` accounts (see CLAUDE.md):
  - anon → permission denied for both functions
  - one account used a name → no barcode answer, no suggestion (K = 2)
  - two accounts → that name in both
  - 12 vs 13-digit forms match; a 15-digit or `manual_…` input → `null`
  - price, user id and store never appear in any response

## Owner decisions

Part B (answer before building it):

1. **K, how many accounts must use a name before others see it.** Recommended: **2**. One driver's
   one-off label (for example a customer's name typed as a product name) never reaches anyone. The
   cost is that the first two drivers each type a product once before it's shared. K = 1 shares
   sooner but leaks one-off labels; if chosen, it needs Decision 3's opt-out.
2. **Guests.** Recommended: **signed-in only**. The anon key ships in the app, so anon-callable
   functions would be a free public barcode API anyone could query.
3. **Opt-out toggle in Settings.** Recommended: **not for v1 if K = 2**. It needs a profiles column
   and a filter in both functions. Required if K = 1.
4. **"From other drivers" label on the card.** Recommended: **yes**. It tells the driver the name
   isn't verified.

Part A:

5. **Unknown-barcode tally** (A2). Recommended: **yes, before a paid lookup plan is considered**;
   not needed while there's one driver.
6. **Photo → name** (A3). Recommended: **later**; price it first.

## Privacy policy (required before Part B ships)

PRIVACY.md currently says "each account can only access its own data" (§3) and lists sharing only
with service providers and when required by law (§5). Both need updating. Draft wording:

- §3, after the RLS sentence: "One exception: the **product name** you give a barcode can be shown
  to other Keiro users who scan or type the same product, once at least two accounts have used that
  name. Your prices, quantities, stores, and who saved it are never shared."
- §5, new bullet: "**Barcode lookups.** When a scanned barcode isn't in your catalog, its number
  (only the number) is sent to Open Food Facts and, through our server, to UPCitemdb to look up the
  product's name." This is already true today and isn't listed. Part A doesn't change it, so this
  bullet can go in any time.

## Cost

$0 on the current Supabase free plan (500 MB database, 5 GB egress a month):
- Part A: no database use except the optional tally (a few bytes per unknown barcode).
- Part B: no new rows. The barcode index is tens of bytes per product row. One RPC per scan that
  misses the driver's own catalog, and one per typing pause, each returning a few short names. That's
  far below the egress cap (the rule in CLAUDE.md "Egress" is about unbounded list reads, not this).
- Part B **reduces** UPCitemdb calls, delaying the need for a paid lookup plan (UPCitemdb DEV
  $99/mo, EAN-Search €19/mo).

## Rollout

Part A: one client PR (tests first) → Vercel → OTA to the iOS app. No SQL unless the tally is
chosen.

Part B:
1. Owner answers Decisions 1–4; update the SQL's K and grants to match.
2. PRIVACY.md change merged (or in the same PR as the client).
3. Cowork prompt runs the SQL in the Supabase dashboard, one statement per paste, then the probes
   above. Claude re-verifies the probes.
4. Client PR merged → Vercel deploy → OTA reaches the iOS app (no native change, no new IPA).
5. Two-phone check: driver A adds a product after a failed scan. Driver B (second account) scans the
   same barcode and sees no shared name yet (K = 2). Driver B adds it with the same name. A third
   account then gets the "Is this it?" card with that name, and the name in suggestions; no price is
   visible anywhere.

## Out of scope / follow-ups

- Normalizing 12 vs 13-digit forms when saving to the driver's own catalog (step 1 can still miss if
  one phone reports a different form; the shared step already handles both).
- Contributing names back to Open Food Facts / Open Products Facts.
- Moderation tooling (flag a bad name). K = 2 plus "most accounts wins" plus the "Is this it?" card
  are the v1 defense.
- Paying for a bigger lookup source before public launch.
