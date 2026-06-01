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
  components/          Reusable UI components (not full pages)
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
| `src/pages/Home.jsx` | Dashboard — default landing page |
| `src/pages/Settings.jsx` | Display density, theme, PIN, business info |
| `src/pages/Reports.jsx` | Today/Week/Month/Year analytics |
| `src/pages/StoreMap.jsx` | Store Info — swipe-to-edit, pinned stores, OSM map |
| `src/pages/Notes.jsx` | Notes CRUD |
| `src/pages/EndOfDay.jsx` | End-of-day driver summary |
| `src/pages/StoreBalance.jsx` | Per-store running balance view |
| `src/pages/Profile.jsx` | User profile |
| `src/pages/About.jsx` | About page |
| `src/components/invoice/NewInvoice.jsx` | Invoice creation form |
| `src/components/invoice/InvoiceView.jsx` | Invoice display, PDF, WhatsApp share |
| `src/components/invoice/InvoiceHistory.jsx` | History list, overdue flagging, payment status |
| `src/components/invoice/InvoicePreview.jsx` | Invoice preview component |
| `src/components/invoice/EditItemModal.jsx` | Edit line item modal |
| `src/components/pages/Products.jsx` | Product catalogue, alphabetical sections |
| `src/components/navigation/TopNav.jsx` | Top tab bar (☰ + New/Invoices/Products tabs) — file named BottomNav.jsx for compatibility |
| `src/components/navigation/NavDrawer.jsx` | Sidebar navigation drawer |
| `src/components/navigation/AppFooter.jsx` | In-page footer links |
| `src/components/auth/AuthGate.jsx` | Auth wrapper |
| `src/components/auth/LoginScreen.jsx` | Login / passkey screen |
| `src/components/settings/PinLock.jsx` | PIN lock screen |
| `src/components/settings/ThemeToggle.jsx` | Dark/light toggle |
| `src/components/tutorial/OnboardingTutorial.jsx` | First-time 5-step spotlight tutorial |
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
| `src/utils/storage.js` | Data helpers (Supabase + localStorage) |
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

- `src/components/tutorial/OnboardingTutorial.jsx` — 5-step spotlight tutorial
- Completion tracked in `localStorage` key `inv_onboarding_complete`
- Skip is always available; each step only advances on real user action
- Spotlight uses 4 `position:fixed` divs around the target rect (top/bottom/left/right panels)
- Custom events: `inv-onboarding-invoice-created`, `inv-onboarding-invoice-paid`, `inv-onboarding-store-viewed`, `inv-onboarding-settings-saved`
- To re-trigger for testing: `localStorage.removeItem('inv_onboarding_complete')`

## Pending / Priority 2 Features

- **Payment logging with timestamps** — running ledger per invoice ("$40 received May 28")
- **Weekly store statement** — per-store weekly balance view
