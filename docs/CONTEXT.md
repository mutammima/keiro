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
| Backend/Auth/DB | **Supabase** (`@supabase/supabase-js` 2.x) — Postgres + Row-Level Security + auth (Google OAuth + email/password; phone-OTP dormant). Anon key only on the client. |
| Local persistence | **localStorage** (every app feature works offline; cloud is best-effort sync) |
| PDF | **jsPDF 4.x + jspdf-autotable** (lazy-loaded only at generation time) |
| Barcode scan | **html5-qrcode** (lazy-loaded) |
| Deploy | **Vercel** |
| Native wrapper | **Capacitor (iOS)** — same web app, sideloaded via AltStore/SideStore, not the App Store; see §4e |
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
- Sign-up/sign-in is **Google OAuth (primary) + real email + password** (Supabase). On **web**, Google
  returns via redirect (`detectSessionInUrl` restores the session); email supports password reset. Both
  funnel new users through the same profile-setup screens (`OnboardingFlow.jsx` — name/email prefilled
  from the provider), then a plan screen, then the app. **Phone-OTP is still in the code but dormant** —
  no button reaches it until an SMS provider is funded in Supabase Auth.
- **On native (the iOS wrapper), Google sign-in takes a different path.** Google's consent screen
  refuses to load inside any embedded WebView, so `signInWithGoogle()` branches on
  `Capacitor.isNativePlatform()`: it opens the consent screen in the **system** browser instead and
  catches the result via a custom-URL-scheme deep link rather than `detectSessionInUrl`. See §4e.
- **Guest mode** (`localStorage['inv_guest_mode'] === 'true'`, helpers in `guestMode.js`): full local
  use without an account, capped at `GUEST_ENTRY_CAP` (5) saved entries. Cloud writes silently no-op
  (RLS rejects unauthenticated). Cross-account features (invites, sending orders to drivers) are
  hard-gated behind account creation because they need a session. The cold-start screen offers
  Continue with Google / Sign up with email / Log in / Try as guest.
- **Sign-out clears account-scoped local data** (all `inv_*` except device prefs like theme/accent),
  so the next account to sign in on the same device doesn't inherit the previous user's role/caches.

### 4e. Native wrapper (iOS/Capacitor)
The same web app, wrapped in a native iOS shell via **Capacitor** (`ios/` folder), sideloaded through
AltStore/SideStore — not on the App Store. Bundle id `app.keiro.mobile`. `npm run ios:sync` builds the
web app and pushes it + plugin config into the native project (`cap sync ios`); `npm run ios:open`
opens the Xcode project.

**Plugins:** `@capacitor/core` + `@capacitor/ios` (base), `@capacitor/filesystem` + `@capacitor/share`
(PDF sharing), `@capacitor/browser` + `@capacitor/app` (Google OAuth), `@capgo/capacitor-updater` (OTA
updates). Every native-only branch checks `Capacitor.isNativePlatform()` — grep for it to find them
all: skipping the web service worker (`main.jsx`), the OTA check (`otaUpdate.js`), the OAuth deep-link
handler (`auth.js`), and the PDF share-sheet bridge (`pdfGenerator.js`).

**Two problems that only exist inside the wrapper, both solved the same way — hand off to a native
API instead of a web one:**
- **PDF share/download.** iOS LaunchServices can't open `blob:` URLs from inside a Capacitor
  WebView — `window.open()`/`location.href` to one just does nothing, silently. `sharePDFBlob()` in
  `pdfGenerator.js` writes the PDF to the cache dir via `@capacitor/filesystem`, then hands the
  resulting `file://` URI to `@capacitor/share`'s native share sheet. There's no separate "download"
  concept on iOS, so Download and Share converge on the same sheet there; web is unchanged (Web Share
  API, falling back to a blob tab).
- **Google sign-in.** Google's OAuth screen refuses to load inside *any* embedded WebView
  (`disallowed_useragent` — a Google policy every wrapped app hits, not a Keiro bug). The native path
  opens the consent screen in the **system** browser (`@capacitor/browser`) via `skipBrowserRedirect`,
  catches Google's redirect back through `@capacitor/app`'s `appUrlOpen` event on the custom URL scheme
  `keiro://` (registered in `Info.plist`'s `CFBundleURLTypes`), and exchanges the PKCE code for a
  session (`initOAuthDeepLinkHandler()` in `auth.js`). **The `keiro://auth-callback` scheme must also be
  added to the Supabase project's Auth → URL Configuration → Redirect URLs allowlist**, or
  `signInWithOAuth` rejects it — a dashboard change only the project owner can make.

**OTA updates.** Every `npm run build` also runs `scripts/build-ota.mjs`, packaging `dist/` into
`dist/ota/<git-hash>.zip` + `latest.json` (deployed to Vercel with everything else). On native launch,
`otaUpdate.js` compares its baked-in version against `latest.json` and, if newer, downloads and
activates the update on next open via `@capgo/capacitor-updater` — ordinary code/content changes reach
the installed app with no reinstall. A new IPA is only needed when something *native* changes (a new
permission, plugin, or `Info.plist` edit).

**Safe-area:** the native WebView draws edge-to-edge under the status bar/Dynamic Island, unlike a
browser tab. Handled via `viewport-fit=cover` + `env(safe-area-inset-top)` padding on the top nav — a
no-op (resolves to 0) on desktop web and the installed PWA.

**Signing, never commit:** `project.pbxproj`'s `DEVELOPMENT_TEAM` is the developer's personal Apple ID
team — local-machine-specific, must be stashed before switching branches. Same for
`.../xcshareddata/swiftpm/` (SPM cache) *except* `Package.resolved`, a real lockfile that should be
committed like `package-lock.json`.

**Verifying native-only code:** a browser can't exercise the share sheet or a real Google login. Beyond
code review, an iOS Simulator build (`xcodebuild -sdk iphonesimulator CODE_SIGNING_ALLOWED=NO`) +
`xcrun simctl install/launch/screenshot` confirms the build links and the app doesn't crash; `xcrun
simctl openurl "keiro://auth-callback?..."` confirms the URL scheme is registered at the OS level. A
**real device** (or TestFlight) is still needed to confirm the full share-sheet content and OAuth
round-trip.

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
| `eventBadges.js`, `geo.js`, `barcodeApi.js`, `guestMode.js` | Unread badges, geolocation, barcode lookup, guest cap |
| `tutorialProgress.js` | Now tiny (~24 lines): the onboarding-done flag (also read directly by `AuthGate.jsx`/`resolveStartupRole()` — don't rename without updating those) + home-tab pulse-dot helpers. Used to also hold the tip/checklist/walkthrough registries — deleted along with those layers, see §9. |

`services/`: `supabase.js` (client), `auth.js` (Google/email sign-in, password reset, dormant OTP, profile), `db.js` (raw Supabase CRUD;
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
    tutorial/             QuickStart (the entire tutorial, one 7-step tour per role), Spotlight, DimPanels, TutorialTooltip, Confetti
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

## 9. Onboarding / tutorial system (one tour — `components/tutorial/`)

1. **RoleSelector** — first launch, pick driver vs store owner.
2. **QuickStart** (`QuickStart.jsx`) — a single **7-step, role-aware spotlight tour**, taught in one
   sitting right after signup, ending in a confetti success screen. First-run gated by `useOnboarding`
   (`inv_onboarding_complete`); replayable from the drawer ("How it Works") and Settings → Help
   ("Replay tutorial") — both relaunch the identical tour. On finish (driver only) a pulse dot appears
   on the Home tab.

**This replaced a four-layer system** (a 3-step QuickStart + 20 contextual tips throttled to "2 per
session" so the rest trickled in over future days + a Settings checklist + an 836-line self-driving
demo runner). The old design's core flaw: right after the "You're ready!" screen, an unrelated tip
could fire pointing at an empty invoice list days later — the opposite of teaching a new user in one
go. All four layers were deleted and merged into the single tour above; nothing else teaches the user
anything after first run.

Each of the 7 steps is either **tap-required** (the tooltip asks the user to tap the real highlighted
element — a nav tab, a button — and that real tap also drives the app's own navigation) or
**Next-button** (an informational step with a "Next" button in the tooltip footer, used for
mid-form fields or screens with no data yet). Shared primitives: `useElementRect.js` (polls the
target's rect via `setTimeout`, not `requestAnimationFrame` — rAF suspends on a hidden/unfocused
document, which could freeze a spotlight mid-transition), `TutorialTooltip.jsx` (viewport-flipping,
375px-safe, with the Next-button footer slot), `Spotlight.jsx` (4-panel dim with a click-through hole,
portaled — `.tut-dim-panel` glides between targets over 500ms rather than snapping), `Confetti.jsx`.

All tutorial state keys are `inv_`-prefixed. To reset first-run:
`localStorage.removeItem('inv_onboarding_complete')`.

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
| `blob:` URLs inside the iOS wrapper | iOS LaunchServices can't open them — `window.open()`/`location.href` to a blob silently does nothing (why PDF share needed a native path, §4e) |
| Google sign-in inside any embedded WebView | Blocked by Google's `disallowed_useragent` policy (not a Keiro bug) — needs the system-browser + deep-link pattern, §4e |
| Native build, Supabase redirect URL not allowlisted | `keiro://auth-callback` must be added to Auth → URL Configuration → Redirect URLs or `signInWithOAuth` rejects it (dashboard-only change) |
| Supabase Auth **Site URL** / Redirect URLs pointing at a dead domain | Confirmation & password-reset links land on a dead page. Both were once set to `keiro.app` (never deployed) — must be the live Vercel URL. Dashboard-only, silent when wrong |
| Resend shared sender (`onboarding@resend.dev`) | Only delivers to the Resend account's own email until a domain is verified at resend.com/domains — reset/confirmation emails to real users silently don't arrive |

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
- **Cross-account flows are testable with two real accounts** (email sign-up is instant). They've
  been exercised end-to-end in one browser via sign-out/sign-in; a two-physical-phone pass is still
  worth doing for touch/keyboard/network feel and real Google-redirect behavior on device.
- **Good prompt shape:** *"In `<file/feature>`, for the `<role>` `<tab>`, change `<behavior>` because
  `<why>`. Keep `<constraint>`. Verify in the browser and show me before merging."*
