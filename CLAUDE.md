# Keiro — Claude Instructions

> **Full architectural primer:** [`docs/CONTEXT.md`](docs/CONTEXT.md) — a standalone, in-depth brief
> on what Keiro is, the data/storage layer, the connection/order/marketplace flows, the tutorial
> system, data shapes, and house conventions. Read it (or paste it into a fresh chat) for deep context.

## What is Keiro?

Keiro is a mobile-first PWA that connects delivery drivers and retail store owners. Drivers use it to create and share invoices, track deliveries, and manage their store relationships. Store owners use it to place orders with connected drivers, track deliveries, and view billing from their drivers. The two sides link via invite codes and communicate through a shared connection layer backed by Supabase.

## Tech Stack

| Layer | Choice |
|-------|--------|
| UI | React 19 (Vite PWA) |
| Styling | **Inline styles only** — no Tailwind, no CSS modules, no CSS-in-JS libraries |
| Backend / Auth / DB | Supabase (Postgres + RLS + auth) |
| PDF | jsPDF + jspdf-autotable (lazy-loaded at generation time) |
| Deployment | Vercel |
| Native wrapper | **Capacitor (iOS)** — same web app, sideloaded via AltStore/SideStore; see "iOS Native Wrapper" |
| Max content width | 480px (mobile-first, centered on desktop) |
| Default theme | **Dark mode** |

## Running Locally

```bash
git clone https://github.com/mutammima/keiro.git
cd keiro
npm install

# Create .env.local (never commit this file)
cp .env.example .env.local
# Fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from your Supabase project

npm run dev        # → http://localhost:5173
npm run build      # production build (must pass zero errors before any PR)
```

## Live Deployment

- **Production URL: `https://keiro-mutammimas-projects.vercel.app`** — the only URL that serves the app. `keiro.vercel.app`, `delivery-invoice.vercel.app`, and `invoicego.app` do **not** (the project was renamed delivery-invoice → invoice-go → invogo → keiro over time; old URLs are dead or detached). Verify what's live with `curl -s <prod>/version.json` — it returns the deployed git hash.
- **Dev-server config names** (`.claude/launch.json`): `invoicego` (dev, port 5173) and `invoicego-preview` (preview, port 4174). These predate the Keiro rename — use these exact names; there is no server named `keiro`.

## Two Roles and Their Tabs

Every account picks a role on first launch (stored in `inv_user_role`). The top nav shows a different tab strip per role.

**Driver** — `inv_user_role = 'driver'`

| Tab key | What it is |
|---------|-----------|
| `home` | Dashboard: today's totals, 7-day chart, pinned stores, top products |
| `route` | Invoice history + new invoice creation |
| `stores` | Store map, contact list |
| `reports` | Today / Week / Month / Year analytics |

**Store Owner** — `inv_user_role = 'store_owner'`

| Tab key | What it is |
|---------|-----------|
| `so-home` | Dashboard: outstanding balance, recent orders |
| `so-orders` | Place + track orders sent to connected drivers |
| `so-drivers` | Manage driver connections |
| `so-invoices` | Invoices received from connected drivers (read-only billing) |

## How Styling Works

Every component uses **inline styles only**. Colors come from `src/theme.js` via `ThemeContext`.

```jsx
import { useTheme } from '../context/ThemeContext';
import { LIGHT, DARK, ACCENT, glassStyle } from '../theme';

export default function MyComponent() {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;   // C is your color object for this render

  return (
    <div style={{ background: C.bg }}>
      <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 14, padding: 16 }}>
        <span style={{ color: C.text, fontWeight: 700 }}>Title</span>
        <span style={{ color: C.textMuted, fontSize: 12 }}>Subtitle</span>
      </div>
      <button style={{ background: ACCENT, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', fontWeight: 700 }}>
        Primary Action
      </button>
    </div>
  );
}

// Static styles (no theme dependency) live at the BOTTOM of the file:
const s = {
  page: { minHeight: '100%', display: 'flex', flexDirection: 'column', overflowX: 'clip' },
  header: { padding: '14px 20px 12px', paddingTop: 'max(14px, env(safe-area-inset-top))' },
};
```

**Key color tokens:**

| Token | Use |
|-------|-----|
| `C.bg` | Page background |
| `C.card` | Card / surface background |
| `C.cardBorder` | Card border |
| `C.text` | Primary text |
| `C.textSub` | Secondary text |
| `C.textMuted` | Tertiary / placeholder text |
| `C.inputBg` / `C.inputBorder` | Form inputs |
| `C.divider` | Separator lines |
| `C.danger` | Destructive actions |
| `ACCENT` | Brand blue (`var(--accent)`, `#4A7BF7`) — use for primary buttons, highlights |

**Rules:**
- `ACCENT` is a CSS custom property string (`'var(--accent)'`). Works in `style` props. For SVG `fill`/`stroke` hardcode `'#4A7BF7'`.
- `glassStyle(dark)` — sticky header backdrop blur. Use **only** on sticky/fixed headers.
- Magic values (days, defaults, storage key names) live in `src/utils/constants.js` — never hardcode them inline.

---

## Branching & Pull Requests

**Always work on a feature branch, never commit directly to `main`.**

At the start of every session, before making any changes:

1. Pull the latest main:
   ```
   git checkout main && git pull origin main
   ```

2. Create a feature branch named after the work being done:
   ```
   git checkout -b feature/<short-description>
   ```
   Examples: `feature/payment-logging`, `feature/weekly-statement`, `feature/bugfix-swipe`

3. Make all commits on that branch.

4. When the user asks to create a PR, push the branch and open a PR against `main`:
   ```
   git push -u origin <branch-name>
   gh pr create ...
   ```

## Project Overview

Keiro is a **connection platform between delivery drivers and retail stores** —
the invoice tool grew into a two-sided product. Each account picks a role at
signup; the two roles see different tab sets and connect to each other through
invite codes.

- **Stack:** React + Vite PWA, Supabase (auth + cloud DB), localStorage fallback
- **Mobile-first**, max-width 480px centered on desktop
- **Two roles** (`inv_user_role`): `driver` | `store_owner` — `RoleSelector` on first launch, switchable from the drawer
- **Tabs per role** (swipe or tap the top nav):
  - Driver: `['home', 'route', 'stores', 'reports']` (route = invoice history + creation)
  - Store Owner: `['so-home', 'so-orders', 'so-drivers', 'so-invoices']`
- **Connections:** invite-only driver ↔ store links (code/link share, auto-established on signup, redemption via security-definer RPC)
- **Cross-account orders:** a connected store's order lands in the driver's Route tab and flows back as a delivered invoice
- **Overlay pages** slide up from bottom (zIndex 50, `page-from-bottom` animation)
- **Theme:** `LIGHT` / `DARK` tokens in `src/theme.js`, `ACCENT = '#4A7BF7'`
- **Viewport:** `100dvh` (dynamic viewport height), no `viewport-fit=cover`, scrollbars hidden globally

## Folder Structure

```
src/
  App.jsx              Shell, routing, swipe gestures, overlay pages
  App.css              Global reset, dvh sizing, animations, desktop centering
  theme.js             LIGHT / DARK color tokens + glassStyle helper
  main.jsx             React entry point
  index.css            Base styles

  pages/               Full-screen navigable pages (opened via navigate())
    driver/            Driver-role tab pages (DriverStores, DriverReports)
    storeowner/        Store Owner tab pages (SOHome, SOOrders, SODrivers, SOInvoices, SOReports, NewRequest)
    marketplace/       Discovery feeds (Marketplace, MyListings, FindDrivers)
  components/
    auth/              AuthGate wrapper + OnboardingFlow (Google/email sign-in) + guest upsell
    connections/       InviteModal (invite code/link share sheet)
    dashboard/         Presentational chart components for Home dashboard
    invoice/           Invoice creation, history, view, preview, edit modal
    navigation/        Top nav bar, sidebar drawer, in-page footer
    onboarding/        RoleSelector (driver vs store owner, first launch)
    settings/          PIN lock, theme toggle
    tutorial/          Single guided tour (QuickStart) — see Onboarding section
    ui/                Splash screen, update banner, what's new modal, etc.
  hooks/               Custom React hooks
  services/            Supabase client, auth, db, migration (was lib/)
  utils/               Pure utility functions
  context/             ThemeContext (dark/light mode)
  assets/              Static assets
```

## Key Files

| File | Purpose |
|------|---------|
| `src/App.jsx` | Shell, routing, tab strip, swipe gestures, overlay pages |
| `src/App.css` | Global reset, 100dvh sizing, animations, desktop centering |
| `src/theme.js` | LIGHT / DARK color tokens, ACCENT colour |
| `src/pages/Home.jsx` | Visual dashboard — today strip, 7-day bar chart, donut ring, pinned stores, top products |
| `src/pages/Settings.jsx` | Display density, theme, PIN, business info |
| `src/pages/Reports.jsx` | Today/Week/Month/Year analytics |
| `src/pages/StoreMap.jsx` | Store Info — swipe-to-edit, pinned stores, OSM map |
| `src/pages/Notes.jsx` | Notes CRUD |
| `src/pages/EndOfDay.jsx` | End-of-day driver summary |
| `src/pages/StoreBalance.jsx` | Per-store running balance view |
| `src/pages/Products.jsx` | Product catalogue — alphabetical sections, edit mode for rename/delete |
| `src/pages/Profile.jsx` | User profile |
| `src/pages/About.jsx` | About page |
| `src/components/dashboard/DashboardCharts.jsx` | BarChart, DonutRing, HorizBar chart components + PRODUCT_COLORS palette |
| `src/components/invoice/NewInvoice.jsx` | Invoice creation form |
| `src/components/invoice/InvoiceView.jsx` | Invoice display, PDF, WhatsApp share |
| `src/components/invoice/InvoiceHistory.jsx` | History list, overdue flagging, payment status |
| `src/components/invoice/InvoicePreview.jsx` | Invoice preview component |
| `src/components/invoice/EditItemModal.jsx` | Edit line item modal |
| `src/components/navigation/TopNav.jsx` | Top tab bar (☰ + New/Invoices/Products tabs) — historically named BottomNav |
| `src/components/navigation/NavDrawer.jsx` | Sidebar navigation drawer |
| `src/components/navigation/AppFooter.jsx` | In-page footer links |
| `src/components/auth/AuthGate.jsx` | Auth wrapper |
| `src/components/auth/OnboardingFlow.jsx` | Sign-in / sign-up flow — Google primary, email/password + recovery (PR #140) |
| `src/components/settings/PinLock.jsx` | PIN lock screen |
| `src/components/settings/ThemeToggle.jsx` | Dark/light toggle |
| `src/components/tutorial/QuickStart.jsx` | The entire onboarding tutorial — one 7-step spotlight tour per role, replayable (see Onboarding section) |
| `src/components/ui/UpdateBanner.jsx` | "Update available" banner |
| `src/components/ui/SplashScreen.jsx` | App launch splash |
| `src/components/ui/WhatsNew.jsx` | What's new modal |
| `src/hooks/useAppUpdate.js` | PWA service worker update detection |
| `src/hooks/useVersionCheck.js` | Version polling — dispatches inv-version-update event |
| `src/hooks/useOnboarding.js` | Tracks onboarding completion in localStorage |
| `src/hooks/useInvoiceForm.js` | Invoice form state logic |
| `src/hooks/useInvoiceHistory.js` | Invoice history state + payment status logic |
| `src/services/supabase.js` | Supabase client |
| `src/services/auth.js` | Auth helpers — `signInWithEmail` / `signUpWithEmail` / `signInWithGoogle` (web: redirect; native: system browser + custom-scheme deep link, see iOS Native Wrapper), `resetPassword` / `updatePassword`, `signOut`, phone OTP, profile CRUD |
| `src/services/db.js` | Database CRUD helpers |
| `src/services/migration.js` | LocalStorage → Supabase migration |
| `src/utils/storage.js` | Data helpers (Supabase + localStorage); mirrors invoices to cache + emits sync-error toasts on failed cloud writes |
| `src/utils/paymentStorage.js` | Per-invoice payment ledger (amounts, notes, timestamps) — local first, Supabase sync |
| `src/utils/storeOwnerStorage.js` | Role helpers + SO orders/drivers + same-account order bridge (`so_bridge_requests`) |
| `src/utils/connectionStorage.js` | Invite-only connections: code/link gen, URL capture, RPC redemption, local cache |
| `src/utils/connectionOrderStorage.js` | Cross-account orders over a connection (`connection_orders`) + invoice hand-off latch |
| `src/utils/orderSuggestions.js` | Store-history analysis: reorder suggestion chips + invoice anomaly check |
| `src/utils/marketplaceStorage.js` | Marketplace listings/demand (cross-user discovery), geo-sorted feeds |
| `src/components/connections/InviteModal.jsx` | Generate + share an invite code/link (portaled, role-aware) |
| `src/pages/storeowner/NewRequest.jsx` | SO order form — routes to a connected driver (`conn:` ids) or local contact/marketplace |
| `src/utils/reminderMessage.js` | Builds the overdue-invoice WhatsApp reminder message + `wa.me` deep link |
| `src/utils/syncNotify.js` | Bridges non-React storage-layer cloud-write failures to a global toast (`inv-sync-error` event) |
| `src/components/ui/SyncToast.jsx` | Global banner that surfaces failed critical cloud writes |
| `src/utils/pdfGenerator.js` | jsPDF invoice generation; `sharePDFBlob()` hands the result to the native share sheet on iOS (blob: URLs don't work in the wrapper) or the browser/Web Share API on web |
| `src/utils/barcodeApi.js` | Barcode lookup API |
| `public/service-worker.js` | PWA caching, SKIP_WAITING controlled update (web/installed-PWA only — skipped inside the native wrapper) |
| `public/version.json` | Written at build time with git hash for update detection |
| `vite.config.js` | Auto-versioning: writes version.json + injects __APP_VERSION__ |
| `src/utils/otaUpdate.js` | Native-only: checks `/ota/latest.json` on launch, downloads + applies a newer bundle — see iOS Native Wrapper |
| `scripts/build-ota.mjs` | Runs after every `vite build`; packages `dist/` into `dist/ota/<hash>.zip` + `latest.json` |
| `capacitor.config.json` | Capacitor config — appId, webDir, OTA updater plugin settings |
| `ios/App/App/Info.plist` | Native permissions (camera, location), `keiro://` URL scheme for Google OAuth, file-sharing keys for PDF share |

## Navigation Model

- **Tab pages** (role-dependent, 4 per role — see Project Overview): rendered in a 4× wide flex strip, swiped horizontally or tapped in the top nav. `TopNav.jsx` picks the tab set from the `role` prop.
- **Overlay pages** (`invoice`, `invoice-view`, `settings`, `store-map`, `notes`, `end-of-day`, `profile`, `store-balance`, `so-request`, `marketplace`, `my-listings`, etc.): slide up from bottom, rendered absolutely over the tab strip. The strip hides while an overlay is open.
- Navigate via `navigate(pageId)` in App.jsx. `key={role}` remounts the shell cleanly on role switch.

## Supabase Migrations (manual, run in dashboard SQL editor)

Schema lives in checked-in SQL files — all idempotent AND self-healing (they
`alter table … add column if not exists` and drop known earlier-variant policy
names), so re-running is always safe:

- `supabase-connections.sql` — connections table, participants-only RLS, `redeem_connection(p_code, p_name)` SECURITY DEFINER RPC
- `supabase-connection-orders.sql` — cross-account orders; INSERT gated on an active connection linking store → driver
- `supabase-marketplace.sql` — cross-user listings/demand (authenticated read-all, owner write, constrained claim)

**Rule:** SQL handed to the user may get rewritten by the dashboard assistant
before it runs. After any manual run, verify the live schema with an anon REST
probe (`GET $URL/rest/v1/<table>?select=<critical_column>&limit=1` — 42703 =
column missing, 42P01 = table missing, `[]` = OK).

## Update System

**Web / installed PWA:**
- `vite.config.js` writes the current git hash to `public/version.json` at build time and injects `__APP_VERSION__` into the bundle
- `useVersionCheck.js` polls `/version.json` every 30s — fires `inv-version-update` custom event on mismatch
- `useAppUpdate.js` detects SW waiting state
- `UpdateBanner.jsx` shows "Update now / Later" when either fires

**Native (Capacitor) — over-the-air, no reinstall:** every `npm run build` also runs `scripts/build-ota.mjs`, which packages `dist/` into `dist/ota/<git-hash>.zip` + `dist/ota/latest.json` (deployed to Vercel like everything else). On native launch, `src/utils/otaUpdate.js` compares its baked-in `__APP_VERSION__` against `latest.json`; if newer, it downloads the zip and activates it on the *next* app open (`@capgo/capacitor-updater`). This means ordinary code/content changes reach the installed iOS app automatically — a new IPA is only needed when something *native* changes (a new permission, a new plugin, an Info.plist edit). See iOS Native Wrapper below.

## Onboarding / Tutorial System

**One tour, taught in a single sitting** (`QuickStart.jsx`) — this used to be four separate
layers (a 3-step quick start + 20 tips trickling in over multiple future sessions + a Settings
checklist + an 836-line self-driving demo). All four were replaced with one 7-step, role-aware
spotlight tour, because the old system's tips could fire on an empty screen days after signup —
the opposite of "taught in one go."

- `QuickStart.jsx` holds a data-driven step array per role (`driver` / `store_owner`). Each step is
  either **tap-required** (the user taps the real highlighted element — a nav tab, a button — and
  that real click also drives the app's own navigation) or **Next-button** (an informational step:
  a "Next" button in the tooltip advances instead, for mid-form fields or a screen with no data
  yet). RoleSelector runs first; QuickStart starts fresh at "Step 1 of 7."
- First-run gated by `useOnboarding` (`inv_onboarding_complete`); replayable from the drawer ("How
  it Works") and Settings → Help ("Replay tutorial") — both relaunch the exact same tour. On finish
  (driver only) a pulse dot appears on the Home tab.
- **Nothing else teaches the user anything after this** — no scattered tips, no checklist, no demo.

Shared primitives: `useElementRect.js` (polls the target's live rect via `setTimeout`, not
`requestAnimationFrame` — rAF is suspended whenever the document isn't visible/focused, which can
freeze a spotlight mid page-transition; `setTimeout` keeps working), `TutorialTooltip.jsx`
(viewport-flipping card, 375px-safe, has a `footer` slot for the Next-button steps), `Spotlight.jsx`
(4-panel dim with a click-through hole, portaled; `.tut-dim-panel`'s CSS transition glides between
targets over 500ms rather than snapping), `Confetti.jsx` (success-screen finale). Keyframes live in
`index.css` (`tut-*`).

`src/utils/tutorialProgress.js` is now tiny (~24 lines) — just the onboarding-done flag (also read
directly by `AuthGate.jsx` and `resolveStartupRole()`, so don't rename it without updating those
too) and the home-pulse helpers. All state keys are `inv_`-prefixed so backup/restore captures them
automatically. To re-trigger first-run: `localStorage.removeItem('inv_onboarding_complete')`.

## iOS Native Wrapper (Capacitor)

The same web app, wrapped in a native iOS shell via **Capacitor** (`ios/` folder), sideloaded via
AltStore/SideStore — not on the App Store yet. Bundle id `app.keiro.mobile`. Dev commands:
`npm run ios:sync` (build + `cap sync ios` — pushes the current web build + plugin config into the
native project) and `npm run ios:open` (opens `ios/App/App.xcodeproj` in Xcode).

**Native plugins in use:** `@capacitor/core`, `@capacitor/ios`, `@capacitor/filesystem` +
`@capacitor/share` (PDF sharing), `@capacitor/browser` + `@capacitor/app` (Google OAuth), and
`@capgo/capacitor-updater` (OTA updates — see Update System above).

**Finding native-only code:** every native branch point checks `Capacitor.isNativePlatform()` —
grep for it to find them all. Current ones: skip the web service worker (`main.jsx`), OTA update
check (`otaUpdate.js`), the OAuth deep-link handler (`auth.js`), and the PDF share-sheet bridge
(`pdfGenerator.js`).

**Why PDF share needed a native path:** `blob:` URLs can't be opened by iOS LaunchServices inside a
Capacitor WebView — `window.open()`/`location.href` to one just silently does nothing. The native
path (`sharePDFBlob()` in `pdfGenerator.js`) writes the PDF to the cache dir via
`@capacitor/filesystem`, then hands its `file://` URI to `@capacitor/share`'s native share sheet
(Save to Files, AirDrop, Mail, print). There's no separate "download" concept on iOS, so Download
and Share both converge on the same sheet there; web is unchanged.

**Why Google sign-in needed a native path:** Google's OAuth consent screen refuses to load inside
*any* embedded WebView (`disallowed_useragent`) — a Google policy every Capacitor/Cordova/React
Native app hits, not a bug. The native path opens the consent screen in the **system** browser
(`@capacitor/browser`, SFSafariViewController) via `skipBrowserRedirect`, then catches Google's
redirect back via `@capacitor/app`'s `appUrlOpen` event on the custom URL scheme `keiro://`
(registered in `Info.plist`'s `CFBundleURLTypes`), and exchanges the PKCE code for a session — see
`initOAuthDeepLinkHandler()` in `auth.js`. **This scheme must also be added to the Supabase
project's Auth → URL Configuration → Redirect URLs allowlist, or `signInWithOAuth` rejects it** —
that's a dashboard change only the project owner can make.

**Safe-area:** the native WebView draws edge-to-edge under the status bar / Dynamic Island (unlike
a normal browser tab). Fixed via `viewport-fit=cover` in `index.html` and `env(safe-area-inset-top)`
padding on `TopNav.jsx` — resolves to `0` (no-op) on desktop web and the installed PWA.

**Signing is local-only, never commit:** `ios/App/App.xcodeproj/project.pbxproj`'s
`DEVELOPMENT_TEAM` is the developer's personal Apple ID team — stash it before switching branches,
never push it. Same for anything under `.../xcshareddata/swiftpm/` (SPM resolution cache) *except*
`Package.resolved`, which is a real lockfile and should be committed like `package-lock.json`.

**Verifying native-only paths:** a browser can't exercise the share sheet or complete a real Google
login. Beyond code review, build for the simulator (`xcodebuild ... -sdk iphonesimulator
CODE_SIGNING_ALLOWED=NO`) and use `xcrun simctl install/launch/screenshot` — this at least confirms
the build links, the app doesn't crash, and (for deep links) `xcrun simctl openurl
"keiro://auth-callback?..."` confirms the URL scheme is registered at the OS level. A **real device**
(or TestFlight) is still needed to confirm the full round-trip.

## iOS / Safari Gotchas (web / installed PWA)

- **`position: fixed` modals**: any ancestor with `overflow: hidden` creates a new containing block on iOS, clipping fixed children. Use `createPortal(modal, document.body)` for all confirm/delete dialogs.
- **`overflowX: 'clip'` not `'hidden'`**: `clip` prevents horizontal scroll without creating a new containing block — use it on page wrappers so fixed portals still escape.
- **Unauthenticated Supabase deletes**: RLS silently returns no error when the user isn't logged in, so always delete from localStorage first, then attempt the cloud sync.

## Data & State Gotchas

- **All `inv_*` localStorage values are JSON-encoded.** `localStorage.getItem('inv_user_role')` returns `'"driver"'` (with quotes) — comparing it raw against `'driver'` shipped a real bug (invisible walkthrough). Always `JSON.parse` before comparing.

## Testing & Verification

- **Use a real `+tag` account for anything meaningful.** The old `test/test` login is gone. There is a DEV-only bypass (`OnboardingFlow.jsx`, gated on `import.meta.env.DEV`) that logs you in as a fake `{id:'dev'}` user — but it only exists under `npm run dev` (never in preview/prod builds) and creates NO real Supabase account, so it's useless for testing auth, cloud sync, or cross-account flows. For those, sign up with a real `alomonds+<tag>@gmail.com` account and report created throwaway accounts when done.
- **Definition of done for UI fixes** — follow `.claude/skills/verified-fix/`: nuke the service worker first, real account, 375px viewport, screenshot proof before claiming fixed. A stale SW serving an old bundle is the #1 source of "the fix didn't work" false signals.
- **Shipping** — follow `.claude/skills/ship/`: every "merge" should end with a state table (branch / PR / build / deploy / live version) so merge-and-deploy status never needs to be asked.

## Tooling Conventions

- **Prefer the dedicated tools over shell one-liners**: Read (not `sed -n`/`cat`), Edit (not `sed -i`/`perl -0pi`), Grep (not `grep -rn` pipelines), Write (not heredocs/`node -e` file writes). One-liner edits generate a permission prompt each and have repeatedly failed on zsh quoting/globbing.
- **Large pasted specs**: save to `docs/specs/` immediately and work from the file — see `.claude/skills/spec/`.

## Shared Utilities

- `src/utils/constants.js` — single source of truth for magic values: `STORAGE_KEYS`
  (every `inv_` key), `DEFAULT_BUSINESS_NAME`, `INVOICE_NUMBER_START`, `MS_PER_DAY`,
  `DEFAULT_FLAG_DAYS`, and `COLORS` (repeated non-theme hex values).
- `src/utils/invoiceUtils.js` — pure invoice helpers shared across screens:
  `subtotalOf`, `getStatus`, `formatInvoiceDate` / `todayInvoiceDate`, `getFlagDays`,
  `daysSince`, `isOverdue`, and `buildWhatsAppUrl`. Prefer these over re-deriving
  totals/overdue/status inline.

## Recently Shipped

- **Phase 1 — connection platform** (PR #102): two roles, 4-tab nav per role, redesigned Driver + Store dashboards, invite-only connections (unguessable code/link, captured pre-mount in `main.jsx`, redeemed post-auth via the `redeem_connection` SECURITY DEFINER RPC; participants-only RLS)
- **Phase 2 — store intelligence** (PR #103): smart order suggestion chips (≥2 of last 6 invoices, median qty + last price), invoice anomaly warning (≥2× / ≤⅓ of store average, non-blocking), weekly store statement (Mon–Sun, payments ledger, WhatsApp share)
- **Phase 3.1 — cross-account orders** (PR #104): connected store's order → driver's Route tab → Accept/Fill Invoice → on generate the order flips to `delivered` with the invoice number (30-min latch TTL); marketplace tables activated
- **Payment logging, overdue WhatsApp reminders, sync-failure toasts** — see `utils/paymentStorage.js`, `utils/reminderMessage.js`, `utils/syncNotify.js`
- **iOS native wrapper** (Capacitor): safe-area fix, PIN-lock-freeze fix, OTA update system (`@capgo/capacitor-updater`), route-lazy overlay pages (entry chunk 1.16 MB → ~390 kB) — see iOS Native Wrapper above
- **Native PDF share, Google sign-in, and a Qty-field bug** fixed inside the wrapper — see iOS Native Wrapper above for the PDF/OAuth mechanisms
- **Onboarding consolidated** from 4 layers (quick start + trickling tips + Settings checklist + a self-driving demo) into a single 7-step tour — see Onboarding / Tutorial System above
- **Local error monitoring + test coverage**: `ErrorBoundary` at the app root + a capped on-device error log (`src/utils/errorLog.js`, viewable from Settings → Help & Tutorial → Error Log) catch render crashes and uncaught window errors; Vitest gained jsdom + Testing Library and 3 new suites (invoice create→generate, connection invite→redeem, the full QuickStart tour), 103 tests total. No remote/cloud crash reporting yet — see Pending below.

## Phase 3 — shipped

All three Phase 3 items are wired and live:

- **3.2 Shared invoice visibility** — `SOInvoices.jsx` loads shared invoices via
  `getSharedInvoices`/`loadSharedInvoicesFromCloud` (connectionOrderStorage) and shows
  receiving confirmation
- **3.3 Marketplace → connection loop** — `Marketplace.jsx` / `FindDrivers.jsx` call
  `requestConnection()` (connectionStorage), so a marketplace match ends in a connection request
- **3.4 Cross-account event badges** — `eventBadges.js`, consumed in `App.jsx`

Guest-mode invites (the old known limitation) are handled by gating: tapping Invite as a
guest shows an "Account required" wall instead of creating an invite that could never be
redeemed.

## Pending — real-world launch blockers (not code)

- **Two-device pass** — the cross-account flows (invite → connect, order → invoice →
  receiving confirmation) are code-complete but have never been exercised on two physical
  phones with live accounts. Numbered test script written and ready to run.
- **Native PDF share + Google sign-in — confirm on a real device.** Verified as far as possible
  without one (clean simulator build/launch, URL scheme registered at the OS level per iOS's own
  "Open in Keiro?" prompt), but the actual share-sheet content and a completed Google login round-
  trip still need a real device or TestFlight pass. On-device checklist written and ready to run.
- **Password recovery — SMTP live and verified; one delivery limitation left.** Supabase custom
  SMTP is configured against Resend (host `smtp.resend.com`, port 465), and the full reset round-trip
  is verified end-to-end with a real account: sign-up → confirmation email → "Forgot password" →
  reset email → set-new-password screen (confirms `AuthGate`'s `PASSWORD_RECOVERY` listener fires) →
  new-password login. Enabling custom SMTP also auto-raised the email rate limit from the built-in
  2/hour to 30/hour. All 6 auth email templates are Keiro-branded. Two dead-domain redirect bugs were
  fixed in the same pass: the Auth **Site URL** and Redirect URLs allowlist pointed at `keiro.app`
  (a domain this project never deployed to) instead of the live Vercel URL — that's what made earlier
  confirmation/reset links land on a dead page. **Remaining blocker:** Resend's shared
  `onboarding@resend.dev` sender only delivers to the Resend account's own address until a domain is
  verified at resend.com/domains — so real users still can't receive reset/confirmation emails. No
  domain purchased yet, by choice.
- **Real push notifications** — deferred; requires the paid Apple Developer Program (free
  "personal team" signing can't enable the Push Notifications entitlement at all, independent of
  code). Would also unlock TestFlight for the item above. Local-notifications and louder in-app
  alerts (`eventBadges.js`) were considered as zero-cost substitutes but neither actually replaces
  "alert me while the app is closed," so both were explicitly declined for now rather than built
  as a partial stand-in.

(Resolved: phone-OTP was replaced by Google sign-in + email/password auth in PR #140, so real
accounts work without Twilio. Resolved: the Supabase Auth → URL Configuration → Redirect URLs
allowlist now includes `keiro://auth-callback`, so native Google sign-in is no longer rejected.)
