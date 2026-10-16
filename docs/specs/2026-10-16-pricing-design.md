# Pricing: a free plan and Keiro Pro ($4.99 a month)

**Status**
- [x] Design agreed with the owner in chat (2026-10-16)
- [x] Spec reviewed by the owner (2026-10-16)
- [ ] Implementation plan written
- [ ] Built test-first, verified on the real screens
- [ ] Stripe test-mode checks passed (pay, cancel, failed renewal, yearly)
- [ ] Rolled out in the order below; live payments on

**Scope:** drivers. Store-owner accounts are unchanged (everything stays free; no Upgrade anywhere).
Guests are unchanged. "Pay invoices through Keiro + a service fee" is a later phase (end of this
file), not part of this work.

---

## Why

Keiro is meant to become a real business, so paying has to be clearly worth it. Today nothing is
paid. Guests are capped at 5 saved entries; accounts are free and unlimited. The sign-up flow
already shows a "Pick a plan" screen (`OnboardingFlow.jsx`, `PLANS`): Basic "free during beta, 50
invoices/month, 3 connections", Pro "$12/mo, coming soon", Business "$29/mo, coming soon". None of
it is enforced, and none of it matches what we're building, so it is replaced.

The driver who uses Keiro today (the owner's dad) stays free.

## Decisions (owner, 2026-10-16)

| Topic | Decision |
|---|---|
| Who pays | Not split by role: any account *can* pay. In practice only drivers have something to buy |
| Plans | **One free plan + one paid plan (Pro)** |
| Free | **Easy Mode + 20 new invoices a calendar month** |
| Pro | Unlimited invoices, normal mode, signing on the phone |
| Price | **$4.99 a month**, or **$49.99 a year** (2 months free). No trial |
| Store owners | Everything free, as today. They see no Upgrade until Pro gives them something |
| Payments | **Stripe** (Vercel Marketplace integration), web checkout. The iPhone app is sideloaded, so no Apple in-app purchase |
| Owner's switch | The owner can mark an account **Pro free forever** (his dad) or **Pro until a date** (someone who paid cash/Zelle) |
| Approach | Stripe's payment page + a server-side Pro record + the server counts invoices as a backstop; the phone enforces the limit, offline included |
| Later | Stores paying invoices through Keiro with a service fee on top (Stripe Connect), designed separately once stores are connected |

---

## 1. Plans and limits

**Free** (any account, no card)
- **Drivers:** Easy Mode with **20 new invoices per calendar month** (the driver's local month;
  resets on the 1st). Everything Easy Mode has today stays free: scanning, remembered prices,
  other drivers' product names, Print / Share and Download PDF, Stores (balances), Reports,
  Products, inviting stores, reminders.
- **Signatures:** the signature lines print blank, to sign by hand. No signing on the phone.
- **Store owners:** everything, as today.
- **Guests** (no account): unchanged — 5 saved entries, then "make a free account".

**Pro — $4.99 a month or $49.99 a year**
- Unlimited invoices.
- Normal mode: the Home dashboard, the full invoice form (customer, phone, address, payment
  method, notes), Store Info, Notes, Marketplace, My Listings.
- Signing on the phone.

**Why "sending" isn't paid:** on an iPhone, Print lives inside the Share menu, so blocking digital
sending would also block printing. Print / Share stays free; signing on the phone is the paid part.

**What counts toward the 20**
- Every **new** invoice saved, including **Duplicate**.
- Editing an existing invoice does not count.
- **Deleting an invoice does not give it back** (otherwise make → share → delete is unlimited).

**At the limit**
- From 15 used: "5 free invoices left this month" (the number counts down).
- At 20: **+ New** and **Duplicate** open the limit sheet: "You've used your 20 free invoices this
  month. They reset Nov 1." — **Upgrade** / **Not now**.
- Everything already made stays usable: view, share, print, mark paid, edit, reminders.

**When Pro ends** (cancelled, or every renewal retry failed): Pro lasts until the end of the paid
period, then the account is Free and back in Easy Mode. **Nothing is deleted.** Invoices made in
normal mode keep showing their full details and any signatures (read-only).

**At launch:** the owner's dad is set to free forever (rollout step 1). Every other existing account
is Free. A free driver who was in normal mode is moved to Easy Mode with a one-time note (section 4).

## 2. Paying

**Where Upgrade appears:** the limit sheet and the "N left" line, **Settings → Plan**, the locked
Easy Mode switch, the sign-up plan screen, and the "sign on the phone" line on an invoice.

**The flow**
1. **Upgrade sheet** (one shared component): what Pro adds (three lines), **Monthly $4.99** /
   **Yearly $49.99 — save $9.89**, **Continue**. A guest sees "Make a free account first" instead.
2. **Continue** asks `api/checkout` for a Stripe Checkout page tied to this account and opens it —
   on the iPhone in the in-app browser (`@capacitor/browser`, the same one Google sign-in uses), on
   the web in the same tab. Stripe's page shows Keiro's logo and colors (Stripe branding settings)
   and takes card, **Apple Pay** and Google Pay.
3. On success Stripe sends him to `https://keiro-mutammimas-projects.vercel.app/upgrade/done`. Inside the iPhone app that page
   hands back to Keiro through `keiro://upgrade-done` (the scheme Google sign-in already
   registers); on the web it is the app itself. Cancel goes to `/upgrade/cancel` the same way.
4. The app shows **"Finishing up…"** and re-reads the plan (Stripe's confirmation can lag a few
   seconds; retry for up to 30 s, then "We'll finish this in the background — check Settings →
   Plan"). Then **"You're on Pro."** and an offer **"Switch to normal mode?"** — never switched
   automatically.
5. Stripe emails the receipt.

**Managing it:** Settings → Plan → **Manage plan** asks `api/billing-portal` for Stripe's customer
portal: cancel, switch monthly ↔ yearly, change card, past receipts. Cancelling keeps Pro until the
end of the paid period.

**A card that fails at renewal:** Stripe retries for about two weeks and emails him. Pro stays
during the retries. Keiro shows a banner on Route and a red line in Settings → Plan: "Your card
didn't go through. Update it to keep Pro." → **Update card** (the portal). If every retry fails, the
subscription ends and he is Free.

**The owner's switch** (a cowork prompt, like other Supabase dashboard work — no admin screen yet):
- **Free forever:** Settings shows "Pro (free)", no Manage button.
- **Pro until a date:** Settings shows "Pro until Dec 1"; after that date the account is Free.
- Refunds: from the Stripe dashboard (a refund with cancel-now ends Pro through the webhook).

**Owner's one-time setup (rollout step 2):** create the Stripe account through the Vercel
Marketplace integration (business details + a bank account for payouts); turn on branding, the
customer portal (cancel, switch between the two prices, update card) and the receipt emails;
register the webhook endpoint. Everything runs on Stripe test mode first. Sales tax collection is
off at launch (Stripe can add it later — ask an accountant once real money comes in).

**Privacy policy and Terms** (in-app `Legal.jsx`, `PRIVACY.md`, `TERMS.md`): Stripe takes Pro
payments and Keiro never sees or stores card numbers; what Keiro keeps (plan, renewal date, Stripe
customer number, this month's invoice count); Pro renews until cancelled, cancel anytime, Pro lasts
to the end of the paid period. Today's text says "the app does not process payments", which stops
being true.

**App Store:** this works because the app is sideloaded. If Keiro goes on the App Store, Apple's
in-app purchase rules must be revisited before submitting.

## 3. The Pro record, the count, and offline

**Tables** (new checked-in SQL file, idempotent like the others; run through a cowork prompt):
- **`subscriptions`** — one row per paying or switched account: `user_id` (PK, → `auth.users`,
  cascade), `source` (`'stripe'` | `'manual'`), `status` (Stripe's subscription status, or
  `'active'` for manual), `pro_until` (timestamptz; **null with `source='manual'` = forever**),
  `interval` (`'month'` | `'year'`, Stripe only), `cancels` (cancelled: Pro ends at `pro_until`
  instead of renewing), `stripe_customer_id`, `stripe_subscription_id`, `updated_at`.
- **`invoice_usage`** — `user_id`, `month` (first day of the UTC month), `count`; PK
  (`user_id`, `month`).
- **RLS:** a user can **read only their own rows** in both tables and **write neither**. Only the
  server (service role, from the webhook) and the owner (SQL) write `subscriptions`; only the
  trigger writes `invoice_usage`.

**Who is Pro** — `is_pro(uid)`: a `subscriptions` row where
- `source = 'manual'` and (`pro_until` is null or `pro_until > now()`), or
- `source = 'stripe'` and `status in ('active', 'past_due')` and `pro_until > now()`
  (`past_due` = renewal retries in progress; `pro_until` = the end of the paid period).

**The server count and backstop** (triggers on `invoices`):
- **Only this month's invoices count.** An inserted invoice counts (and can be refused) only when
  its own `created_at` falls in the current UTC month. Uploads of older invoices — a guest's
  history moving into a new account, a restored backup, an invoice made offline last month —
  never count and are never refused. (Backdating `created_at` needs a modified app, the same
  accepted gap as the feature locks below.)
- **AFTER INSERT:** add 1 to this account's `invoice_usage` for the current UTC month. AFTER
  INSERT fires only for rows actually inserted, so the app's upsert of an existing invoice (an
  edit) never counts. Deletes never subtract. Pro accounts' invoices count too, so a driver whose
  Pro ends mid-month is already past 20 for the rest of that month.
- **BEFORE INSERT:** if the account is not Pro and this month's count is already **25**, refuse
  with the message `KEIRO_FREE_LIMIT`. **It must first let through an upsert of an invoice that
  already exists** (same `user_id` + `invoice_number`): Postgres fires BEFORE INSERT triggers on
  `insert … on conflict do update` even when the row ends up updated, and an over-limit free
  driver must still be able to edit and mark old invoices paid.
- The 5 spare (25 vs 20) absorb offline invoices that upload after the 1st, the UTC vs local month
  edge, and two phones used at once. Normally only tampering reaches it.

**`my_plan()`** — one RPC the app calls: `{ pro, source, status, pro_until, interval, cancels,
used_this_month, month, free_limit: 20 }` for the signed-in account (reads only the caller's
rows; `month` is the UTC month `used_this_month` belongs to).

**Server functions** (Vercel Functions in `api/`, next to `api/barcode.js`; Node.js runtime):
- **`api/checkout`** — POST, `Authorization: Bearer <Supabase access token>`, body
  `{ interval: 'month' | 'year' }`. Verifies the token with Supabase, reuses the account's Stripe
  customer if it has one, creates a Checkout Session (`mode: 'subscription'`,
  `client_reference_id` = user id, the price for the interval, success/cancel URLs from
  section 2), returns `{ url }`. Refuses without a valid session, and refuses an account that
  already has an active Stripe subscription or is free forever. An account on "Pro until a date"
  **may** subscribe (someone who paid cash moving to card).
- **`api/stripe-webhook`** — verifies Stripe's signature (raw body) and rejects anything unsigned
  or forged. Handles `checkout.session.completed` and `customer.subscription.created / updated /
  deleted`. **On every event it re-reads the subscription from Stripe and writes its current
  state** to `subscriptions` (upsert by user id), so out-of-order and repeated events are
  harmless. A **free-forever** row is never overwritten by Stripe; a "Pro until a date" row is
  replaced by the Stripe state when that account subscribes.
- **`api/billing-portal`** — POST with the same token; opens the portal for **that account's own**
  Stripe customer; refuses if it has none.
- **Secrets stay on the server:** the Stripe secret key, webhook secret, the two price ids and the
  Supabase service-role key live in Vercel environment variables (the Stripe ones come from the
  Marketplace integration). Nothing secret ships in the app.

**The app's side** — `src/utils/plan.js`, the one reader (like `easyMode.js`):
- Caches `my_plan()` with the time it was fetched. Fetched at launch, when the app returns to the
  foreground, and after checkout. The cache is **left out of backup/restore** (like the
  Marketplace keys) so a restored backup can't carry someone else's Pro.
- **Offline:** a cached Pro stays Pro until **3 days past `pro_until`**, so a paying driver is never
  locked out for lack of signal. No cache at all → treated as Free.
- **Its own count:** the phone counts new invoices it saves this local month (including ones still
  waiting to upload). The count shown and enforced is the larger of the phone's count and the
  server's `used_this_month` (when both are for the same month).
- `easyModeFor(role)`: a free driver is **always** in Easy Mode, whatever the setting says.
- The current `inv_plan` value (`'basic'` from the old plan screen) is ignored and replaced.

**The sync queue and the backstop:** an upload refused with `KEIRO_FREE_LIMIT` is **kept, never
deleted**, and does **not** use up the queue's 5 tries. It is held with "Upgrade to upload" in the
sync banner and uploads automatically once the account is Pro or the month changes.

**Not enforced on the server:** normal mode and signing on the phone are switched in the app only.
Getting around that means modifying a sideloaded app, and they cost nothing to serve — unlike
invoices.

**Unchanged:** store owners create no invoices, so they are never counted; guests stay local-only.

## 4. The screens

- **Upgrade sheet** — section 2, step 1. Portaled bottom sheet (centered dialog on desktop) like
  the other sheets.
- **Sign-up plan screen** — `OnboardingFlow`'s `PLANS` become two cards: **Free** (Easy Mode, 20
  invoices a month) and **Pro** ($4.99 a month or $49.99 a year). **Start free** is selected by
  default; picking Pro opens the Upgrade sheet once the account exists. Store owners skip this
  screen (the role is chosen on the step before it).
- **New drivers start in Easy Mode** and get the Easy tour (today they start in normal mode).
- **Settings → Plan** (drivers only), one of:
  - Free: "12 of 20 invoices used this month · resets Nov 1" + **Upgrade**
  - Pro: "Renews Nov 16 · $4.99 a month" (or "Ends Nov 16" after cancelling) + **Manage plan**
  - "Pro (free)" or "Pro until Dec 1" (the owner's switch)
  - Card failing: a red line "Your card didn't go through" + **Update card**
- **Easy Mode switch** — Free: shown on, with a small lock; tapping opens the Upgrade sheet titled
  "Normal mode is part of Pro". Pro: works as today.
- **The limit** — from 15 used, a quiet line on the Easy invoice screen: "5 free invoices left this
  month". At 20, **+ New** and **Duplicate** open the limit sheet (section 1).
- **Signing on the phone, Free** — where the two signature pads are, the invoice screen shows
  "Signature lines print blank, to sign by hand. Sign on the phone with Pro" + a small Upgrade
  link. Existing signatures still show, read-only.
- **After paying** — "Finishing up…", "You're on Pro.", "Switch to normal mode?".
- **One-time notes:**
  - Pro ended: "Your Pro plan ended. You're back on Free: Easy Mode, 20 invoices a month. Nothing
    was deleted."
  - Launch, a free driver who was in normal mode: "Keiro now has a free plan and a Pro plan.
    You're on Free, so you're in Easy Mode. Settings → Plan to upgrade."
  - Card failing: the banner on Route (section 2).
- **Tour:** the Easy tour's finish text gains "You get 20 free invoices a month. Settings → Plan
  shows how many are left." (`tourModes.test.jsx` pins the text.)
- **Store owners:** no Plan row, no Upgrade, no limit lines.
- **Copy and prices** (`$4.99`, `$49.99`, `save $9.89`, 20, 15, every message above) live in
  `src/utils/constants.js`. The Stripe price ids are server-side only.

## Testing

**Unit tests, written first (Vitest, no `.env`):**
- **Plan logic:** Stripe `active` / `past_due` / cancelled-but-paid-up / ended; manual forever;
  manual until a date (before and after); offline grace (2 days past → Pro, 4 days past → Free);
  no cache → Free.
- **The count:** phone vs server merged (larger wins, same month only); resets on the local 1st;
  delete doesn't give one back; Duplicate counts; edit doesn't.
- **Locks:** a free driver is always in Easy Mode; the switch opens the Upgrade sheet; signature
  pads replaced (existing signatures shown); limit line from 15; limit sheet at 20 on + New and
  Duplicate; store owners and guests see none of it.
- **Sync queue:** a `KEIRO_FREE_LIMIT` refusal is held, keeps its tries, shows "Upgrade to upload",
  and uploads once Pro.
- **Server functions** (Stripe and Supabase faked): unsigned/forged webhook → 400 and nothing
  written; each handled event writes the right row; the same event twice → same row; events out of
  order → final state; a free-forever row is never overwritten, a "Pro until a date" row is
  replaced on subscribing; checkout and portal refuse a missing or invalid token and never open
  another account's customer; checkout refuses an active Stripe subscriber and a free-forever
  account, and allows "Pro until a date".
- **Screens:** Settings → Plan in every state; the sign-up plan screen; the Upgrade sheet's two
  prices.

**SQL, in the local PGlite harness used for shared product names:** usage +1 on a new invoice; an
upsert of an existing invoice counts nothing and is never refused; delete never subtracts; a free
account is refused on the 26th new invoice of the month and allowed again next month; Pro, manual
forever and manual-until-future accounts are never refused; manual-until-past is; users read only
their own rows and can't write either table; `my_plan()` returns only the caller's data.

**Stripe test mode, before any real money:** monthly with a test card; yearly; Manage plan →
cancel (Pro until period end, then Free); a renewal that fails (Stripe test clock fast-forward) →
past_due banner → ends → Free. Each checked in the app and in `subscriptions`.

**On the real screens** (headless Chromium at 390px, as before): a free driver reaching 15 and 20;
the Upgrade sheet; every Settings → Plan state; the sign-up plan screen.

**On the owner's phone:** one test-mode upgrade through the in-app browser with Apple Pay, back to
the app via `keiro://upgrade-done`.

## Rollout order (must be followed)

1. **SQL via a cowork prompt:** the tables, `is_pro`, `my_plan`, the triggers — and **the owner's dad
   set to free forever** (by his account email). Verify with an anon probe (no read access) and a
   signed-in `my_plan()` call.
2. **Stripe setup (owner):** account through the Vercel Marketplace, products and the two prices,
   branding, portal, receipts, webhook endpoint — **test mode**.
3. **Server functions** deployed with test keys; run the Stripe test-mode checks.
4. **The app update with the locks** (web + OTA). **Only after step 1**, or the dad's account falls
   to Free and is moved to Easy Mode.
5. **Switch Stripe to live** (live keys, live webhook, live prices).

## Out of scope (later)

- **Paying invoices through Keiro with a service fee** (owner's long-run model, like Uber Eats /
  DoorDash): a store pays a driver's invoice through a link instead of cash or check; Stripe Connect
  splits the money — the driver gets the invoice amount, Keiro keeps a fee. Notes for that design:
  every paid driver signs up once with Stripe (name, date of birth, last 4 of SSN, bank account);
  card fees on large invoices are high (≈ $15 on $500) while bank payments (ACH) are ≈ 0.8% capped
  at $5; adding a fee on top of a card payment ("surcharging") is capped, banned in a few states and
  never allowed on debit cards; it is a **service fee**, never called a tax. Most stores pay in cash
  or by check today, so this earns nothing until that changes.
- What Pro gives store owners.
- An admin screen for the owner's switch (cowork prompts for now).
- Sales tax collection, coupons, trials, more than one paid plan, team / multi-driver accounts.
- Apple in-app purchase (only if Keiro goes on the App Store).
