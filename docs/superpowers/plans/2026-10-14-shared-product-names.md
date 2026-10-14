# Shared Product Names Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Any signed-in driver can get the product name other drivers gave a barcode (name only, once two accounts agree), as a suggestion when scanning or typing.

**Architecture:**
- Two `SECURITY DEFINER` Postgres functions compute answers from the existing `products` table, so no new table is needed: `shared_product_name(barcode)` and `suggest_product_names(query)`. They run in Supabase via a cowork prompt.
- The app reaches them through `db.js` RPCs and `storage.js` wrappers that never throw.
- `useInvoiceForm` adds a lookup step and typing suggestions:
  - **Easy Mode:** the check card shows where a name came from.
  - **Normal mode:** a looked-up name is offered as "Is this it?" instead of being silently filled in.

**Tech Stack:** Supabase Postgres (RPC via supabase-js), React 19, Vitest + Testing Library. PGlite is used only in the scratchpad to validate the SQL. It is not a project dependency.

**Spec:** `docs/specs/2026-10-13-shared-product-catalog.md`, Part B (merged into this branch from #188). The owner answered Decisions 1–4 on 2026-10-14 with the recommendations: K = 2, signed-in only, no opt-out, label shown.

## Global Constraints

- Branch `feature/shared-product-names` (exists; holds the spec merge). One commit per task with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. PR at the end; merge only when the owner says "merge".
- **K = 2:** a name is shared only once 2 distinct accounts used it. **Signed-in only:** anon is revoked, and so is `PUBLIC`.
- **Only a product name ever leaves an account:** never price, quantity, store, user id or account.
- **Shared lookups never block the app:** any RPC error (including "function does not exist" before the SQL runs) means no shared name, and the scan carries on.
- **Store-made barcodes** (`isStoreMadeBarcode`) never ask other drivers. Those codes mean different things in different stores.
- **Lookup order on a scan:**
  1. own catalog
  2. store-made check
  3. other drivers
  4. Open Food Facts → `/api/barcode`
- **Normal mode keeps working as today for a name from the driver's own catalog** (filled in straight away, with his price). Only names from other drivers or a database become a question.
- **The privacy policy changes ship in the same PR as the client.**
- Inline styles, `STORAGE_KEYS`/constants, tests with no `.env`: as in CLAUDE.md.
- Supabase dashboard work goes in a cowork prompt (owner's standing instruction). Claude cannot run SQL against the live project.

## Rulings carried from the spec

- **The spec's "Is this it?" card predates Easy Mode.** In Easy Mode the check card already asks (name editable, Add = yes, Cancel = no), so it gets a source line instead of a second card. In normal mode the card is built as specified.
- **The "(you)" tag on suggestions is optional in the spec; not built** (YAGNI). The driver's own names simply come first.
- **Shared names are trimmed** (validated: one stored spelling had a trailing space).

## Review Focus

1. **A shared answer arriving after Cancel or the next scan** must not land on the next item (same race as #190's late lookups). → Task 3 test "a late shared answer after Cancel is ignored".
2. **A store-made barcode** must never be sent to other drivers' names. → Task 3 test "store-made codes never ask other drivers".
3. **The app before the SQL is run** (RPC 404 / PGRST202) must scan and type exactly as today. → Task 2 test "an RPC error means no shared name".
4. **Normal mode with a name from his own catalog** must still fill straight in with his price, with no "Is this it?". → Task 3 test "his own catalog still fills straight in (no question)".
5. **Suggestions racing the typing** (a slow answer for "mo" after he typed "mobil 1") must not replace newer suggestions. → Task 3 test "a stale suggestion answer is ignored".

---

### Task 1: The SQL, its validation, the cowork prompt, and the spec update

**Files:**
- Create: `supabase-shared-product-names.sql`
- Create: `docs/COWORK_SHARED_PRODUCT_NAMES.md`
- Modify: `docs/specs/2026-10-13-shared-product-catalog.md` (Status + Decisions answered + rulings)
- Scratch (not committed): `$SQLT=/private/tmp/claude-501/-Users-muti/587f339c-01c8-4783-a1b2-a9dabca4a23a/scratchpad/sqltest/run.mjs` (exists), PGlite at `…/scratchpad/pglite`

**Interfaces:**
- Produces:
  - Postgres `shared_product_name(p_barcode text) returns text`
  - Postgres `suggest_product_names(p_query text) returns setof text` (at most 8)
  - both executable only by `authenticated`

- [ ] **Step 1: Make the validation expect trimmed names (it fails first)**

In `$SQLT`, change both expected values `'mobil 1 5w-30 5QT '` to `'mobil 1 5w-30 5QT'`, and the suggestion expectation `['mobil 1 5w-30 5QT ', 'Mobil oil (manual)']` to `['mobil 1 5w-30 5QT', 'Mobil oil (manual)']`.

Run: `node $SQLT …/scratchpad/pglite …/scratchpad/sqltest/shared-product-names.sql`
Expected: 3 FAIL lines (the trailing space), and the rest PASS.

- [ ] **Step 2: Write `supabase-shared-product-names.sql`**

```sql
-- ════════════════════════════════════════════════════════════════════════════
-- Keiro — shared product names (docs/specs/2026-10-13-shared-product-catalog.md, Part B)
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → New query → paste this → Run.
-- Safe to re-run. Additive: the app treats a missing function as "no shared name".
--
-- Lets a signed-in driver ask "what do Keiro drivers call this barcode?" and get
-- back ONLY a product name — never a price, quantity, store, or who saved it —
-- and only once at least two different accounts use that name (one driver's
-- one-off label never reaches anyone). Computed live from `products`, so deleting
-- an account (on delete cascade) removes its contributions.
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

Copy it over the scratch SQL (`cp supabase-shared-product-names.sql …/scratchpad/sqltest/shared-product-names.sql`) and rerun Step 1's command.
Expected: 14 PASS, then `ALL PASS`.

- [ ] **Step 3: Write the cowork prompt, `docs/COWORK_SHARED_PRODUCT_NAMES.md`**

```markdown
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
```

- [ ] **Step 4: Update the spec**

In `docs/specs/2026-10-13-shared-product-catalog.md`:
- Status: tick "Part A … built, tested, merged" with `(#189, live c9cc5ef)` and "Part B: owner decisions answered", appending `(2026-10-14: recommendations accepted)`.
- Directly under the Status block, add:

```markdown
**Part B decisions (owner, 2026-10-14):** K = 2 · signed-in only · no opt-out · "from other drivers"
label. **Since Easy Mode (#190):** the Easy check card already asks (editable name, Add / Cancel), so
in Easy Mode the "Is this it?" step is the card plus a source line; the separate card is normal mode
only. The "(you)" suggestion tag isn't built.
```

- [ ] **Step 5: Commit**

```bash
git add supabase-shared-product-names.sql docs/COWORK_SHARED_PRODUCT_NAMES.md docs/specs/2026-10-13-shared-product-catalog.md
git commit -m "feat(shared-names): SQL (validated on PGlite) and the cowork prompt to run it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: db.js RPCs and storage wrappers

**Files:**
- Modify: `src/services/db.js` (add two functions after `getProductByName`)
- Modify: `src/utils/storage.js` (add two wrappers after `getProductByName`)
- Test: `src/__tests__/sharedProductNames.test.js`

**Interfaces:**
- Produces:
  - `db.getSharedProductName(barcode) → { data: string|null, error }`
  - `db.suggestProductNames(query) → { data: string[], error }`
  - `storage.getSharedProductName(barcode) → Promise<string|null>`, trimmed, never throws
  - `storage.getSharedProductSuggestions(query) → Promise<string[]>`, trimmed, non-empty, never throws

- [ ] **Step 1: Write the failing test**

```js
/**
 * sharedProductNames.test.js
 *
 * The app asks Supabase what other drivers call a barcode, and which names
 * they use that contain typed text (supabase-shared-product-names.sql). Only
 * signed-in users ask; any error (including the functions not existing yet,
 * before the SQL is run) means "no shared name", never a broken scan.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe() {} } } })),
    },
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

let supabase, db, storage;
beforeEach(async () => {
  vi.resetModules();
  ({ supabase } = await import('../services/supabase'));
  supabase.auth.getUser.mockReset();
  supabase.rpc.mockReset();
  db = await import('../services/db');
  storage = await import('../utils/storage');
});
const signedIn = () => supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
const signedOut = () => supabase.auth.getUser.mockResolvedValue({ data: { user: null } });

describe('shared product names', () => {
  it('asks Supabase for the barcode’s shared name when signed in', async () => {
    signedIn();
    supabase.rpc.mockResolvedValue({ data: '  Mobil 1 5W-30 5qt ', error: null });
    expect(await storage.getSharedProductName('071924145009')).toBe('Mobil 1 5W-30 5qt');
    expect(supabase.rpc).toHaveBeenCalledWith('shared_product_name', { p_barcode: '071924145009' });
  });

  it('a guest never asks', async () => {
    signedOut();
    expect(await storage.getSharedProductName('071924145009')).toBeNull();
    expect(await storage.getSharedProductSuggestions('mobil')).toEqual([]);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('an RPC error means no shared name (e.g. before the SQL is run)', async () => {
    signedIn();
    supabase.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
    expect(await storage.getSharedProductName('071924145009')).toBeNull();
    expect(await storage.getSharedProductSuggestions('mobil')).toEqual([]);
  });

  it('a thrown network error means no shared name', async () => {
    signedIn();
    supabase.rpc.mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await storage.getSharedProductName('071924145009')).toBeNull();
    expect(await storage.getSharedProductSuggestions('mobil')).toEqual([]);
  });

  it('nobody has named it → null', async () => {
    signedIn();
    supabase.rpc.mockResolvedValue({ data: null, error: null });
    expect(await storage.getSharedProductName('0071181000240')).toBeNull();
  });

  it('suggestions come back trimmed, blanks dropped', async () => {
    signedIn();
    supabase.rpc.mockResolvedValue({ data: ['Mobil 1 5W-30 5qt ', '', '  ', 'Mobil 1 0W-20'], error: null });
    expect(await storage.getSharedProductSuggestions('mobil')).toEqual(['Mobil 1 5W-30 5qt', 'Mobil 1 0W-20']);
    expect(supabase.rpc).toHaveBeenCalledWith('suggest_product_names', { p_query: 'mobil' });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/__tests__/sharedProductNames.test.js`
Expected: FAIL: `storage.getSharedProductName is not a function`.

- [ ] **Step 3: Add the db functions** (in `src/services/db.js`, after `getProductByName`)

```js
/**
 * What other Keiro drivers call this barcode — a name only, once two accounts
 * agree (supabase-shared-product-names.sql). Signed-in only.
 * @param {string} barcode
 * @returns {Promise<{ data: string|null, error: object|null }>}
 */
export async function getSharedProductName(barcode) {
  if (await noSession()) return { data: null, error: new Error('no session') };
  try {
    const { data, error } = await supabase.rpc('shared_product_name', { p_barcode: barcode });
    return { data: error ? null : (data ?? null), error };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Product names other drivers use that contain `query` (at most 8; same
 * two-account rule). Signed-in only.
 * @param {string} query
 * @returns {Promise<{ data: string[], error: object|null }>}
 */
export async function suggestProductNames(query) {
  if (await noSession()) return { data: [], error: new Error('no session') };
  try {
    const { data, error } = await supabase.rpc('suggest_product_names', { p_query: query });
    return { data: error ? [] : (data ?? []), error };
  } catch (err) {
    return { data: [], error: err };
  }
}
```

- [ ] **Step 4: Add the storage wrappers** (in `src/utils/storage.js`, after `getProductByName`)

```js
/**
 * What other Keiro drivers call this barcode, trimmed — or null (not shared
 * yet, guest, offline, or the cloud function isn't there). Never throws.
 * @param {string} barcode
 * @returns {Promise<string|null>}
 */
export async function getSharedProductName(barcode) {
  const { data } = await db.getSharedProductName(barcode);
  return typeof data === 'string' && data.trim() ? data.trim() : null;
}

/**
 * Product names other drivers use that contain `query`, trimmed, blanks
 * dropped. [] on any problem. Never throws.
 * @param {string} query
 * @returns {Promise<string[]>}
 */
export async function getSharedProductSuggestions(query) {
  const { data } = await db.suggestProductNames(query);
  return Array.isArray(data) ? data.filter(n => typeof n === 'string' && n.trim()).map(n => n.trim()) : [];
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/__tests__/sharedProductNames.test.js`
Expected: PASS (6 tests).

- [ ] **Step 6: Full suite and lint, then commit**

Run: `npx vitest run && npx eslint api src`
Expected: all pass; no ESLint problems.

```bash
git add src/services/db.js src/utils/storage.js src/__tests__/sharedProductNames.test.js
git commit -m "feat(shared-names): ask Supabase what other drivers call a barcode (name only)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The invoice form asks other drivers, offers names, and suggests while typing

**Files:**
- Modify: `src/hooks/useInvoiceForm.js`
- Modify: `src/__tests__/invoiceFlow.test.jsx`:
  - add the two storage functions to the `vi.mock('../utils/storage', …)` factory
  - add a new `describe` block
- Modify the storage mocks in `src/__tests__/easyInvoice.test.jsx` and `src/__tests__/newInvoiceScan.test.jsx`: add `getSharedProductName: vi.fn(async () => null), getSharedProductSuggestions: vi.fn(async () => [])`

**Interfaces:**
- Consumes: `getSharedProductName`, `getSharedProductSuggestions` (Task 2); the existing `scanSeqRef`, `normalizeScannedBarcode`, `isStoreMadeBarcode`, `LOOKING_UP_TEXT`.
- Produces, from `useInvoiceForm`:
  - `nameSource: 'drivers' | 'database' | null`: Easy Mode's label source; cleared when the driver types
  - `pendingName: { name: string, source: 'drivers' | 'database' } | null`: normal mode's "Is this it?"
  - `acceptPendingName()` and `rejectPendingName()`
  - `productSuggestions: string[]`: his own names first, then other drivers' names, case-insensitively deduped

- [ ] **Step 1: Write the failing tests**

1. In `src/__tests__/invoiceFlow.test.jsx`:
   - Add to the storage mock factory: `getSharedProductName: vi.fn(async () => null),` and `getSharedProductSuggestions: vi.fn(async () => []),`.
   - Add both to the storage import line.
2. Append:

```jsx
describe('useInvoiceForm — names from other drivers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    canSaveGuestEntry.mockReturnValue(true);
    getNextInvoiceNumber.mockResolvedValue(1001);
  });

  it('Easy Mode: a shared name fills the card, price empty, labeled, and no database lookup', async () => {
    getSharedProductName.mockResolvedValueOnce('Mobil 1 5W-30 5qt');
    const { result } = renderHook(() => useInvoiceForm(vi.fn(), { easy: true }));
    await act(async () => { await result.current.handleScan('071924145009', 'UPC_A'); });
    expect(result.current.productName).toBe('Mobil 1 5W-30 5qt');
    expect(result.current.price).toBe('');
    expect(result.current.nameSource).toBe('drivers');
    expect(lookupBarcode).not.toHaveBeenCalled();
  });

  it('his own catalog wins: no question, no shared lookup', async () => {
    getProductByBarcode.mockResolvedValueOnce({ name: 'Mobil oil', lastPrice: 24.99 });
    const { result } = renderHook(() => useInvoiceForm(vi.fn()));
    await act(async () => { await result.current.handleScan('071924145009', 'UPC_A'); });
    expect(getSharedProductName).not.toHaveBeenCalled();
    expect(result.current.productName).toBe('Mobil oil');
    expect(result.current.pendingName).toBeNull();
  });

  it('his own catalog still fills straight in (no question) in normal mode', async () => {
    getProductByBarcode.mockResolvedValueOnce({ name: 'Mobil oil', lastPrice: 24.99 });
    const { result } = renderHook(() => useInvoiceForm(vi.fn()));
    await act(async () => { await result.current.handleScan('071924145009', 'UPC_A'); });
    expect(result.current.price).toBe('24.99');
    expect(result.current.pendingName).toBeNull();
  });

  it('store-made codes never ask other drivers', async () => {
    const { result } = renderHook(() => useInvoiceForm(vi.fn(), { easy: true }));
    await act(async () => { await result.current.handleScan('212345678900'); });
    expect(getSharedProductName).not.toHaveBeenCalled();
  });

  it('no shared name → the database lookup, labeled as a database name in Easy Mode', async () => {
    lookupBarcode.mockResolvedValueOnce({ name: 'Coca-Cola Can, 12 fl oz', status: 'found' });
    const { result } = renderHook(() => useInvoiceForm(vi.fn(), { easy: true }));
    await act(async () => { await result.current.handleScan('049000006346'); });
    expect(getSharedProductName).toHaveBeenCalledWith('049000006346');
    expect(result.current.productName).toBe('Coca-Cola Can, 12 fl oz');
    expect(result.current.nameSource).toBe('database');
  });

  it('normal mode: a looked-up name is a question; Yes fills it, No leaves it empty', async () => {
    getSharedProductName.mockResolvedValueOnce('Mobil 1 5W-30 5qt');
    const { result } = renderHook(() => useInvoiceForm(vi.fn()));
    await act(async () => { await result.current.handleScan('071924145009', 'UPC_A'); });
    expect(result.current.productName).toBe('');
    expect(result.current.pendingName).toEqual({ name: 'Mobil 1 5W-30 5qt', source: 'drivers' });

    act(() => { result.current.acceptPendingName(); });
    expect(result.current.productName).toBe('Mobil 1 5W-30 5qt');
    expect(result.current.pendingName).toBeNull();

    lookupBarcode.mockResolvedValueOnce({ name: 'Coca-Cola Can, 12 fl oz', status: 'found' });
    await act(async () => { await result.current.handleScan('049000006346'); });
    expect(result.current.pendingName).toEqual({ name: 'Coca-Cola Can, 12 fl oz', source: 'database' });
    act(() => { result.current.rejectPendingName(); });
    expect(result.current.pendingName).toBeNull();
    expect(result.current.productName).toBe('');
  });

  it('typing over a looked-up name drops its label', async () => {
    getSharedProductName.mockResolvedValueOnce('Mobil 1 5W-30 5qt');
    const { result } = renderHook(() => useInvoiceForm(vi.fn(), { easy: true }));
    await act(async () => { await result.current.handleScan('071924145009', 'UPC_A'); });
    act(() => { result.current.setProductName('Mobil 1 High Mileage'); });
    expect(result.current.nameSource).toBeNull();
  });

  it('a late shared answer after Cancel is ignored', async () => {
    let answer;
    getSharedProductName.mockReturnValueOnce(new Promise(resolve => { answer = resolve; }));
    const { result } = renderHook(() => useInvoiceForm(vi.fn(), { easy: true }));
    let pending;
    act(() => { pending = result.current.handleScan('071924145009', 'UPC_A'); });
    await waitFor(() => expect(getSharedProductName).toHaveBeenCalled());
    act(() => { result.current.clearAddForm(); });
    await act(async () => { answer('Mobil 1 5W-30 5qt'); await pending; });
    expect(result.current.productName).toBe('');
    expect(result.current.nameSource).toBeNull();
    expect(lookupBarcode).not.toHaveBeenCalled();
  });

  it('suggestions: his own names first, then other drivers’, without repeats', async () => {
    getProductNames.mockReturnValueOnce(['Mobil oil', 'Coke can']); // read once, at mount
    getSharedProductSuggestions.mockResolvedValueOnce(['mobil oil', 'Mobil 1 5W-30 5qt']);
    const { result } = renderHook(() => useInvoiceForm(vi.fn()));
    act(() => { result.current.setProductName('mobil'); });
    await waitFor(() => expect(result.current.productSuggestions).toEqual(['Mobil oil', 'Coke can', 'Mobil 1 5W-30 5qt']), { timeout: 2000 });
    expect(getSharedProductSuggestions).toHaveBeenCalledWith('mobil');
  });

  it('under 2 characters, other drivers aren’t asked', async () => {
    const { result } = renderHook(() => useInvoiceForm(vi.fn()));
    act(() => { result.current.setProductName('m'); });
    await new Promise(r => setTimeout(r, 400));
    expect(getSharedProductSuggestions).not.toHaveBeenCalled();
  });

  it('a stale suggestion answer is ignored', async () => {
    let slow;
    getSharedProductSuggestions
      .mockReturnValueOnce(new Promise(resolve => { slow = resolve; }))  // for "mo"
      .mockResolvedValueOnce(['Mobil 1 5W-30 5qt']);                     // for "mobil 1"
    const { result } = renderHook(() => useInvoiceForm(vi.fn()));
    act(() => { result.current.setProductName('mo'); });
    await waitFor(() => expect(getSharedProductSuggestions).toHaveBeenCalledTimes(1), { timeout: 2000 });
    act(() => { result.current.setProductName('mobil 1'); });
    await waitFor(() => expect(result.current.productSuggestions).toContain('Mobil 1 5W-30 5qt'), { timeout: 2000 });
    await act(async () => { slow(['Motor oil generic']); });
    expect(result.current.productSuggestions).not.toContain('Motor oil generic');
  });
});
```

Also add `getProductNames` to the storage import (it is already in the mock factory).

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/__tests__/invoiceFlow.test.jsx`
Expected: the new block FAILS. There's no `nameSource`, `pendingName` or `productSuggestions`, and `getSharedProductName` is never called. The existing tests still pass.

- [ ] **Step 3: Implement in `useInvoiceForm.js`**

1. **Imports:** add `getSharedProductName, getSharedProductSuggestions` to the storage import.

2. **State:** after `const [lookupUnavailable, …]`, add:

```js
  // Where the add-item name came from when it wasn't his own catalog:
  // 'drivers' (other Keiro drivers) | 'database' (Open Food Facts / UPCitemdb).
  // Easy Mode labels it on the check card; cleared when he types.
  const [nameSource, setNameSource] = useState(null);
  // Normal mode: a looked-up name is offered ("Is this it?") instead of being
  // silently filled in. { name, source } | null.
  const [pendingName, setPendingName] = useState(null);
  // Other drivers' names matching what he's typing (≥ 2 characters).
  const [sharedSuggestions, setSharedSuggestions] = useState([]);
```

3. **`offerName`:** add it above `lookUpRemotely`. It uses setters only.

```js
  /**
   * A name from other drivers or a product database: Easy Mode fills the
   * check card (the card is the question); normal mode asks "Is this it?".
   */
  const offerName = useCallback((name, source) => {
    if (easy) {
      setProductName(name);
      setNameSource(source);
    } else {
      setProductName('');
      setPendingName({ name, source });
    }
    // Setters are stable; listing them keeps React Compiler's memoization.
  }, [easy, setProductName, setNameSource, setPendingName]);
```

4. **`lookUpRemotely`:** replace `if (name) {\n      setProductName(name);\n      return;\n    }` with `if (name) {\n      offerName(name, 'database');\n      return;\n    }`, and add `offerName` to its deps.

5. **`handleScan`:**
   - Add `setNameSource(null); setPendingName(null);` next to the existing `setProductName(''); setPrice('');` resets.
   - Between the store-made block and `// 3. Remote barcode sources.`, insert:

```js
    // 3. What other Keiro drivers call it (name only, once two accounts agree).
    setProductName(LOOKING_UP_TEXT);
    const shared = await getSharedProductName(barcode);
    if (seq !== scanSeqRef.current) return; // a newer scan or Cancel came first
    if (shared) {
      offerName(shared, 'drivers');
      return;
    }

```

   - Renumber the remote comment to `// 4. Remote barcode sources.`.
   - Add `offerName` to the deps.

6. **`loadItemIntoForm` and `clearAddForm`:** add `setNameSource(null); setPendingName(null);` to each.

7. **`addItem` success path:** add `setNameSource(null); setPendingName(null);` to the final reset line.

8. **Accept and reject:** add these after `clearAddForm`.

```js
  /** Normal mode "Is this it?" → Yes: use the offered name (fills his price if he has one). */
  function acceptPendingName() {
    if (!pendingName) return;
    handleProductNameChange(pendingName.name);
    setPendingName(null);
  }

  /** Normal mode "Is this it?" → No: leave the name for him to type. */
  function rejectPendingName() {
    setPendingName(null);
  }
```

9. **`handleProductNameChange`:**
   - Add `setNameSource(null);` right after `setProductName(val);`.
   - Inside the existing debounce timeout, after the `getProductByName(val)…` chain, add:

```js
      // Other drivers' names containing what he typed; a stale answer is dropped.
      if (val.trim().length >= 2) {
        getSharedProductSuggestions(val.trim()).then(list => {
          if (latestProductNameRef.current === val) setSharedSuggestions(list);
        }).catch(() => {});
      } else {
        setSharedSuggestions([]);
      }
```

10. **`productSuggestions`:** add next to `recentStores`.

```js
  // His own names first, then other drivers' names, without case-insensitive repeats.
  const productSuggestions = useMemo(() => {
    const seen = new Set();
    return [...productNames, ...sharedSuggestions].filter(n => {
      const key = n.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [productNames, sharedSuggestions]);
```

`productNames` is `const [productNames] = useState(() => getProductNames())`, read once at mount, which is why the test uses `mockReturnValueOnce` before `renderHook`.

11. **Return object:** add `nameSource, pendingName, acceptPendingName, rejectPendingName, productSuggestions,` under `// Add-item form`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/__tests__/invoiceFlow.test.jsx`
Expected: PASS (all, including 11 new).

- [ ] **Step 5: Update the other two mocks, full suite, lint, commit**

Add `getSharedProductName: vi.fn(async () => null), getSharedProductSuggestions: vi.fn(async () => []),` to the storage mocks in `easyInvoice.test.jsx` and `newInvoiceScan.test.jsx`.

Run: `npx vitest run && npx eslint api src`
Expected: all pass; no ESLint problems. If React Compiler flags `offerName`'s deps, list its setters, as Task 3 of #190 did.

```bash
git add src/hooks/useInvoiceForm.js src/__tests__/invoiceFlow.test.jsx src/__tests__/easyInvoice.test.jsx src/__tests__/newInvoiceScan.test.jsx
git commit -m "feat(shared-names): scans ask other drivers; looked-up names are offered, not forced; suggestions while typing

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The screens: Easy card source line, normal-mode "Is this it?", suggestions

**Files:**
- Modify: `src/components/invoice/ScanCheckCard.jsx` (suggestions, plus a source line under the product field)
- Modify: `src/components/invoice/NewInvoice.jsx`: product field suggestions (line ~364), plus the "Is this it?" card after the barcode row
- Modify: `src/utils/constants.js` (source label copy)
- Tests: `src/__tests__/easyInvoice.test.jsx`, `src/__tests__/newInvoiceScan.test.jsx`

**Interfaces:**
- Consumes: `nameSource`, `pendingName`, `acceptPendingName`, `rejectPendingName`, `productSuggestions` (Task 3).
- Produces:
  - `NAME_FROM_DRIVERS = 'From other Keiro drivers. Edit it if it’s wrong.'`
  - `NAME_FROM_DATABASE = 'From a product database. Edit it if it’s wrong.'`

- [ ] **Step 1: Write the failing tests**

Append to the `EasyInvoice` describe in `src/__tests__/easyInvoice.test.jsx`, and add `getSharedProductName` to its storage import:

```jsx
  it('a name from other drivers says so on the card', async () => {
    getSharedProductName.mockResolvedValueOnce('Mobil 1 5W-30 5qt');
    renderEasy();
    fireEvent.click(screen.getByText('Scan item'));
    await scan('071924145009');
    expect(await screen.findByDisplayValue('Mobil 1 5W-30 5qt')).toBeInTheDocument();
    expect(screen.getByText('From other Keiro drivers. Edit it if it’s wrong.')).toBeInTheDocument();
  });

  it('a name from a product database says so on the card', async () => {
    lookupBarcode.mockResolvedValueOnce({ name: 'Coca-Cola Can, 12 fl oz', status: 'found' });
    renderEasy();
    fireEvent.click(screen.getByText('Scan item'));
    await scan('049000006346');
    expect(await screen.findByText('From a product database. Edit it if it’s wrong.')).toBeInTheDocument();
  });
```

Append to `src/__tests__/newInvoiceScan.test.jsx`, and add `import { getSharedProductName, getSharedProductSuggestions } from '../utils/storage';`:

```jsx
describe('NewInvoice — Is this it?', () => {
  it('a name from other drivers is asked about; Yes fills the field', async () => {
    getSharedProductName.mockResolvedValueOnce('Mobil 1 5W-30 5qt');
    render(<ThemeProvider><NewInvoice onGenerated={vi.fn()} onNav={vi.fn()} onBack={vi.fn()} /></ThemeProvider>);
    fireEvent.click(document.querySelector('[data-tip="barcode"]'));
    fireEvent.click(await screen.findByText('fake-scan'));

    expect(await screen.findByText('Is this it?')).toBeInTheDocument();
    expect(screen.getByText('Mobil 1 5W-30 5qt')).toBeInTheDocument();
    expect(screen.getByText('from other Keiro drivers')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, use it' }));
    expect(screen.getByDisplayValue('Mobil 1 5W-30 5qt')).toBeInTheDocument();
    expect(screen.queryByText('Is this it?')).toBeNull();
  });

  it('No leaves the field empty to type', async () => {
    getSharedProductName.mockResolvedValueOnce('Mobil 1 5W-30 5qt');
    render(<ThemeProvider><NewInvoice onGenerated={vi.fn()} onNav={vi.fn()} onBack={vi.fn()} /></ThemeProvider>);
    fireEvent.click(document.querySelector('[data-tip="barcode"]'));
    fireEvent.click(await screen.findByText('fake-scan'));
    fireEvent.click(await screen.findByRole('button', { name: 'No, I’ll type it' }));
    expect(screen.queryByText('Is this it?')).toBeNull();
    expect(screen.queryByDisplayValue('Mobil 1 5W-30 5qt')).toBeNull();
  });

  it('typing shows other drivers’ names in the suggestions', async () => {
    getSharedProductSuggestions.mockResolvedValue(['Mobil 1 5W-30 5qt']);
    render(<ThemeProvider><NewInvoice onGenerated={vi.fn()} onNav={vi.fn()} onBack={vi.fn()} /></ThemeProvider>);
    fireEvent.change(screen.getByPlaceholderText('GMan V Cut T-Shirt'), { target: { value: 'mobil' } });
    expect(await screen.findByText('Mobil 1 5W-30 5qt', {}, { timeout: 2000 })).toBeInTheDocument();
  });
});
```

The existing `NewInvoice — scanning` tests use `onScan('0071181000240', 'EAN_13')`. That code isn't store-made, so the shared lookup runs, and it returns `null` from the default mock.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/__tests__/easyInvoice.test.jsx src/__tests__/newInvoiceScan.test.jsx`
Expected: the 5 new tests FAIL (no labels, no "Is this it?", no shared suggestions in the dropdown).

- [ ] **Step 3: Add the copy to `src/utils/constants.js`**, after `STORE_MADE_BARCODE_MESSAGE`:

```js
/** Under a looked-up name on the Easy check card (spec #188 Decision 4). */
export const NAME_FROM_DRIVERS  = 'From other Keiro drivers. Edit it if it’s wrong.';
export const NAME_FROM_DATABASE = 'From a product database. Edit it if it’s wrong.';
```

- [ ] **Step 4: ScanCheckCard**

- Import `NAME_FROM_DRIVERS, NAME_FROM_DATABASE` alongside `LOOKING_UP_TEXT`.
- Change the product `AutofillInput`'s `suggestions={form.productNames}` to `suggestions={form.productSuggestions}`.
- Directly after the `{lookingUp && …}` line, add:

```jsx
        {!lookingUp && form.nameSource && (
          <p style={{ ...s.hint, color: C.textMuted }}>
            {form.nameSource === 'drivers' ? NAME_FROM_DRIVERS : NAME_FROM_DATABASE}
          </p>
        )}
```

- [ ] **Step 5: NewInvoice**

1. Destructure `productSuggestions, pendingName, acceptPendingName, rejectPendingName` from the hook, next to `lastBarcode, productNames`.
2. Product `AutofillInput`: `suggestions={productNames}` → `suggestions={productSuggestions}`.
3. Directly after the `{lastBarcode && ( … )}` barcode-row block, add:

```jsx
            {/* A looked-up name is a question, never silently filled in (spec #188 Part B). */}
            {pendingName && (
              <div style={{ ...s.pendingCard, background: C.inputBg, borderColor: C.inputBorder }}>
                <p style={{ ...s.pendingTitle, color: C.textMuted }}>Is this it?</p>
                <p style={{ ...s.pendingName, color: C.text }}>{pendingName.name}</p>
                <p style={{ ...s.pendingSource, color: C.textMuted }}>
                  {pendingName.source === 'drivers' ? 'from other Keiro drivers' : 'from a product database'}
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={acceptPendingName} style={{ ...s.pendingYes, background: ACCENT }}>Yes, use it</button>
                  <button type="button" onClick={rejectPendingName} style={{ ...s.pendingNo, borderColor: C.inputBorder, color: C.text }}>No, I’ll type it</button>
                </div>
              </div>
            )}
```

4. Add to the `s` styles object, next to `barcodeRow`:

```js
  pendingCard:   { border: '1px solid', borderRadius: 12, padding: '12px 14px', margin: '0 0 10px' },
  pendingTitle:  { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 },
  pendingName:   { fontSize: 15, fontWeight: 700, margin: '4px 0 2px' },
  pendingSource: { fontSize: 12, margin: '0 0 10px' },
  pendingYes:    { flex: 1, height: 40, border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' },
  pendingNo:     { flex: 1, height: 40, background: 'transparent', border: '1px solid', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/__tests__/easyInvoice.test.jsx src/__tests__/newInvoiceScan.test.jsx`
Expected: PASS (all).

- [ ] **Step 7: Full suite, lint, build, commit**

Run: `npx vitest run && npx eslint api src && npm run build`
Expected: all pass; no ESLint problems; the build succeeds.

```bash
git add src/utils/constants.js src/components/invoice/ScanCheckCard.jsx src/components/invoice/NewInvoice.jsx src/__tests__/easyInvoice.test.jsx src/__tests__/newInvoiceScan.test.jsx
git commit -m "feat(shared-names): Easy card says where a name came from; normal mode asks \"Is this it?\"; shared suggestions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The privacy policy (in-app and PRIVACY.md)

**Files:**
- Modify: `src/pages/Legal.jsx`: the "What other users can see" and "Sharing of information" sections
- Modify: `PRIVACY.md`: §3 How your data is stored, §5 Sharing of information
- Test: `src/__tests__/privacyPolicy.test.jsx`

**Interfaces:** none.

- [ ] **Step 1: Write the failing test**

```jsx
/**
 * privacyPolicy.test.jsx
 *
 * Shared product names show other drivers something a driver typed, so the
 * in-app privacy policy must say so — exactly what is shared (a name, once two
 * accounts agree) and what never is — and list the barcode lookups.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '../context/ThemeContext.jsx';

vi.mock('../components/navigation/AppFooter', () => ({ default: () => null }));

import Legal from '../pages/Legal.jsx';

describe('privacy policy', () => {
  it('says what shared product names expose, and what they never do', () => {
    render(<ThemeProvider><Legal section="privacy" onOpenDrawer={vi.fn()} onNav={vi.fn()} /></ThemeProvider>);
    expect(screen.getByText(/the product name you give a barcode can be suggested to other signed-in Keiro users/i)).toBeInTheDocument();
    expect(screen.getByText(/once at least two accounts have used that name/i)).toBeInTheDocument();
    expect(screen.getByText(/your prices, quantities, stores, and which account saved it are never shared/i)).toBeInTheDocument();
  });

  it('lists the barcode lookups', () => {
    render(<ThemeProvider><Legal section="privacy" onOpenDrawer={vi.fn()} onNav={vi.fn()} /></ThemeProvider>);
    expect(screen.getByText(/its number \(only the number\) is sent to Open Food Facts and, through our server, to UPCitemdb/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/__tests__/privacyPolicy.test.jsx`
Expected: FAIL (text not found).

- [ ] **Step 3: Update `src/pages/Legal.jsx`**

Replace the `b:` text of `{ h: 'What other users can see', … }` with:

```
'Two things you create are visible to other Keiro users. Marketplace is a public noticeboard inside the app: anything you publish there — a driver listing or a store request — is readable by every signed-in Keiro user, not only the ones you are connected to. That includes the business name and phone number you publish with it, the product, the price or quantity, your notes, and, if you allowed location access, the coordinates recorded when you created it, which is what powers near-me sorting. Treat a Marketplace post as public: do not put anything in one you would not show a stranger. Product names: the product name you give a barcode can be suggested to other signed-in Keiro users who scan or type the same product, once at least two accounts have used that name. Your prices, quantities, stores, and which account saved it are never shared. Nothing else you keep is exposed to other users.'
```

Replace the `b:` text of `{ h: 'Sharing of information', … }` with:

```
'We share information only with service providers that run the app (such as Supabase, and Sentry for crash reports), or when required by law. When a barcode you scan isn't in your catalog, its number (only the number) is sent to Open Food Facts and, through our server, to UPCitemdb to look up the product's name. Any invoice you export or send (PDF, WhatsApp) is shared by you, at your direction, with recipients you choose.'
```

(The text is a JS single-quoted string: escape `'` as `\'`. Use a template literal instead if the file's other entries do.)

- [ ] **Step 4: Update `PRIVACY.md`**

- In §3, after the bullet ending "so each account can only access its own data.", add:

```markdown
- **Two exceptions — what other users can see.** Anything you publish to **Marketplace** is readable
  by every signed-in Keiro user (see the in-app policy for exactly what a post shows). And the
  **product name** you give a barcode can be suggested to other signed-in Keiro users who scan or
  type the same product, once at least two accounts have used that name. Your prices, quantities,
  stores, and which account saved it are never shared.
```

- In §5, add a bullet after "With service providers":

```markdown
- **Barcode lookups.** When a barcode you scan isn't in your catalog, its number (only the number)
  is sent to Open Food Facts and, through our server, to UPCitemdb to look up the product's name.
```

- [ ] **Step 5: Run the test to verify it passes, full suite, lint, commit**

Run: `npx vitest run src/__tests__/privacyPolicy.test.jsx && npx vitest run && npx eslint api src`
Expected: all pass.

```bash
git add src/pages/Legal.jsx PRIVACY.md src/__tests__/privacyPolicy.test.jsx
git commit -m "docs(privacy): say what shared product names expose, and list the barcode lookups

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Verify on the real screens, docs, PR

**Files:**
- Modify: `CLAUDE.md`, with a Key Files row for `supabase-shared-product-names.sql`
- Scratch script: `$SCAN/shared-names.cjs` (`$SCAN` as in #190)

- [ ] **Step 1: Build, serve, and check both screens with the RPCs answered by the test**

`npm run build && npx vite preview --port 4174 --strictPort` (background). Then create `$SCAN/shared-names.cjs`:

```js
// Shared names on the real screens, as a guest: a guest (no session) must never
// call the shared RPCs (counted below; the routes would answer if it did), and a
// name from the product database shows the Easy card's source line and normal
// mode's "Is this it?". The signed-in shared path is covered by Tasks 3–4's tests.
const { chromium } = require('/Users/muti/.npm/_npx/d71ea5ed3eabc9b3/node_modules/playwright');
const [S, SITE, ROUTE_SITE] = process.argv.slice(2);
(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${S}/oil.y4m`] });
  for (const easy of [true, false]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['camera'], serviceWorkers: 'block' });
    const page = await ctx.newPage();
    await page.route('**/rest/v1/rpc/shared_product_name', r => r.fulfill({ json: 'Mobil 1 5W-30 5qt (shared)' }));
    await page.route('**/rest/v1/rpc/suggest_product_names', r => r.fulfill({ json: ['Mobil 1 0W-20 5qt (shared)'] }));
    await page.route(u => u.pathname === '/api/barcode', async route => {
      const u = new globalThis.URL(route.request().url());
      await route.fulfill({ response: await route.fetch({ url: ROUTE_SITE + u.pathname + u.search }) });
    });
    await page.addInitScript((e) => { if (e) { localStorage.setItem('inv_easy_mode', 'true'); localStorage.setItem('inv_tour_seen_easy', '1'); } }, easy);
    await page.goto(SITE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    for (const t of ['Try as guest', 'Delivery Driver', 'Get Started']) { await page.locator(`button:has-text("${t}")`).first().click(); await page.waitForTimeout(1100); }
    await page.locator('button:has-text("Skip")').first().click({ timeout: 3000 }).catch(() => {});
    console.log(easy ? 'easy:' : 'normal:');
    let rpcCalls = 0;
    page.on('request', r => { if (/rpc\/(shared_product_name|suggest_product_names)/.test(r.url())) rpcCalls++; });
    await page.locator('[data-qs="new-invoice"]').filter({ visible: true }).first().click();
    await page.waitForTimeout(800);
    if (easy) {
      await page.locator('[data-qs="easy-scan"]').click();
      await page.waitForFunction(() => { const i = document.querySelector('input[placeholder="Product name"]'); return i && i.value && !i.value.startsWith('Looking'); }, null, { timeout: 30000 });
      console.log('  card name:', await page.locator('input[placeholder="Product name"]').inputValue());
      console.log('  label:', await page.locator('text=/From (other Keiro drivers|a product database)/').first().innerText().catch(() => '(none)'));
    } else {
      await page.locator('[data-tip="barcode"]').click();
      await page.waitForSelector('text=Is this it?', { timeout: 30000 });
      console.log('  normal: "Is this it?" shown for', await page.locator('text=Is this it?').locator('xpath=..').innerText());
    }
    console.log('  shared RPC calls as a guest:', rpcCalls);
    await page.screenshot({ path: `${S}/shared-${easy ? 'easy' : 'normal'}.png` });
    await ctx.close();
  }
  await browser.close();
})();
```

Run: `node $SCAN/shared-names.cjs $SCAN http://localhost:4174 https://keiro-mutammimas-projects.vercel.app`
Expected:
- **Easy:** the card name is the UPCitemdb name and the label is "From a product database…".
- **Normal:** "Is this it?" shows the database name with "from a product database".
- **Both:** `shared RPC calls as a guest: 0`. Guests are signed-out, so they never ask other drivers.

Look at `shared-easy.png` and `shared-normal.png` at 390px.

- [ ] **Step 2: CLAUDE.md**

After the `api/barcode.js` Key Files row, add:

```markdown
| `supabase-shared-product-names.sql` | `shared_product_name(barcode)` / `suggest_product_names(query)`: other drivers' product names (name only, once 2 accounts agree, signed-in only). Run via `docs/COWORK_SHARED_PRODUCT_NAMES.md`. The app treats a missing function as "no shared name" |
```

- [ ] **Step 3: Final checks, commit, push, PR**

Run: `npx vitest run && npx eslint api src && npm run build`
Expected: all pass.

```bash
git add CLAUDE.md
git commit -m "docs: shared product names

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -u origin feature/shared-product-names
```

Open the PR against main. The body covers:
- what's shared and what never is
- the SQL validated on PGlite (14 checks)
- the cowork prompt (`docs/COWORK_SHARED_PRODUCT_NAMES.md`)
- the privacy-policy change
- the fact that nothing is shared until a second account names the same product

Close #188 with a comment pointing at the new PR (its spec is merged into this branch). Do not merge.

- [ ] **Step 4: After the owner's cowork run, check from outside**

```bash
set -a; . ./.env; set +a
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$VITE_SUPABASE_URL/rest/v1/rpc/shared_product_name" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" -d '{"p_barcode":"071924145009"}'
```

Expected:
- `401`, or a `42501` permission-denied body: the function exists and refuses anonymous callers.
- Before the SQL is run, it returns 404 / `PGRST202`.
