# InvoGo

Mobile-first delivery invoicing PWA. Create invoices on the go, track what every store owes, and see your daily/weekly/monthly revenue — all from your phone.

## Tech stack

- **React 19 + Vite** — fast dev server, PWA build
- **Supabase** — auth (email/passkey) + cloud database with Row Level Security
- **localStorage** — offline fallback; migrated to Supabase on first sign-in
- **jsPDF + jspdf-autotable** — client-side PDF generation
- **html5-qrcode** — barcode scanning for product lookup

## Getting started

```bash
npm install
cp .env.example .env        # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev
```

See `SUPABASE_SETUP.md` for the full schema, RLS policies, and configuration checklist.

## Project structure

```
src/
  App.jsx              Shell: routing, swipe gestures, overlay pages, PIN lock
  App.css              Global reset, dvh sizing, animations, desktop centering
  index.css            Base resets (box-sizing, fonts, form elements)
  theme.js             LIGHT / DARK color tokens + glassStyle helper (ACCENT = #4A7BF7)
  main.jsx             React entry point + service worker registration

  pages/               Full-screen navigable pages (opened via navigate())
    Home.jsx           Visual dashboard — today strip, 7-day bar chart, donut ring, top products
    Reports.jsx        Today / Week / Month / Year analytics + top stores/products
    Settings.jsx       Business info, theme, PIN, display density, backup
    StoreMap.jsx       Store info — swipe-to-edit, pinned stores, OSM map
    StoreBalance.jsx   Per-store running balance view
    Notes.jsx          Notes CRUD
    EndOfDay.jsx       End-of-day driver summary
    Products.jsx       Product catalogue — alphabetical, edit/delete in edit mode
    Profile.jsx        User profile
    About.jsx          About page

  components/
    auth/              AuthGate (session wrapper) · LoginScreen (email + passkey)
    dashboard/         Chart components for Home: BarChart · DonutRing · HorizBar · PRODUCT_COLORS
    invoice/           NewInvoice · InvoiceHistory · InvoiceView · InvoicePreview
                       EditItemModal · LiveInvoicePreview
    navigation/        BottomNav.jsx (top tab bar) · NavDrawer · AppFooter
    settings/          PinLock · ThemeToggle
    tutorial/          OnboardingTutorial (active)
    ui/                SplashScreen · UpdateBanner · WhatsNew · BarcodeScanner
                       AutofillInput · SignaturePad · SettingsUI

  hooks/
    useInvoiceForm.js     Invoice form state + barcode lookup
    useInvoiceHistory.js  Invoice list + payment status
    useOnboarding.js      Tracks onboarding completion (localStorage)
    useAppUpdate.js       PWA service worker update detection
    useVersionCheck.js    Polls /version.json every 30s; fires inv-version-update event
    useBackup.js          Data export/import helpers
    useContactImport.js   Native contact picker for store phone pre-fill
    useDensity.js         Display density preference

  services/
    supabase.js       Supabase client
    auth.js           signIn / signOut / passkey helpers
    db.js             CRUD helpers (invoices, products, stores)
    migration.js      localStorage → Supabase one-time migration

  utils/
    storage.js        Data helpers — wraps both Supabase and localStorage
    pdfGenerator.js   jsPDF invoice generation
    barcodeApi.js     Barcode lookup API
    signatureStorage.js  Signature canvas persistence

  context/
    ThemeContext.jsx  Dark/light mode — localStorage key: inv_dark_mode
```

## Navigation model

- **Tab pages** (`invoice`, `history`, `products`): rendered in a 3× wide flex strip, switched by horizontal swipe or tapping the top nav.
- **Overlay pages** (`home`, `reports`, `settings`, `store-map`, `notes`, `end-of-day`, `store-balance`, etc.): slide up from bottom (zIndex 50), rendered over the tab strip.

## Update system

- `vite.config.js` writes the current git hash to `public/version.json` at build time.
- `useVersionCheck.js` polls `/version.json` every 30s and fires `inv-version-update` on mismatch.
- `useAppUpdate.js` detects a waiting service worker.
- `UpdateBanner.jsx` shows "Update now / Later" when either fires.

## Onboarding tutorial

- 5-step spotlight tutorial in `src/components/tutorial/OnboardingTutorial.jsx`.
- Completion tracked in localStorage key `inv_onboarding_complete`.
- To re-trigger during development: `localStorage.removeItem('inv_onboarding_complete')`.

## Available scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Production build (writes version.json) |
| `npm run preview` | Preview production build locally |
| `npm run lint` | ESLint check |
| `npm run lint:fix` | ESLint auto-fix |
| `npm run format` | Prettier format all src files |
| `npm run format:check` | Check formatting without writing |

## Environment variables

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key |
