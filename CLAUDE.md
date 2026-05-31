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
- **Tabs:** `['invoice', 'history', 'products']` — side-by-side flex strip, navigated by circular arrow buttons
- **Overlay pages** slide up from bottom (zIndex 50, `page-from-bottom` animation)
- **Theme:** `LIGHT` / `DARK` tokens in `src/theme.js`, `ACCENT = '#4A7BF7'`

## Key Files

| File | Purpose |
|------|---------|
| `src/App.jsx` | Shell, routing, tab strip, overlay pages |
| `src/App.css` | Global reset, animations, desktop centering |
| `src/components/Home.jsx` | Dashboard — default landing page |
| `src/components/NewInvoice.jsx` | Invoice creation form |
| `src/components/InvoiceView.jsx` | Invoice display, PDF, WhatsApp share |
| `src/components/InvoiceHistory.jsx` | History list, overdue flagging |
| `src/components/Products.jsx` | Product catalogue, alphabetical sections |
| `src/components/Reports.jsx` | Today/Week/Month/Year analytics |
| `src/components/StoreMap.jsx` | Store Info — swipe-to-edit, pinned stores |
| `src/components/Notes.jsx` | Notes CRUD |
| `src/components/EndOfDay.jsx` | End-of-day driver summary |
| `src/components/NavDrawer.jsx` | Sidebar navigation |
| `src/components/BottomNav.jsx` | Bottom tab bar |
| `src/hooks/useAppUpdate.js` | PWA service worker update detection |
| `src/utils/storage.js` | Data helpers (Supabase + localStorage) |
| `src/utils/pdfGenerator.js` | jsPDF invoice generation |
| `public/service-worker.js` | PWA caching, SKIP_WAITING controlled update |

## Pending / Priority 2 Features

- **Payment logging with timestamps** — running ledger per invoice ("$40 received May 28")
- **Weekly store statement** — per-store weekly balance view
