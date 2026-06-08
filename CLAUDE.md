# InvoiceGo — Claude Instructions

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

- **Stack:** React + Vite PWA, Supabase (auth + cloud DB), localStorage fallback
- **Mobile-first**, max-width 480px centered on desktop
- **Tabs:** `['invoice', 'history', 'products']` — horizontal swipe gesture or tap the top nav labels to switch
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
  components/
    auth/              Auth wrapper + login screen
    dashboard/         Presentational chart components for Home dashboard
    invoice/           Invoice creation, history, view, preview, edit modal
    navigation/        Top nav bar, sidebar drawer, in-page footer
    settings/          PIN lock, theme toggle
    tutorial/          Onboarding tutorial (OnboardingTutorial.jsx — active)
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
| `src/utils/storeOwnerStorage.js` | Store Owner → Driver order bridge; cloud-synced via `so_bridge_requests` with RLS |
| `src/utils/reminderMessage.js` | Builds the overdue-invoice WhatsApp reminder message + `wa.me` deep link |
| `src/utils/syncNotify.js` | Bridges non-React storage-layer cloud-write failures to a global toast (`inv-sync-error` event) |
| `src/components/ui/SyncToast.jsx` | Global banner that surfaces failed critical cloud writes |
| `src/utils/pdfGenerator.js` | jsPDF invoice generation |
| `src/utils/barcodeApi.js` | Barcode lookup API |
| `public/service-worker.js` | PWA caching, SKIP_WAITING controlled update |
| `public/version.json` | Written at build time with git hash for update detection |
| `vite.config.js` | Auto-versioning: writes version.json + injects __APP_VERSION__ |

## Navigation Model

- **Tab pages** (`invoice`, `history`, `products`): rendered in a 3× wide flex strip, swiped horizontally or tapped in the top nav
- **Overlay pages** (`home`, `reports`, `settings`, `store-map`, `notes`, `end-of-day`, `profile`, `store-balance`, etc.): slide up from bottom, rendered absolutely over the tab strip
- Navigate via `navigate(pageId)` in App.jsx

## Update System

- `vite.config.js` writes the current git hash to `public/version.json` at build time and injects `__APP_VERSION__` into the bundle
- `useVersionCheck.js` polls `/version.json` every 30s — fires `inv-version-update` custom event on mismatch
- `useAppUpdate.js` detects SW waiting state
- `UpdateBanner.jsx` shows "Update now / Later" when either fires

## Onboarding Tutorial

- `src/components/tutorial/OnboardingTutorial.jsx` — 5-step animated tutorial with a cursor and spotlight overlay
- Completion tracked in `localStorage` key `inv_onboarding_complete`
- Skip is always available; steps auto-advance via simulated user actions
- Step sequence: Welcome → New Invoice → Invoice History → Store Map → Products
- To re-trigger for testing: `localStorage.removeItem('inv_onboarding_complete')`

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

- **Payment logging with timestamps** — per-invoice ledger (`utils/paymentStorage.js`)
- **Overdue payment reminders** — one-tap WhatsApp reminder on overdue invoices (`utils/reminderMessage.js`, surfaced in `InvoiceHistory.jsx`); days overdue counts from the invoice date, amount due reflects the remaining balance for partials
- **Reliable invoice cloud save** — `customer_name` + `payment_method` now persist; `saveInvoice` is an upsert so retries converge on `unique(user_id, invoice_number)`
- **Cloud-sync failure feedback** — `utils/syncNotify.js` + `components/ui/SyncToast.jsx` warn when a critical write saved locally but didn't reach the cloud
- **Store Owner → Driver bridge** — cloud-synced order handoff via `so_bridge_requests` (RLS-scoped per user)

## Pending / Priority 2 Features

- **Weekly store statement** — per-store weekly balance view
- **Smart order suggestions** — frequency analysis on a store's recent invoices, surfaced as one-tap chips
- **Invoice anomaly warning** — flag totals far outside a store's historical average
