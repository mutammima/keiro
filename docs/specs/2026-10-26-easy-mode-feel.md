# Easy Mode: bottom tabs, a real Back, and a calmer tour

**Status**
- [x] Problem seen on the owner's iPhone 17 Pro, reproduced at its size (402×874 pt, 62 pt top / 34 pt bottom safe area)
- [x] Owner decisions (2026-10-26): Easy Mode first; bottom tabs + a labeled Back + swipe back; a slower guided tour
- [x] Built, tested, screenshots at iPhone 17 Pro size (dark and light)
- [ ] Owner tries it on the phone (Vercel preview in Safari, or the app after merge — it arrives over the air)
- [ ] Carry what works to normal mode and store owners

**Who it's for:** drivers who don't like technology. Every choice below favors "obvious and in reach"
over "compact".

## What was wrong (measured, 2026-10-26)

- **Back.** Most pages opened from the menu (Settings, Products, Profile, About, Privacy/Terms) had no
  Back at all: the top-left held ☰, so leaving meant opening the menu. Where a ← existed (Easy
  invoice) it was a bare glyph, 36×32 pt (under Apple's 44 pt minimum), right under the Dynamic
  Island — the hardest place to reach on a 6.3" phone. No swipe-back gesture existed.
- **Tabs** sat at the top too; the bottom half of most Easy screens was empty.
- **The tour ran ahead of the app.** 0.2 s after tapping + New, step 2's card was already showing,
  pointing at an empty ring where + New had been, while the invoice screen was still loading; then
  the highlight jumped. 14 px text, a 38 px Next button, Skip and the step counter up by the clock,
  no way to go back a step.

## 1. Navigation (Easy Mode, phone and tablet; desktop keeps its side rail)

- **Bottom tab bar** replaces the top strip: Route · Stores · Reports · More. 24 px icons over 13 px
  labels, 64 pt tall plus the home-indicator area. The current tab is filled with the accent color.
  **More** opens the existing menu (Products, Settings, Profile, How it Works, sign-in/out); tapping
  More again closes it. Swiping between tabs still works.
- **`‹ Back`** — one shared `BackButton` (chevron + the word, 17 pt, ≥ 44×44 pt) on every page that
  opens over the tabs: the Easy invoice, the invoice after Make invoice, a store's balance, and, in
  Easy Mode, Settings, Products, Profile, About, Privacy and Terms (which lose their ☰; Settings also
  loses its ✕, since Back does the same).
- **Swipe back**: a swipe from the left edge (starting within 24 pt) to the right goes back, the iPhone
  way. The page follows the finger; it triggers that page's own Back, so the Easy invoice still asks
  before throwing away items.
- Fixed banners (sync alerts, offline notice, Undo) sit above the bar: one CSS variable, `--tab-bar-h`,
  set while the bar is on screen; elsewhere it's 0 and nothing moves. The menu also ends above the bar
  (Sign Out was hidden under it) and starts below the clock (its ← sat under the Dynamic Island).

## 2. The tour (Easy Mode tour; the "wait for the screen" fix applies to every tour)

- **Waits for the screen.** A step shows only once its target exists and hasn't moved for 350 ms, and
  never sooner than 600 ms after the previous step. Until then the screen just stays dimmed — no card,
  no ring chasing a page that's still sliding in.
- **One big card, in a fixed place.** Docked at the bottom (or the top, when the thing it points at is
  in the lower half), 20 pt title, 18 pt text, fades in over 0.45 s.
- **Back and Next on every step**, 56 pt tall. On a "tap this" step Next does the tap for you, so
  nobody gets stuck. Back returns to the previous step's screen. "Skip tour" moves into the card,
  away from the clock.
- **Shorter, plainer words**, one idea per step:
  1. *Start a new invoice* — Tap New to start a new invoice.
  2. *Choose the store* — Type the store's name here. You can also leave it empty.
  3. *Scan what you deliver* — Tap Scan item and point the camera at the barcode. Do this for each item.
  4. *Finish the invoice* — When you're done, tap Make invoice. Then you can print it or send it.
  5. *Your invoices* — All your invoices are listed here, newest first. To mark one as paid, tap ⋯ on it.
     (Marking paid is the one thing on this screen a driver must know, so it stays.)
  6. *Stores* — Tap Stores to see how much each store owes you.
  7. *Reports* — Tap Reports to see your totals for today, this week and more.

## How it's built

- `BottomTabBar.jsx` (tabs + More, sets `--tab-bar-h`), `BackButton.jsx` (`data-back`), App.jsx
  `bottomTabs = easyMode && !desktop`, and `onBack` on the menu pages in that case.
- `useEdgeSwipeBack.js`: capture-phase, non-passive touch listeners on the shell; past a third of the
  width or a flick it slides the page out and presses `[data-back]`; if the page is still there (it
  asked first) it slides back.
- `useElementRect` returns `settled` (350 ms still, ≥ 600 ms after the step began, 2.5 s at most);
  Spotlight shows the hole and card only then (or after `missing`, ~1.5 s, for a target that never
  appears). QuickStart remounts Spotlight per step. `TourCard.jsx` is the Easy card; Easy steps carry
  `screen` for Back.
- Measured after: the card appears ~0.9 s after Next on step 1, once the invoice screen has stopped
  moving (before: 0.2 s, while it was still loading).

## Out of scope (for now)

Normal mode and store owners keep the top tabs and the current tour card (they get the "wait for the
screen" fix only). Larger text across Easy screens, and fewer things per screen, are the next step
once the owner has tried this.
