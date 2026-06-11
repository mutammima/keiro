# Keiro — Claude Operational Playbook

This file captures non-obvious knowledge earned from debugging, building, and refactoring
this codebase. Read it before starting any session. It is the difference between a slow
session full of re-discovery and a fast one.

---

## 1. Session Start Ritual (exact commands, in order)

```bash
git checkout main
git pull origin main
git checkout -b feature/<short-description>
```

Never skip this. Never commit directly to `main`. If you already have a branch open from
a previous session, check `git status` and `git log --oneline -5` first to orient yourself.

---

## 2. Architecture Quick-Reference

### Navigation model — two separate systems
```
Tab pages   → invoice / history / products
             rendered side-by-side in a 3× wide flex strip in App.jsx
             switch: horizontal swipe OR tap BottomNav.jsx labels

Overlay pages → home / reports / settings / store-map / notes /
                end-of-day / store-balance / profile / about
                slide up from bottom (zIndex 50, `page-from-bottom` animation)
                opened via navigate(pageId) in App.jsx
```
If you're adding a new full-screen view, decide which type it is first. Overlays are
simpler for one-off pages. Tabs are for the three main workflows.

### Data layer — three-tier pattern
Every piece of app data flows through `src/utils/storage.js`, which wraps `src/services/db.js`:
```
1. Try Supabase (db.js)
2. On error → fall back to localStorage
3. Return data either way
```
**All storage functions are async.** Always `await` them. This tripped up multiple bugs
where a sync call returned a Promise object instead of data.

### localStorage key namespace
All keys are prefixed `inv_`. Don't invent new prefixes.
```
inv_business_name     inv_business_phone    inv_dark_mode
inv_pinned_stores     inv_product_names     inv_catalog
inv_stores            inv_store_phones      inv_store_addrs
inv_onboarding_complete                     inv_number (fallback invoice counter)
```

### Theme system
```js
import { LIGHT, DARK, ACCENT, glassStyle, STATUS } from '../theme';
const C = dark ? DARK : LIGHT;
```
- `C.text`, `C.textSub`, `C.textMuted`, `C.textLight` — four text weight levels
- `C.card` / `C.cardBorder` — for card containers
- `C.inputBg` / `C.inputBorder` — for form inputs
- `C.danger` — red (different hex in light vs dark)
- `C.divider` — hairline separator colour
- `ACCENT` — is `'var(--accent)'` (CSS custom property), NOT a hex string.
  This means it works in JSX style props but **may not work in SVG `fill`/`stroke` attributes
  in older environments.** In SVGs, hardcode `'#4A7BF7'` if you see a rendering issue.
- `glassStyle(dark)` — use on sticky headers only. Returns position:sticky + backdrop-filter.
- `STATUS.paid / .unpaid / .partial` — pre-made bg+text colours for payment badges.

### Dark mode default
The app defaults to dark mode. The ThemeContext logic is:
```js
saved === null ? true : saved === 'true'
```
Treat dark mode as the primary visual target, not an afterthought.

---

## 3. Coding Conventions (unwritten rules)

### Styling — inline only
This codebase uses **zero CSS modules and zero Tailwind**. Every style is an inline
`style={...}` object defined in a `const s = { ... }` at the bottom of the file.

Pattern:
```jsx
// At top of component:
const inp = { background: C.inputBg, borderColor: C.inputBorder, color: C.text };

// In JSX:
<input style={{ ...s.input, ...inp }} />

// At bottom of file:
const s = {
  input: { height: 46, fontSize: 16, padding: '0 14px', border: '1px solid',
           borderRadius: 12, outline: 'none', WebkitAppearance: 'none' },
};
```
Never add a CSS class for new UI. Always add to `s` or spread inline.

### Component structure
```
imports (React, hooks, utils)
tiny helper functions (not hooks)
export default function PageName({ props })
  state declarations
  useEffect calls
  computed values (not state — just derived)
  return JSX
const s = { ... }  ← styles always last
```

### Mobile targets
- Max content width: 480px, centred on desktop
- Touch targets: minimum 44px height for all interactive elements
- Add `WebkitTapHighlightColor: 'transparent'` to every tappable element
- Safe area: `paddingTop: 'max(14px, env(safe-area-inset-top))'` on page headers
- Bottom spacing: `paddingBottom: 88` on scrollable bodies (clears the nav bar)

### Buttons and inputs
```jsx
// Standard action button
style={{ background: ACCENT, border: 'none', color: '#fff', fontWeight: 700,
         fontSize: 13, padding: '7px 16px', borderRadius: 10, cursor: 'pointer',
         WebkitTapHighlightColor: 'transparent' }}

// Destructive button
style={{ background: C.danger, color: '#fff', border: 'none', ... }}

// Ghost/secondary button
style={{ background: C.inputBg, color: C.text, border: `1px solid ${C.inputBorder}`, ... }}
```

---

## 4. Known Bugs & Their Fixes (hard-won)

### Bug A — Modal invisible on iOS (most common)
**Symptom:** Dimmed overlay appears but the modal card itself is absent.

**Cause:** Any ancestor with `overflow: hidden` creates a new containing block on iOS Safari,
trapping `position: fixed` children inside the scroll area.

**Fix — always use createPortal for modals:**
```jsx
import { createPortal } from 'react-dom';

// At the bottom of the JSX return, outside all containers:
{confirmDelete && createPortal(
  <div style={s.modalOverlay} onClick={() => setConfirmDelete(null)}>
    <div style={{ ...s.modalCard, background: C.card }}
         onClick={e => e.stopPropagation()}>
      {/* modal content */}
    </div>
  </div>,
  document.body
)}
```

**Fix — use `overflowX: 'clip'` not `'hidden'` on page wrappers:**
```jsx
// ✓ correct — does not create a containing block
s.page = { overflowX: 'clip' };

// ✗ wrong — clips fixed children on iOS
s.page = { overflowX: 'hidden' };
```

---

### Bug B — Delete/update silently does nothing (unauthenticated)
**Symptom:** User is not logged in (Continue without account). Delete is called.
No error. Nothing changes. State stays stale.

**Root cause:** Supabase Row Level Security policies reject the unauthenticated write
but return **no error** — just an empty affected-rows result. The old code only wrote to
localStorage when `error` was truthy. No error → localStorage never updated.

**Fix — always write localStorage first, then sync cloud:**
```js
export async function deleteProduct(barcode) {
  // Step 1: local always, unconditionally
  const catalog = lsGet('inv_catalog', {});
  delete catalog[barcode];
  lsSet('inv_catalog', catalog);

  // Step 2: best-effort cloud, log but don't throw
  const { error } = await db.deleteProduct(barcode);
  if (error) console.error('deleteProduct remote error', error);
}
```
Apply this same pattern to any new delete/update function you write.

---

### Bug C — Stale UI after async mutation
**Symptom:** User deletes/edits something. Confirmation succeeds. Old data still shows.

**Cause:** State was set from the optimistic pre-mutation value, not re-fetched from source.

**Fix — always re-fetch after every mutation:**
```js
async function confirmDeleteNow() {
  await deleteProduct(confirmDelete.barcode);
  const updated = await getAllProducts();   // ← re-fetch, don't just splice state
  setCatalog(updated || {});
  setConfirmDelete(null);
}
```

---

### Bug D — Smart/curly quote build crash
**Symptom:** `npm run build` fails with `Invalid character` at a specific line.
The character looks like `'` or `"` but isn't ASCII.

**Cause:** An editor or AI response introduced UTF-8 typographic quotes (`‘`, `’`,
`“`, `”`) into JSX. Vite's parser rejects them.

**Fix — python binary replace (works even inside JSX strings):**
```python
with open('src/path/to/File.jsx', 'rb') as f:
    data = f.read()
data = data.replace(b'\xe2\x80\x98', b"'")   # left  '
data = data.replace(b'\xe2\x80\x99', b"'")   # right '
data = data.replace(b'\xe2\x80\x9c', b'"')   # left  "
data = data.replace(b'\xe2\x80\x9d', b'"')   # right "
with open('src/path/to/File.jsx', 'wb') as f:
    f.write(data)
```
Always run `npm run build` at the end of a session to catch this before opening a PR.

---

### Bug E — Tutorial tooltip jumps on every cursor move
**Symptom:** The tooltip repositions every frame as the simulated cursor moves across screen.

**Cause:** `setRect()` (which re-anchors the tooltip) was called inside `moveTo()`.

**Fix:** Call `setRect()` only once at the start of each step, not during movement.
```js
// ✓ call once per step
setRect(document.querySelector('[data-tutorial="..."]').getBoundingClientRect());
await moveTo(x, y);  // moveTo should NOT call setRect()
```

---

## 5. Danger Zones (things that silently break)

| Situation | What silently breaks |
|-----------|---------------------|
| `import ... from '../lib/...'` | `lib/` was renamed to `services/` — build won't find it |
| `overflow: hidden` on any ancestor of a modal | Modal invisible on iOS |
| Calling storage functions without `await` | Returns a Promise instead of data; no error thrown |
| Hardcoding ACCENT as `'#4A7BF7'` in a style prop | Won't update if user changes accent colour |
| Smart quotes in any `.jsx` file | Vite build crash at that character |
| Reading `inv_catalog` directly from localStorage | Misses Supabase data; always go through `getAllProducts()` |
| Adding a new localStorage key without `inv_` prefix | Breaks the namespace convention |
| Committing to `main` directly | Violates the branching rule in CLAUDE.md |

---

## 6. Common Tasks Playbook

### Add a new overlay page
1. Create `src/pages/NewPage.jsx` — use an existing page (e.g. `Notes.jsx`) as template
2. In `App.jsx`: add to the `navigate()` switch, add to the overlay render block
3. In `NavDrawer.jsx`: add a menu item
4. In `AppFooter.jsx` (if needed): add a footer link

### Add a new modal (with confirm dialog)
```jsx
// State
const [confirmX, setConfirmX] = useState(null); // { id, name } or whatever

// Trigger from a row
<button onClick={() => setConfirmX({ id: item.id, name: item.name })}>Delete</button>

// Portal at bottom of JSX (outside all containers)
{confirmX && createPortal(
  <div style={s.modalOverlay} onClick={() => setConfirmX(null)}>
    <div style={{ ...s.modalCard, background: C.card }} onClick={e => e.stopPropagation()}>
      <p style={{ color: C.text }}>Remove "{confirmX.name}"?</p>
      <button onClick={() => setConfirmX(null)}>Cancel</button>
      <button onClick={handleConfirmDelete}>Remove</button>
    </div>
  </div>,
  document.body
)}
```

### Add a new storage function
Pattern — always three steps:
```js
export async function myNewDelete(id) {
  // 1. Local write first (unauthenticated users never get an error from Supabase)
  const cache = lsGet('inv_some_key', {});
  delete cache[id];
  lsSet('inv_some_key', cache);

  // 2. Best-effort cloud
  const { error } = await db.myNewDelete(id);
  if (error) console.error('myNewDelete remote error', error);
}
```

### Add a new db.js function
```js
export async function myNewDelete(id) {
  if (await noSession()) return { data: null, error: new Error('no session') };
  const userId = await getCurrentUserId();
  const { error } = await supabase.from('my_table').delete().eq('id', id).eq('user_id', userId);
  return { error };
}
```

### Add a new chart to the dashboard
Add to `src/components/dashboard/DashboardCharts.jsx` (not Home.jsx).
Export the component, import it in `Home.jsx`. Keep Home.jsx as the data layer only.

---

## 7. File Naming Gotchas

| What you might search for | Actual file |
|--------------------------|-------------|
| `TopNav.jsx` | `src/components/navigation/BottomNav.jsx` (top nav bar, misnamed historically) |
| `Products.jsx` in `components/` | It's in `src/pages/Products.jsx` |
| `lib/` directory | Renamed to `services/` — if you see old imports, update the path |
| `TutorialOverlay.jsx` | Deprecated — use `OnboardingTutorial.jsx` |
| `InteractiveTutorial.jsx` | Deprecated — use `OnboardingTutorial.jsx` |
| `StoresPage.jsx` | Deprecated — use `StoreMap.jsx` |
| `DailyProgress.jsx` | Deprecated — replaced by Home.jsx charts |
| `useColors.js` | Deprecated — use `PRODUCT_COLORS` from `DashboardCharts.jsx` |

---

## 8. Pre-PR Checklist

Run these before every `git push`:

```bash
# 1. Build must pass with zero errors
npm run build

# 2. Check for smart quotes (the silent build killer)
grep -rn $'\xe2\x80\x98\|\xe2\x80\x99\|\xe2\x80\x9c\|\xe2\x80\x9d' src/ && echo "FOUND CURLY QUOTES" || echo "OK"

# 3. Verify you're on a feature branch, not main
git branch --show-current

# 4. Check nothing accidentally staged from public/ (version.json changes with every build)
git status
```

PR title format: `<verb> <what>` — concise, imperative.
Examples: `Fix delete modal on iOS`, `Add weekly statement view`, `Extract dashboard charts`

---

## 9. Onboarding Tutorial — Dev Reference

**Reset for testing:**
```js
localStorage.removeItem('inv_onboarding_complete')
```

**Step sequence:** Welcome → New Invoice → Invoice History → Store Map → Products

**Timing levers in `OnboardingTutorial.jsx`:**
- `type(selector, text, charDelay=18)` — `charDelay` controls typing speed per character
- Step 2 (New Invoice) intentionally uses `charDelay=38` — slower because that step has
  the most content. Don't speed it back up.
- `moveTo()` does NOT call `setRect()` — tooltip is anchored once per step.

**Tooltip position:** top for step 1, bottom for steps 2–5.
Controlled by `tooltipPos` state; set it at the start of each step, not during moves.

---

## 10. Invoice Data Shape Reference

Invoices in Supabase are reshaped to this app-level format in `db.js`:
```js
{
  number: 1042,              // invoice_number from DB
  date: 'June 2, 2025',     // human-readable date string (en-US locale)
  storeName: 'Corner Store',
  customerName: 'Mike J.',
  paymentStatus: 'paid' | 'unpaid' | 'partial',
  items: [
    { id, name, qty, price }
  ]
}
```
The `subtotalOf(inv)` helper used in Home and Reports:
```js
function subtotalOf(inv) {
  return (inv.items || []).reduce((s, i) => s + Number(i.qty) * Number(i.price), 0);
}
```
Copy this helper locally whenever you need invoice totals — don't re-invent it.

---

## 11. Quick Diagnostic Commands

```bash
# See what changed vs main (before opening a PR)
git diff main...HEAD --stat

# Find which file a symbol lives in
grep -r "functionName" src/ --include="*.jsx" --include="*.js" -l

# Check for any remaining deprecated imports
grep -r "from.*lib/" src/ --include="*.js" --include="*.jsx"
grep -r "TutorialOverlay\|InteractiveTutorial\|StoresPage\|DailyProgress\|useColors" src/

# Run build and see only errors (suppress the chunk-size warning)
npm run build 2>&1 | grep -v "Some chunks"
```
