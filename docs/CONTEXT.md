# Keiro — Project Context Brief

> A standalone primer on what Keiro is, how it's built, and how it all fits together.
> Paste this into a fresh AI chat (or hand it to a new contributor) to get full context fast.
> Kept high-level + structural on purpose — the code is the source of truth for specifics.

---

## 1. What Keiro is (in one paragraph)

Keiro is a **mobile-first PWA that connects delivery drivers with the retail stores they supply.** It
started as a driver's invoicing tool ("InvoiceGo" / "InvoGo") and grew into a two-sided platform.
**Drivers** create/share invoices, track who owes them money, log payments, capture delivery
signatures, and manage their stores. **Store owners** place delivery requests to connected drivers,
track those orders from pending → delivered, confirm receipt, and view the invoices their drivers
bill them. The two sides link via **invite codes** and communicate through a shared connection layer
backed by Supabase. It's built for non-technical users on phones (think: a delivery driver doing 30
stops a day) — so simplicity, speed, and offline resilience matter more than feature density.

> **Naming history (important):** The app was renamed **InvoiceGo/InvoGo → Keiro**. Because of that
> legacy: every localStorage key is prefixed **`inv_`**, the top navigation component is named
> **`BottomNav.jsx`** (it's actually the *top* nav), and the old `lib/` folder is now **`services/`**.
> The displayed version is **"v5.9"** (hardcoded in `AppFooter.jsx`); `package.json` version is
> `0.0.0`; the real build version is a git hash in `public/version.json`.

---

## 2. The product model — two roles

Every account picks a role on first launch, stored in `localStorage['inv_user_role']` as `'driver'`
or `'store_owner'`. The role is switchable anytime from the nav drawer (a Driver/Owner toggle) and
from Settings. Each role sees a **different 4-tab strip**:

**Driver** tabs: `home` · `route` · `stores` · `reports`
- **home** — dashboard: today's revenue/deliveries/pending, 7-day revenue bar chart, paid/unpaid/overdue summary, best store
- **route** — invoice history + new-invoice creation (the driver's main workspace; "Route" = their delivery route)
- **stores** — per-store outstanding balances, store map/contacts, "Connect a store" invite
- **reports** — Today/Week/Month/Year analytics, End of Day summary

**Store Owner** tabs: `so-home` · `so-orders` · `so-drivers` · `so-invoices`
- **so-home** — dashboard: pending/accepted/delivered counts, inventory pulse, quick actions
- **so-orders** — place + track delivery requests
- **so-drivers** — manage driver connections + local driver contacts
- **so-invoices** — read-only billing: invoices their connected drivers generated for them

The two roles connect: a store invites a driver (or vice versa) with an unguessable code/link; once
linked, a store's order lands in the driver's Route tab, and the driver's invoice for that store
flows back to the store's Invoices tab.

---

## 3. Tech stack (exact)

| Layer | Choice |
|---|---|
| UI | **React 19.2** (function components + hooks only) |
| Build | **Vite** (PWA) |
| Styling | **Inline styles only** — no Tailwind, no CSS modules, no CSS-in-JS. Colors from `src/theme.js`. |
| Backend/Auth/DB | **Supabase** (`@supabase/supabase-js` 2.x) — Postgres + Row-Level Security + phone-OTP auth. Anon key only on the client. |
| Local persistence | **localStorage** (every app feature works offline; cloud is best-effort sync) |
| PDF | **jsPDF 4.x + jspdf-autotable** (lazy-loaded only at generation time) |
| Barcode scan | **html5-qrcode** (lazy-loaded) |
| Deploy | **Vercel** |
| Defaults | Dark mode default; max content width **480px** centered on desktop; viewport `100dvh` |

Scripts: `npm run dev` (Vite dev server, port 5173), `npm run build` (must pass before any PR),
`npm run lint` (ESLint).

---

## 4. Architecture

### 4a. Navigation — two systems
- **Tab pages** (4 per role): rendered in a **4× wide horizontal flex strip** inside `App.jsx`. The
  user swipes or taps the top nav to move between them. **All four tab panels are mounted in the DOM
  at once** — they're just translated horizontally. (This matters: an element on a non-visible tab
  still has a DOM rect.)
- **Overlay pages** (`invoice`, `invoice-view`, `settings`, `store-map`, `notes`, `end-of-day`,
  `profile`, `store-balance`, `so-request`, `marketplace`, `my-listings`, etc.): slide up from the
  bottom (`page-from-bottom` animation, zIndex 50), rendered absolutely over the tab strip. Opened
  via `navigate(pageId)` in `App.jsx`.
- Rule of thumb: core repeated workflows = tab; one-off views = overlay.

### 4b. Data flow — local-first, cloud-best-effort
**Everything goes through `src/utils/storage.js` (and sibling `*Storage.js` modules).** The universal
pattern:
```
write localStorage FIRST → then attempt Supabase (services/db.js) → on cloud failure, enqueue for retry → return either way
```
This means the app is fully usable offline / in guest mode, and the UI never blocks on the network.
**All storage functions are async — always `await` them.** A missing `await` silently returns a
Promise and causes subtle bugs.

Reads load from cloud on mount, fall back to the localStorage cache. A background **sync queue**
(`syncQueue.js` + `SyncQueueRunner`) retries failed cloud writes when back online; failures surface
via a global toast (`syncNotify.js` → `SyncToast.jsx`).

### 4c. Theming
```js
import { LIGHT, DARK, ACCENT, glassStyle, STATUS } from '../theme';
const { dark } = useTheme();      // ThemeContext
const C = dark ? DARK : LIGHT;    // C is the color object for this render
```
Tokens: `C.bg`, `C.card`, `C.cardBorder`, `C.text`, `C.textSub`, `C.textMuted`, `C.inputBg`,
`C.inputBorder`, `C.divider`, `C.danger`. `ACCENT` = `'var(--accent)'` (brand blue `#4A7BF7`) — a CSS
variable string that works in `style` props; in raw SVG `fill`/`stroke` hardcode `'#4A7BF7'`.
`glassStyle(dark)` = sticky-header backdrop blur (use only on sticky/fixed headers).

### 4d. Auth & guest mode
- Sign-up is **phone OTP** ("What's your number?" → SMS code), with an email fallback in `auth.js`.
  (Note: a phone provider must be configured in Supabase for OTP to actually send.)
- **Guest mode** (`localStorage['inv_guest_mode'] === 'true'`, helpers in `guestMode.js`): full local
  use without an account, capped at `GUEST_ENTRY_CAP` (5) saved entries. Cloud writes silently no-op
  (RLS rejects unauthenticated). Cross-account features (invites, sending orders to drivers) are
  hard-gated behind account creation because they need a session. The cold-start screen
  (`OnboardingFlow.jsx`) offers Get started (sign up) / Log in / Try as guest.

---

## 5. The data/storage layer (the `src/utils/*Storage.js` modules)

This is where most domain logic lives. Each module is local-first + cloud-sync:

| Module | Responsibility |
|---|---|
| `storage.js` | Core: invoices (`saveInvoice` **upserts by number**), catalog/products, stores, business name, pinned stores. The hub. |
| `paymentStorage.js` | Per-invoice payment ledger (amounts, notes, timestamps); drives partial/paid status |
| `signatureStorage.js` | Proof-of-delivery signatures per invoice (`inv_sig_<n>` = `{seller, buyer}`) |
| `connectionStorage.js` | Invite-only driver↔store links: code/link generation, URL capture pre-auth, **`redeem_connection` security-definer RPC**, local cache |
| `connectionOrderStorage.js` | Cross-account orders over a connection + the invoice hand-off latch (when a driver fills a store's order) |
| `storeOwnerStorage.js` | Role helpers + SO orders/drivers + same-account order bridge |
| `marketplaceStorage.js` | Cross-user discovery: listings (drivers) + demand (stores), geo-sorted feeds |
| `reminderMessage.js` | Builds the overdue/early-payment WhatsApp reminder text + `wa.me` deep link |
| `orderSuggestions.js` | Store-history analysis → reorder suggestion chips + invoice anomaly warnings |
| `invoiceUtils.js` | Pure helpers: `subtotalOf`, `getStatus`, `isOverdue`, `getFlagDays`, date formatting, `buildWhatsAppUrl` |
| `constants.js` | **Single source of truth** for magic values: `STORAGE_KEYS` (every `inv_` key), `EVENTS`, `DEFAULT_FLAG_DAYS`, `DELETE_UNDO_MS`, `AUTOFILL_DEBOUNCE_MS`, `BUSINESS_NAME_PLACEHOLDER`, etc. |
| `syncQueue.js` / `syncNotify.js` | Offline retry queue + failure-toast bridge |
| `pdfGenerator.js` | jsPDF invoice generation (lazy) |
| `eventBadges.js`, `geo.js`, `barcodeApi.js`, `guestMode.js`, `tutorialProgress.js`, `tutorialState.js` | Unread badges, geolocation, barcode lookup, guest cap, tutorial registries/state |

`services/`: `supabase.js` (client), `auth.js` (sign-in/OTP/profile), `db.js` (raw Supabase CRUD;
invoices upsert on `(user_id, invoice_number)`), `migration.js` (localStorage→cloud migration on
first sign-in).

---

## 6. Supabase schema (checked-in SQL, run manually in the dashboard)

All migration files are **idempotent + self-healing** (`add column if not exists`, drop old policy
names) so re-running is safe. Tables (one `.sql` each at the repo root): `connections`,
`connection-orders`, `connection-requests`, `shared-invoices`, `marketplace`, `profiles`,
`signatures`, `receiving-confirmation`, `invoice-updated-at`. RLS is participants-only; cross-account
inserts are gated on an active connection. Redemption uses a `redeem_connection(p_code, p_name)`
**SECURITY DEFINER** RPC.

> Gotcha: SQL handed to the user can get rewritten by the dashboard's AI assistant before it runs.
> After any manual run, verify live schema with an anon REST probe
> (`GET $URL/rest/v1/<table>?select=<col>&limit=1` — `42703` = column missing, `42P01` = table
> missing, `[]` = OK).

---

## 7. Key files map

```
src/
  App.jsx                 Shell: routing, tab strip, swipe gestures, overlay rendering. key={role} remounts on role switch.
  theme.js                LIGHT/DARK tokens, ACCENT, glassStyle, STATUS colors
  pages/
    Home.jsx              Driver dashboard (data layer; charts in components/dashboard)
    Reports.jsx           Driver analytics
    StoreMap.jsx          Stores (swipe-to-edit, pinned, OSM map)
    StoreBalance.jsx      Per-store running balance
    Products.jsx          Product catalogue
    Settings.jsx          Theme, density, PIN, business info
    EndOfDay.jsx, Notes.jsx, Profile.jsx, About.jsx, Legal.jsx
    driver/               DriverStores, DriverReports
    storeowner/           SOHome, SOOrders, SODrivers, SOInvoices, SOReports, NewRequest
    marketplace/          Marketplace, MyListings, FindDrivers
  components/
    invoice/              NewInvoice, InvoiceView, InvoiceHistory, InvoicePreview, LiveInvoicePreview, EditItemModal
    navigation/           BottomNav (the TOP nav), NavDrawer, AppFooter
    auth/                 AuthGate, OnboardingFlow (sign-up screens), GuestUpsell
    connections/          InviteModal
    dashboard/            DashboardCharts (BarChart, DonutRing, HorizBar)
    tutorial/             QuickStart, TipManager, FeatureTip, WalkthroughRunner, HelpChecklist, Spotlight, DimPanels, TutorialTooltip
    settings/             PinLock, ThemeToggle
    ui/                   SplashScreen, UpdateBanner, WhatsNew, SyncToast, BarcodeScanner, etc.
    onboarding/           RoleSelector
  hooks/                  useInvoiceForm, useInvoiceHistory, useElementRect, useOnboarding, useDensity,
                          useBackup, useContactImport, useAppUpdate, useVersionCheck
  services/               supabase, auth, db, migration
  context/                ThemeContext
```

The **two big stateful hooks** are `useInvoiceForm.js` (all New Invoice logic — create/edit/duplicate,
autofill, scan, generate) and `useInvoiceHistory.js` (the Route list — filtering, stats, status
changes, delete-with-undo). Their components (`NewInvoice.jsx`, `InvoiceHistory.jsx`) are "pure UI."

---

## 8. Feature deep-dives

**Invoicing (driver core).** Create at Route → "+ New". Fields: business name (editable inline
header), Store Name (required), Customer Name (optional — never shown on the final invoice/PDF),
phone, address, date/time (default now), line items (name/qty/price, with barcode-scan + catalog
autofill), payment method (cash/card), notes. A **live preview** renders as you type. Generate → an
invoice numbered from 1001 up, status `unpaid`. The invoice view offers Download PDF, Share, Copy
Text, Send via WhatsApp, and Sign (capture proof-of-delivery). From the history list, each invoice's
**··· menu** does: Set Status (unpaid/paid/partial), **Edit** (reopens the form in edit mode, updates
the same number in place; hidden on signed invoices), **Send Reminder** (any unpaid/partial invoice),
Share PDF, Duplicate (new number), Delete (portaled confirm + 5s Undo snackbar). Payments are logged
per-invoice and auto-derive partial/paid.

**Overdue & reminders.** An unpaid/partial invoice past the flag threshold (`DEFAULT_FLAG_DAYS` = 7,
configurable) gets an OVERDUE badge, red card border, and a prominent Remind button. "Send Reminder"
opens WhatsApp with a pre-drafted message (overdue → "N days past due"; early nudge → "still
outstanding").

**Stores & balances.** Stores are auto-derived from invoices (no manual "add store" on the driver
side). The Stores tab shows total outstanding + per-store balances; tapping a store opens its running
balance + statement (WhatsApp-shareable).

**Connections (the platform glue).** A driver or store generates an invite **code/link**
(`InviteModal`). The other party opens the link, signs up, and the code is **redeemed post-auth via
the `redeem_connection` RPC**, establishing a participants-only connection. (Known limitation: invites
created in *guest* mode never reach the cloud, so they can't be redeemed — guest invite is gated
behind sign-up.)

**Cross-account orders.** A connected store places a request (`NewRequest`) → it lands in the driver's
Route tab → driver Accepts / Fills Invoice → on generate, the order flips to `delivered` with the
invoice number → the store sees it and can **confirm receipt** (receiving-confirmation feature).
Orders also broadcast to the marketplace when no specific driver is assigned.

**Marketplace.** Cross-user discovery: drivers post listings, stores post demand, geo-sorted. A match
can end in an invite/connection.

**Reports & End of Day.** Today/Week/Month/Year revenue, top products/stores, and a driver
End-of-Day summary.

---

## 9. Onboarding / tutorial system (4 layers — `components/tutorial/`)

1. **RoleSelector** — first launch, pick driver vs store owner.
2. **QuickStart** (`QuickStart.jsx`) — a 4-step spotlight walk (spotlight the work tab → spotlight
   "+ New" → confetti). First-run gated by `useOnboarding` (`inv_onboarding_complete`); replayable
   from the drawer ("How it Works").
3. **Contextual tips** (`TipManager.jsx` + `FeatureTip.jsx`) — one-time hints fired by `triggerTip(id)`
   from feature sites. Shown one at a time, only after QuickStart, only for the current role,
   **throttled to 2 per session** (the rest re-fire later); an off-screen anchor (wrong tab) is
   skipped. Registry: `TIPS` in `tutorialProgress.js`.
4. **WalkthroughRunner** (`WalkthroughRunner.jsx`) — self-driving guided demos that actually navigate
   the real UI (no cursor; tooltips narrate; paced to be followable). `driver_invoice` and
   `so_request` walkthroughs.

Plus a **HelpChecklist** (Settings → Help) that auto-ticks as features are used. All tutorial state
keys are `inv_`-prefixed. To reset first-run: `localStorage.removeItem('inv_onboarding_complete')`.

---

## 10. Conventions & "house rules" (follow these exactly)

- **Inline styles only.** Static styles in a `const s = { ... }` at the **bottom** of the file;
  theme-dependent styles resolved inline at render via `C`.
- **File order:** imports → helpers → `export default function` → state → effects → derived values →
  JSX → `const s = {}`.
- **All storage is async — always `await`.** Write localStorage first, cloud second.
- **Magic values live in `constants.js`** (`STORAGE_KEYS`, `EVENTS`, timing constants). Never hardcode
  `inv_…` strings or day counts inline.
- **All localStorage keys are `inv_`-prefixed.**
- **Modals must be `createPortal(modal, document.body)`** (iOS clips `position:fixed` under any
  `overflow:hidden` ancestor — use `overflowX:'clip'` not `'hidden'` on page wrappers). Never use
  native `window.confirm`/`alert`.
- **Touch targets ≥44px**, `WebkitTapHighlightColor:'transparent'`, page headers
  `paddingTop:'max(14px, env(safe-area-inset-top))'`, scroll bodies `paddingBottom:88` (clears nav).
- **Branch workflow:** never commit to `main`. `git checkout main && git pull` →
  `git checkout -b feature/<desc>` → one logical change per commit → `npm run build` green before any
  PR.
- **No smart/curly quotes in JSX** (Vite build crashes on them).

---

## 11. Known gotchas / silent-failure traps

| Situation | What breaks |
|---|---|
| Storage call without `await` | Returns a Promise, not data — no error thrown, subtle UI bug |
| `overflow:hidden` ancestor of a modal | Modal invisible on iOS (use portal + `overflowX:'clip'`) |
| Unauthenticated/guest Supabase write | RLS rejects with **no error** (empty rows) — always write localStorage first |
| Smart quotes in `.jsx` | Vite build crash |
| `import from '../lib/...'` | Renamed to `services/` — build error |
| Reading localStorage directly instead of via storage helpers | Misses cloud data |
| Re-running Supabase SQL | Safe (idempotent), but the dashboard AI may rewrite it — verify with a REST probe |
| Dev preview service worker | Can serve stale bundles + drop the dev session on reload (test single-session flows) |

---

## 12. Data shapes (quick reference)

```js
// Invoice (created in useInvoiceForm.handleGenerate, persisted via storage.saveInvoice)
{
  number: 1001,                 // integer, counts up from 1001
  businessName, businessPhone,  // the driver's own identity (empty until set)
  storeName,                    // required
  customerName,                 // optional — NOT shown on the final invoice/PDF
  storePhone, storeAddress,
  date: 'June 24, 2026',        // en-US locale string
  time: '08:47 AM',
  items: [{ id, name, qty, price }],
  notes,
  paymentMethod: 'cash' | 'card',
  paymentStatus: 'unpaid' | 'paid' | 'partial',
  createdAt,                    // ISO string
  storeUserId,                  // set when linked to a connected store account
}

// Store Owner order (NewRequest → storeOwnerStorage / connectionOrderStorage)
{
  id, productName, quantity, price, deliveryDate,
  driverId, driverName,         // 'conn:<id>' for a connected driver; null = unassigned (broadcast)
  status: 'pending' | 'accepted' | 'delivered' | 'cancelled',
  createdAt, notes,
}

// Connection (connectionStorage)
{
  id, inviteCode, status: 'pending' | 'active',
  driverUserId, storeUserId,    // populated as each side joins
  inviterRole, inviterName, redeemerName,
}
```

---

## 13. How to prompt the AI effectively on this project

- **State the role + tab/flow** you mean (driver vs store owner; e.g. "driver Route tab"). Many
  features exist in parallel per role.
- **Default working cadence:** branch → implement → `npm run build` green → verify in a real browser
  at 375px → commit (one logical change) → open a PR only when asked.
- **Give intent, not just the change** ("make X clearer for a first-timer"). Conventions (inline
  styles, `C` tokens, portals, constants) are automatic; a one-line "why" helps pick the right call.
- **Cross-account / auth-gated flows can't be fully exercised in the dev preview** (need two live
  cloud accounts + a configured phone provider). Expect single-account/guest verification plus a flag
  for what needs a real-device pass.
- **Good prompt shape:** *"In `<file/feature>`, for the `<role>` `<tab>`, change `<behavior>` because
  `<why>`. Keep `<constraint>`. Verify in the browser and show me before merging."*
