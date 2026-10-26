# Account deletion inside the app

**Status**
- [x] Design written (2026-10-26)
- [ ] Owner decisions answered (§5)
- [ ] Owner ran the read-only foreign-key check (§3) and pasted the result
- [ ] SQL written + validated locally (PGlite harness, like pricing)
- [ ] Owner ran the SQL via a cowork doc, and it was probed
- [ ] Client built test-first, merged
- [ ] Checked with a throwaway `+tag` account on a real phone

**Why now:** Apple App Review guideline 5.1.1(v): an app that lets people create an account must
let them **start deleting that account from inside the app**. Deactivating it isn't enough, and
neither is "email us", which is what Keiro offers today (Settings → Privacy, `PRIVACY.md` §
retention). TestFlight internal testing doesn't enforce this, but the public App Store release
will.

**Scope:** signed-in drivers and store owners. Guests have no account; Sign out already wipes their
data.

---

## 1. What the user sees

Settings → Security & Permissions → **Delete account** (red text, the last row, below Switch
Role; also reachable from the Profile page). Apple wants it easy to find, so it shouldn't sit only
inside the Privacy text.

1. A sheet: **"Delete your Keiro account?"**
   - "This deletes your account and everything in it: invoices, payments, signatures, products,
     stores, notes and orders. It can't be undone."
   - Driver with active connections: "Stores you're connected to (N) lose the invoices you sent
     them." Store owner: "Drivers you're connected to (N) lose the orders you sent them."
   - Pro through the owner's switch: "Your Pro plan ends." (No payments exist yet. Once they do,
     a paid plan must be cancelled in Apple's or Stripe's settings first; see §6.)
   - "Download a backup first" link → the existing Backup export (`useBackup`).
2. Type **DELETE** to enable the red button. Not a password: Google sign-in accounts have none.
3. **Delete account** → spinner → "Your account was deleted." → the app reloads to the welcome
   screen with nothing on the phone.

Offline, or the server refuses: "Couldn't delete your account. Nothing was deleted. Try again with
a connection." Nothing local is wiped unless the server confirms.

## 2. How it works

**Recommended: one SECURITY DEFINER function, `delete_my_account()`**, called with
`supabase.rpc('delete_my_account')`. This is the same pattern as `redeem_connection`.

```
delete_my_account():
  uid := auth.uid();  if null → raise 'not signed in'
  delete the user's rows in every table that does NOT cascade from auth.users (§3)
  delete from auth.users where id = uid;   -- cascades the rest, plus Supabase's own
                                           -- identities / sessions / refresh tokens
```

- `revoke all … from public, anon; grant execute … to authenticated`. It only ever touches
  `auth.uid()`'s rows, so there's no parameter to abuse.
- The app then wipes local data exactly like sign-out (`clearAccountLocalData` in `auth.js`,
  through the `useSafeSignOut` path but skipping its "upload first" step, since there's nothing
  to keep) and reloads.

**Alternative (not recommended now): a Vercel Function** `api/delete-account.js` calling
`auth.admin.deleteUser()` with the **service-role key** stored in Vercel. This is Supabase's
documented admin path, but it puts a key that bypasses every RLS policy into a second place. That
is a bigger risk than the SQL function for no gain today. It becomes necessary only for Sign in
with Apple (§6).

## 3. What gets deleted, and the one unknown

Tables whose SQL is in this repo already cascade on `auth.users` deletion:
`profiles`, `connections` (both sides + `invited_by`), `connection_orders` (both sides),
`marketplace_listings`, `marketplace_demand`, `invoice_signatures`, `subscriptions`,
`invoice_usage`. `invoices.store_user_id` is `on delete set null`.

**Unknown, because they were made in the dashboard before the repo kept SQL:** `invoices`,
`invoice_items`, `invoice_payments`, `products`, `stores`, `so_orders`, `so_drivers`,
`so_bridge_requests`, `connection_requests`, `order_line_items`. If any of them has a `user_id`
with **no** foreign key, or one without `on delete cascade`, deleting the auth user either fails
(FK without cascade) or leaves the data orphaned (no FK). Either way the function must delete
those rows itself.

**Owner: run this read-only query** in the SQL Editor and paste the result. It changes nothing:

```sql
select c.table_name,
       c.column_name,
       tc.constraint_name,
       rc.delete_rule              -- CASCADE / SET NULL / NO ACTION / null = no FK at all
from information_schema.columns c
left join information_schema.key_column_usage k
  on k.table_schema = c.table_schema and k.table_name = c.table_name and k.column_name = c.column_name
left join information_schema.table_constraints tc
  on tc.constraint_name = k.constraint_name and tc.constraint_type = 'FOREIGN KEY'
left join information_schema.referential_constraints rc
  on rc.constraint_name = tc.constraint_name
where c.table_schema = 'public'
  and c.column_name in ('user_id', 'store_user_id', 'driver_user_id', 'invited_by', 'requester_id', 'target_id', 'id')
  and c.table_name not in ('profiles')
order by c.table_name, c.column_name;
```

The function is written from that result, not guessed.

## 4. Testing

- **SQL:** the local PGlite harness the pricing work used (an `auth.users` stand-in plus every
  table). Two accounts connected, with invoices, orders and payments. Delete one, then check:
  every row of theirs is gone, the other account's own rows are untouched, and calling it as anon
  fails.
- **Client:** Vitest for the sheet (the DELETE gate, the offline error leaving local data in place,
  the success wipe), following `safeSignOut.test.jsx`.
- **Real:** one throwaway `alomonds+del1@gmail.com` account, connected to another `+tag` account.
  Delete it on a phone, then probe that its rows are gone and the other account still works.

## 5. Decisions for the owner

1. **A connected store's copy of a deleted driver's invoices.** Shared invoices are the driver's
   own rows that the store can read, so deleting the driver removes them from the store's billing
   history.
   - **(a) Delete them (recommended for v1).** Simple, fully honours "delete my data", and the
     sheet warns the driver.
   - (b) Keep a copy for the store. That needs a store-owned copy table and a privacy-policy
     change (keeping a deleted person's data as the store's business record). It's real work, and
     worth it only if stores complain.
2. **Immediate deletion, or a 30-day grace period?** Recommended: immediate. A grace period needs a
   "pending deletion" state, a scheduled job and a cancel path. Apple accepts either.
3. **Where the button lives:** Settings → Security & Permissions plus the Profile page
   (recommended), or Settings only.

## 6. Later, tied to other work

- **Sign in with Apple:** Apple requires apps that use it to **revoke the user's Apple tokens** on
  account deletion (a server call signed with the app's Apple key). That needs the server-side
  function from §2's alternative. Build it then, not now.
- **Paid plans:** Apple requires the deletion flow to tell a subscriber how to cancel (Apple
  subscriptions are cancelled in iOS Settings, not by deleting the account). Add that line to the
  sheet when payments ship.
- **`PRIVACY.md`, `TERMS.md` and the Settings privacy text** change from "email us" to "Settings →
  Delete account". That ships with the feature.
