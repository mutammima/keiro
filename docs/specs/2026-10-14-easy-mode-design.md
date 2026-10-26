# Easy Mode: scan → price → invoice, a printable template, and a tour for each mode

**Status**
- [x] Design agreed with the owner in chat (2026-10-14)
- [x] Spec reviewed by the owner
- [x] Implementation plan written (docs/superpowers/plans/2026-10-14-easy-mode.md)
- [x] Built test-first, verified on the real screens, merged (PR #190, live e01fe72)
- [ ] One real invoice made on the driver's phone

**Scope:** drivers only. Store-owner accounts are unchanged, and the Easy Mode switch is hidden
for them.

---

## Why

The driver (the owner's dad, Keiro's first user) writes invoices in a **handwritten invoice book**
today. What he needs from Keiro is the tedious part done for him: **scan an item → his price fills
in → the invoice gets made**, while he can still write the store, contact and signature by hand on
paper.

Easy Mode exists today (Settings → Easy Mode) but barely does anything: it opens on Route and
empties the ☰ menu. Its own description is wrong in two ways. It says Reports is hidden, but the
four top tabs are unchanged. It says Products stays, but Products is removed from the menu.

The first-run tour also has accuracy problems, checked by walking it on the live site (2026-10-14):
- Step 5 tells a new user to "tap any card…", but there are no invoices yet, and the actions are
  behind the ⋯ button.
- Step 6 is about invites, which need an account; the driver uses Stores for balances.
- Step 7 talks about Home, which Easy Mode will hide.
- It never mentions that scanned products and prices are remembered.

## Decisions (owner, 2026-10-14)

| Topic | Decision |
|---|---|
| What Easy Mode is for | Scan an item, check it, add it; the invoice is made from the scans |
| Scan flow | **Scan, then check each item** (name, qty, price) before the next scan |
| Paper | Handwritten book today; no printer yet. Design for a **letter-size page** (works with any AirPrint printer via Share → Print, and as a PDF on the phone) |
| Store name | **Optional**, with a type-to-search box over his stores (plus recent ones). Empty → blank line on paper |
| Printed template | Labeled **blank lines** for anything empty, plus **Paid by ☐ Cash ☐ Card ☐ Check**, only in Easy Mode |
| Tabs in Easy Mode | **Route · Stores · Reports** (Home hidden); ☰ menu keeps **Products** and **Settings** |
| Turning it on | **Settings switch only** (not asked during setup) |
| Tour | One per mode. Switching modes plays that mode's tour **only the first time**; replays only from **How it Works** |
| Signing on the phone / sending digitally | Stays in normal mode; may become a **paid** feature later (pricing is a separate design) |

---

## 1. The Easy invoice (what + New opens in Easy Mode)

```
Store  [ Sun…                    ]   ← type-to-search his stores; optional
       [Sunrise Deli] [Corner Mart] [Bodega 1]   ← his 3 most recently invoiced stores, one tap

            [  📷  Scan item  ]

  Mobil 1 5W-30 5qt        2 × 24.99     49.98
  Coca-Cola 12oz          24 ×  1.25     30.00
  + Add without scanning
                                TOTAL   $79.98

            [   Make invoice   ]
```

**Scan → check card → Add**
```
┌───────────────────────────────┐
│ Mobil 1 5W-30 5qt             │
│ Qty   [ − ]  1  [ + ]         │
│ Price  $24.99                 │
│ [ Cancel ]        [ Add ]     │
└───────────────────────────────┘
```
- **The name and price** come from his own catalog (`storage.getProductByBarcode`, with the
  phone-catalog fallback, UPC-E expansion and the store-made rule from #187/#189).
- **A product he hasn't scanned before:**
  - the name comes from `lookupBarcode` (Open Food Facts → `/api/barcode`), or he types it
  - the price is empty, and he types it once
  - **Add** saves name + price under the barcode (`saveProductBarcode`), so the next scan fills
    both
  - the existing messages for unknown, store-made and couldn't-check (with Try again) appear on
    the card
- **Add** puts the line on the list and **reopens the camera** for the next item. The camera
  screen gets a **Done** button to stop scanning.
- **Cancel** discards that scan and reopens the camera (a misread is usually rescanned straight
  away). **Done** on the camera is the only way out of the scan loop.
- **Scanning a barcode already on the list** opens its card with the quantity +1, and **Add
  updates that line** (never a second line for the same barcode). Draft lines remember the barcode
  they were scanned with, in memory only; nothing new is saved per line.
- **Add without scanning** opens the same card, empty. It uses the existing name autocomplete
  and price-from-name lookup.
- **Tapping a line** opens its card to change it, or **Remove** it.
- **Make invoice:**
  - date and time are automatic
  - status is Unpaid; he marks it paid from the list
  - no store name required in Easy Mode
  - it then opens the saved invoice (InvoiceView), whose **Share** button reads **Print / Share**
    in Easy Mode (the iPhone share sheet includes Print), plus **Download PDF**

**Left out of the Easy invoice:** customer name, phone, address, payment method, notes, and
on-phone signatures. They print as blank lines (section 2).

**Built on the same invoice logic.** The screen uses `useInvoiceForm`, so invoice numbering,
saving, the guest cap, the sync queue and edit/duplicate prefill all behave exactly as in normal
mode. Changes to the hook:
- skip the store-name check in Easy Mode
- the check card's pending item lives in the new screen, not the hook

**Edit and Duplicate in Easy Mode** (from ⋯ on an invoice) open the Easy invoice, prefilled.

## 2. The printed template (Easy Mode only)

```
                 YOUR BUSINESS NAME
                    (555) 123-4567
        Invoice No. 1042 · Oct 14, 2026 9:41 AM

  Store:   Sunrise Deli            ← or  Store: ____________________
  Contact: ________________   Phone: ________________
  Address: _________________________________________

  Item                           Qty    Price    Total
  ...                                     TOTAL   $79.98

  Paid by:  ☐ Cash   ☐ Card   ☐ Check     Amount: ________
  Notes: ___________________________________________

  ______________________        ______________________
  Seller / Deliverer             Buyer / Recipient
```
- `pdfGenerator` takes a template option, passed whenever Easy Mode is on at the time the PDF is
  made (first share or a later re-share).
- **In template layout:** every empty Bill-To field (store, contact, phone, address) and empty
  notes print as a labeled ruled line; filled fields print as today; the Paid-by line is added.
- **Signature lines** are already blank ruled lines when nobody signed. Unchanged.
- **Normal mode** PDFs are byte-for-byte the same as today.
- No data change: invoices already allow empty `store_name` (`not null default ''`).

## 3. Easy Mode screens

- **Tabs:** `tabs.js` gains an Easy driver set `route · stores · reports` (a stable module-level
  array, like the existing ones). App.jsx, TopNav and the desktop rail all read it from there.
  The app opens on Route (index 0 of the Easy set; today's code hard-codes index 1).
- **Hidden screens:** navigating to a tab that isn't in the current set (for example `home`) lands
  on Route instead.
- **☰ menu:** `NAV_ITEMS_EASY = [Products]`, plus Settings, Profile, How it Works and the account
  items that are always shown.
- **One place reads the setting:** a small `easyMode.js` replaces the duplicated
  `isEasyMode()` in App.jsx and NavDrawer. It only applies to drivers.
- **Settings:**
  - new description: "Scan items to make invoices. Shows Route, Stores and Reports, with
    Products and Settings in the menu. Hides Home, Store Info, Marketplace, My Listings and
    Notes."
  - the switch is hidden for store owners
  - toggling still reloads the app
- **Invoices with no store** are left out of the per-store rows in **Stores** and **Reports →
  top stores**, instead of being lumped under "Unknown". Stores shows a short note: "N invoices
  have no store. Open one and tap ⋯ → Edit to add it." Totals still include them.

## 4. The tours

**Choosing the tour:** steps are picked by role and mode.
- **Seen-flags:** per mode, `inv_tour_seen_full` / `inv_tour_seen_easy`, `inv_`-prefixed so
  backup/restore keeps them.
- **New user:** the existing first-run tour plays the tour for the current mode and marks it
  seen.
- **Switching modes in Settings:** after the reload, that mode's tour plays if its flag isn't
  set, then the flag is set.
- **Existing users** with `inv_onboarding_complete` count as having seen the **full** tour
  (migration rule), so the driver gets the Easy tour once when he turns Easy Mode on, and never
  an unexpected full tour.
- **"How it Works" / "Replay tutorial"** play the tour for the current mode, any time.
- **The Home pulse dot** after the tour: full mode only.

**Easy tour (driver, 7 steps).** It starts on Route.
1. **+ New** (tap): "Start an invoice."
2. **Store box** (Next): "Start typing a store and pick it. Or leave it blank and write it on the
   paper."
3. **Scan item** (Next): "Scan each item. Check the name, quantity and price, then tap Add, and
   the camera opens for the next one. New product? Type its price once; Keiro remembers it."
4. **Make invoice** (Next, returns to Route): "Tap Make invoice, then Print / Share. Anything you
   left empty prints as a blank line to fill in by hand."
5. **Invoice list** (Next): "Your invoices, newest first. Tap ⋯ on one to mark it Paid, send a
   reminder, or share it again."
6. **Stores** tab (tap): "What each store owes you. Tap a store for its full balance."
7. **Reports** tab (tap): "Your totals for Today, Week, Month or Year. End of Day, at the top,
   shows what you collected on your route."
- **Finish:** "Put your business name in Settings (☰ menu) so it prints on every invoice.
  Products, in the same menu, lets you fix a remembered name or price."

**Normal tour (driver, 7 steps).** Same targets as today; the text is fixed to match the app:
- **3:** "Type a product name (it suggests ones you've used) or tap the camera to scan its
  barcode. Keiro remembers the name and your price for next time."
- **4:** "When you're done, tap Generate Invoice. Then Share (WhatsApp, text, print…) or
  Download PDF."
- **5:** "Your invoices appear here, newest first. Tap ⋯ on one to mark it Paid, send a reminder,
  share it again, or edit it."
- **6:** "Every store you invoice appears here with what it owes. Tap one for its full balance.
  With an account, Invite links a store so its orders reach you directly."
- **7:** "Home shows today and the last 7 days; Reports breaks revenue down by Today, Week, Month
  or Year. End of Day, at the top of Reports, shows the cash and card you collected."

**Store-owner tour:** unchanged (not reviewed in this work).

## Testing

**Unit tests, written first (Vitest):**
- **Tabs:**
  - Easy driver set is Route/Stores/Reports; full and owner sets unchanged
  - stable references
  - navigating to a hidden tab lands on Route
- **Menu:** Easy shows Products (plus the always-shown items); full is unchanged.
- **Easy invoice (hook + screen):**
  - a known scan fills name and price
  - a new product saves name and price on Add
  - a rescan adds +1
  - removing a line
  - Make invoice with no store succeeds in Easy Mode and still fails in normal mode
  - the unknown, store-made and unavailable messages show on the card
  - edit and duplicate prefill
- **PDF:**
  - template layout prints the blank-line labels and the Paid-by line for empty fields
  - filled fields print their values
  - normal layout is unchanged
- **Tours:**
  - steps chosen by role and mode
  - seen-flags per mode, including the migration rule
  - switching plays once
  - How it Works always plays
- **Stores/Reports:** invoices with no store are excluded from per-store rows; the note count is
  right.

**On the real screens** (headless Chromium at 390px, fake camera with generated barcodes, as in
#187/#189):
- both tours walked step by step: every target found and on screen; screenshots
- one full Easy invoice: a known product, a new product (type its price), a rescan (+1), Make
  invoice, then the downloaded PDF checked for the blank lines and the Paid-by line

**On the driver's phone:** one real invoice end to end, and a test print once he has a printer.

## Out of scope (later)

- Pricing and paid features, including making on-phone signing and digital sending paid.
- Receipt (thermal) printers and a narrow receipt layout.
- Easy Mode for store owners; reviewing the store-owner tour.
- Shared product names, typing suggestions from other drivers, and "Is this it?" (#188, Part B).
