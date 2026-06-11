# Contributing to Keiro

Welcome! This guide gets you from zero to a running dev environment and explains how the codebase is organized and how to contribute changes.

---

## What is Keiro?

Keiro is a mobile-first PWA that connects delivery drivers and retail store owners. Drivers create invoices, track deliveries, and manage store relationships. Store owners place orders with connected drivers and view their billing in one place. The two sides communicate through an invite-based connection layer — think of it as a lightweight operations tool for the last-mile delivery relationship.

The app is installable (PWA), works offline for core flows via localStorage, and syncs to Supabase when online.

---

## Getting Set Up Locally

### Prerequisites

- Node.js 18+
- npm 9+
- A Supabase project (free tier is fine for development)

### Steps

```bash
# 1. Clone the repo
git clone https://github.com/mutammima/keiro.git
cd keiro

# 2. Install dependencies
npm install

# 3. Create your local env file (never commit this)
cp .env.example .env.local
```

Open `.env.local` and fill in the two values from your Supabase project dashboard (Settings → API):

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

```bash
# 4. Start the dev server
npm run dev
# → http://localhost:5173

# 5. Verify a production build still passes before opening a PR
npm run build
```

### First-run tip

On first launch the app asks you to pick a role (Driver or Store Owner). You can switch roles from the sidebar drawer at any time. To test both sides, open a second browser profile.

---

## Folder Structure

```
src/
├── App.jsx              App shell — routing, tab strip, swipe gestures, overlays
├── App.css              Global reset, 100dvh sizing, animations, desktop centering
├── theme.js             LIGHT / DARK color tokens + glassStyle helper
├── main.jsx             React entry point
│
├── pages/               Full-screen pages
│   ├── Home.jsx         Driver dashboard
│   ├── Settings.jsx
│   ├── Reports.jsx
│   ├── StoreMap.jsx
│   ├── Notes.jsx
│   ├── EndOfDay.jsx
│   ├── Products.jsx
│   ├── Profile.jsx
│   ├── About.jsx
│   ├── driver/          Driver-role tab pages
│   ├── storeowner/      Store Owner tab pages (SOHome, SOOrders, SODrivers, SOInvoices)
│   └── marketplace/     Discovery feeds (Marketplace, MyListings, FindDrivers)
│
├── components/
│   ├── auth/            Auth wrapper + login screen + guest upsell banners
│   ├── connections/     Invite code / link share sheet
│   ├── dashboard/       Chart components (bar, donut, horizontal bar)
│   ├── invoice/         Invoice creation, history, view, edit modal
│   ├── navigation/      TopNav (tab bar), NavDrawer (sidebar), AppFooter
│   ├── onboarding/      RoleSelector (first launch)
│   ├── settings/        PIN lock, theme toggle
│   ├── tutorial/        5-step animated onboarding tutorial
│   └── ui/              Splash, update banner, what's new modal, sync toast
│
├── hooks/               Custom React hooks
├── services/            Supabase client, auth helpers, db CRUD, migration
├── utils/               Pure utility functions (storage, invoices, badges, PDF, …)
└── context/             ThemeContext (dark / light)
```

### Two navigation modes

| Mode | Examples | How it works |
|------|----------|--------------|
| **Tab pages** | Home, Route, Stores, Reports | 4-wide flex strip; swipe or tap TopNav |
| **Overlay pages** | Settings, Invoice view, New request | Slide up from bottom (`page-from-bottom` animation, z-index 50) |

Add one-off views as overlays. Add core workflows as tabs (only if the product calls for it — the 4-slot strip is intentionally fixed).

---

## How Styling Works

**Every style is an inline object. No Tailwind. No CSS modules. No styled-components.**

Colors come from `src/theme.js` via `ThemeContext`:

```jsx
import { useTheme } from '../context/ThemeContext';
import { LIGHT, DARK, ACCENT, glassStyle } from '../theme';

export default function MyComponent() {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;   // all colors for this render

  return (
    <div style={{ background: C.bg }}>

      {/* Card */}
      <div style={{
        background: C.card,
        border: `1px solid ${C.cardBorder}`,
        borderRadius: 14,
        padding: 16,
      }}>
        <p style={{ color: C.text, fontWeight: 700, margin: 0 }}>Title</p>
        <p style={{ color: C.textMuted, fontSize: 12, margin: '4px 0 0' }}>Subtitle</p>
      </div>

      {/* Primary button */}
      <button style={{
        background: ACCENT,
        color: '#fff',
        border: 'none',
        borderRadius: 10,
        padding: '10px 20px',
        fontWeight: 700,
        fontSize: 13,
        cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent',  // always add for touch targets
      }}>
        Save
      </button>

    </div>
  );
}

// Theme-independent static styles go at the BOTTOM of the file
const s = {
  page: { minHeight: '100%', display: 'flex', flexDirection: 'column', overflowX: 'clip' },
  header: {
    padding: '14px 20px 12px',
    paddingTop: 'max(14px, env(safe-area-inset-top))',   // iPhone notch safe area
    display: 'flex', alignItems: 'center', gap: 14,
  },
};
```

### Color token quick reference

| Token | Use |
|-------|-----|
| `C.bg` | Page background |
| `C.card` | Card / panel background |
| `C.cardBorder` | Card border color |
| `C.text` | Primary text |
| `C.textSub` | Secondary text |
| `C.textMuted` | Tertiary / hint text |
| `C.inputBg` / `C.inputBorder` | Form inputs |
| `C.divider` | Separator lines |
| `C.danger` | Destructive / error red |
| `ACCENT` | Brand blue — primary buttons, highlights (`#4A7BF7`) |

### A few rules to follow

- `ACCENT` is `'var(--accent)'` (a CSS custom property). It works in `style` props. In SVG `fill`/`stroke` use the hex `'#4A7BF7'` directly.
- `glassStyle(dark)` — adds backdrop blur for sticky headers. Use it only on sticky/fixed headers.
- Touch targets must be at least 44px tall. Always add `WebkitTapHighlightColor: 'transparent'` to interactive elements.
- Max content width is 480px. Scrollable page bodies need `paddingBottom: 88` to clear the nav bar.

---

## Git Workflow

```
main  ← protected, deployments come from here
  └── feature/my-change    ← your branch
```

### Step by step

```bash
# 1. Start from a fresh main
git checkout main
git pull origin main

# 2. Create a branch named after the work
git checkout -b feature/my-change
# or fix/bug-description, docs/update-readme, etc.

# 3. Make your changes, commit often
git add src/components/MyThing.jsx
git commit -m "Add MyThing component with dark mode support"

# 4. Verify the build passes before pushing
npm run build    # must be zero errors

# 5. Push and open a PR
git push -u origin feature/my-change
gh pr create --fill    # or open the GitHub UI
```

### Rules

- **Never push directly to `main`.** All changes go through a PR.
- One PR per logical change — keep them small and reviewable.
- The build must pass (`npm run build` zero errors) before requesting review.
- PR description should include screenshots for any visual change.

---

## Environment Variables

See `.env.example` for the full list. The app only needs two at runtime:

| Variable | Where to find it |
|----------|-----------------|
| `VITE_SUPABASE_URL` | Supabase Dashboard → Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase Dashboard → Settings → API → anon / public key |

The anon key is safe to expose in the browser — it's protected by Row Level Security policies. **Never put the service role key in client code.**

Your `.env.local` is git-ignored. Do not commit any file containing real credentials.
