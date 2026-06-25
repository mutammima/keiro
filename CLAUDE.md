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
    auth/              Auth wrapper + login screen + guest upsell
    connections/       InviteModal (invite code/link share sheet)
    dashboard/         Presentational chart components for Home dashboard
    invoice/           Invoice creation, history, view, preview, edit modal
    navigation/        Top nav bar, sidebar drawer, in-page footer
    onboarding/        RoleSelector (driver vs store owner, first launch)
    settings/          PIN lock, theme toggle
    tutorial/          Onboarding tutorials (driver + SO variants)
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
| `src/components/auth/LoginScreen.jsx` | Login / passkey screen |
| `src/components/settings/PinLock.jsx` | PIN lock screen |
| `src/components/settings/ThemeToggle.jsx` | Dark/light toggle |
| `src/components/tutorial/OnboardingTutorial.jsx` | First-time 5-step animated tutorial |
| `src/components/ui/UpdateBanner.jsx` | "Update available" banner |
| `src/components/ui/SplashScreen.jsx` | App launch splash |
| `src/components/ui/WhatsNew.jsx` | What's new modal |
| `src/hooks/useAppUpdate.js` | PWA service worker update detection |
| `src/hooks/useVersionCheck.js` | Version polling — dispatches inv-version-update event |
| `src/hooks/useOnboarding.js` | Tracks onboarding completion in localStorage |
| `src/hooks/useInvoiceForm.js` | Invoice form state logic |
| `src/hooks/useInvoiceHistory.js` | Invoice history state + payment status logic |
| `src/services/supabase.js` | Supabase client |
| `src/services/auth.js` | Auth helpers (signIn, signOut, passkey) |
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
| `src/utils/pdfGenerator.js` | jsPDF invoice generation |
| `src/utils/barcodeApi.js` | Barcode lookup API |
| `public/service-worker.js` | PWA caching, SKIP_WAITING controlled update |
| `public/version.json` | Written at build time with git hash for update detection |
| `vite.config.js` | Auto-versioning: writes version.json + injects __APP_VERSION__ |

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

- `vite.config.js` writes the current git hash to `public/version.json` at build time and injects `__APP_VERSION__` into the bundle
- `useVersionCheck.js` polls `/version.json` every 30s — fires `inv-version-update` custom event on mismatch
- `useAppUpdate.js` detects SW waiting state
- `UpdateBanner.jsx` shows "Update now / Later" when either fires

## Onboarding / Tutorial System

Three layers, all under `src/components/tutorial/` with state in `src/utils/tutorialProgress.js`:

1. **Quick Start** (`QuickStart.jsx`) — 4-step, role-aware, spotlight-based. RoleSelector is step 1; this runs steps 2–4: spotlight the work tab (Route / Orders) → spotlight + New → confetti success. Skip from step 2 on. Lazy-loaded in `App.jsx`; first-run gated by `useOnboarding` (`inv_onboarding_complete`), replayable from the drawer ("How it Works") and Settings → Help. On finish (driver) a pulse dot appears on the Home tab.
2. **Contextual tips** (`TipManager.jsx` + `FeatureTip.jsx`) — one-time hints fired by `triggerTip(id)` from feature sites. The manager shows one at a time, only after the quick start is done, only for the current role, only once (`inv_tip_<id>`). Registry: `TIPS` in `tutorialProgress.js`.
3. **Feature checklist** (`HelpChecklist.jsx`, in Settings → Help) — auto-ticks as features are used. Reads `inv_act_<id>` flags set by `markAction(id)` and by the milestone bridge (`installMilestoneBridge` maps the app's existing `inv-onboarding-*` events to actions). Registry: `getChecklist(role)`.

Shared primitives: `useElementRect.js` (rAF rect tracking + scroll-into-view + give-up), `TutorialTooltip.jsx` (viewport-flipping card, 375px-safe), `Spotlight.jsx` (4-panel dim with a click-through hole, portaled), `Confetti.jsx`. Keyframes live in `index.css` (`tut-*`).

All state keys are `inv_`-prefixed so backup/restore captures them automatically. To re-trigger first-run: `localStorage.removeItem('inv_onboarding_complete')` (clear `inv_tip_*` / `inv_act_*` to reset tips/checklist).

## iOS / Safari Gotchas

- **`position: fixed` modals**: any ancestor with `overflow: hidden` creates a new containing block on iOS, clipping fixed children. Use `createPortal(modal, document.body)` for all confirm/delete dialogs.
- **`overflowX: 'clip'` not `'hidden'`**: `clip` prevents horizontal scroll without creating a new containing block — use it on page wrappers so fixed portals still escape.
- **Unauthenticated Supabase deletes**: RLS silently returns no error when the user isn't logged in, so always delete from localStorage first, then attempt the cloud sync.

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

## Pending — Phase 3 queue

- **3.2 Shared invoice visibility** — driver's invoices for a connected store appear in that store's Invoices tab (read-only + payment status)
- **3.3 Marketplace → connection loop** — a marketplace match ends in an invite/connection
- **3.4 Cross-account event badges** — unread counts for new orders / invoices / payments
- **Known limitation:** invites created in guest mode never reach the cloud (no session), so the other party can't redeem them
