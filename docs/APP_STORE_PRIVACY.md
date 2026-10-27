# App Store Connect: privacy answers for Keiro

Copy these into **App Store Connect → your app → App Privacy**. Each answer was checked against the
code on `main` (2026-10-26), not against the privacy policy. Where the two disagree, see "Gaps" at
the end. Re-check this file whenever a feature starts sending something new off the phone.

Apple counts data as **collected** when it leaves the device and is kept longer than it takes to
answer the request. Data a guest keeps only on their phone is not collected. A barcode sent for a
lookup, or a store address sent to draw a map, is used to answer that one request and isn't kept,
so neither counts.

## Step 1: "Do you or your third-party partners collect data from this app?"

**Yes.**

## Step 2: data types to tick

| Apple's category → type | Tick? | What it is in Keiro |
|---|---|---|
| Contact Info → **Name** | ✅ | First and last name on the profile (`profiles`) |
| Contact Info → **Email Address** | ✅ | Sign-in email (Supabase Auth, also via Google sign-in) |
| Contact Info → **Phone Number** | ✅ | Business phone, saved on every invoice and published with Marketplace posts |
| Contact Info → Physical Address | ❌ | Keiro stores *stores'* addresses, not the user's own (that goes under User Content) |
| Financial Info → **Other Financial Info** | ✅ | Invoices (totals, line items, prices), payment records and paid/unpaid status |
| Financial Info → Payment Info / Credit Info | ❌ | No cards or bank details. Revisit when payments ship |
| Location → **Coarse Location** | ✅ | The location saved with Marketplace posts and store requests, rounded to ~1 km by #198. **Before #198 ships, and until the existing posts are rounded (its cowork doc), tick Precise Location instead** |
| User Content → **Other User Content** | ✅ | Store/customer names, store phones and addresses, products, notes, orders, drawn signatures |
| User Content → Photos or Videos | ❌ | The camera only reads barcodes; no image is kept |
| Identifiers → **User ID** | ✅ | The Supabase account ID |
| Identifiers → Device ID | ❌ | None collected |
| Diagnostics → **Crash Data** | ✅ | Sentry crash reports (on by default, can be switched off) |
| Purchases → Purchase History | ❌ | Not until payments ship (the plan status alone isn't a purchase) |
| Usage Data, Browsing/Search History, Contacts, Health, Sensitive Info, Body, Surroundings, Audio | ❌ | None |

## Step 3: for each ticked type

Apple asks three questions per type. For Keiro the answers are the same everywhere except Crash Data.

| Type | Used for | Linked to the user? | Used for tracking? |
|---|---|---|---|
| Name | App Functionality | Yes | No |
| Email Address | App Functionality | Yes | No |
| Phone Number | App Functionality | Yes | No |
| Other Financial Info | App Functionality | Yes | No |
| Coarse Location | App Functionality | Yes | No |
| Other User Content | App Functionality | Yes | No |
| User ID | App Functionality | Yes | No |
| Crash Data | App Functionality | **No**: reports carry no user ID, email or IP (`crashReporter.js` drops `user` and turns off IP, cookies, headers and query strings) | No |

**Tracking: No for everything.** Keiro has no ads, no ad SDKs and no data brokers, and doesn't
combine its data with other companies' data. So the app doesn't need the App Tracking Transparency
prompt.

Purposes not used anywhere: Third-Party Advertising, Developer's Advertising or Marketing,
Analytics, Product Personalization, Other Purposes.

## Step 4: Privacy Policy URL

App Store Connect requires a public URL. Once #199 is live, it's
`https://keiro-mutammimas-projects.vercel.app/privacy` (built from `PRIVACY.md` on every deploy).

---

## Gaps found while checking (fix before the public release)

Status 2026-10-26: gaps 1–4 have PRs (#199 for 1, #198 for 2–4). Gap 5 is designed in #196.

1. **No public privacy-policy URL.** The policy exists in the repo (`PRIVACY.md`) and inside the app
   (Legal page), but the website has no page at a public address. Options:
   - **A page on the existing site:** e.g. `…vercel.app/privacy`, generated from `PRIVACY.md` at
     build time so it can't drift from the copy in the repo. This is the recommended option, and a
     small code task.
   - **A link to `PRIVACY.md` on GitHub.** That only works if the repo is public.
2. **Exact GPS coordinates are published to every signed-in user.** Marketplace posts and store
   requests save the phone's position unrounded (`MyListings.jsx`, `NewRequest.jsx`). Anyone signed
   in can read them, which can point to someone's home. "Near me" sorting only needs about 1 km.
   **Recommend rounding to 2 decimals (~1 km) before saving.** That's a two-line change, and the
   label can then say **Coarse Location** instead of Precise. The in-app policy already discloses
   the coordinates; `PRIVACY.md` doesn't mention location at all.
3. **`PRIVACY.md` is behind the in-app policy.** Section 2 doesn't mention the profile name,
   location, or that a store's address is sent to OpenStreetMap (Nominatim) to show it on the map.
4. **Settings says "We collect minimal usage data."** No code collects usage data (no analytics
   anywhere), so the sentence is wrong in the cautious direction and would contradict a "no Usage
   Data" label. Remove it.
5. **Account deletion** is still "email us". See `docs/specs/2026-10-26-account-deletion.md` (#196).
   Once it ships, update the policy's retention section.

## When to revisit

- Payments ship → Purchases → Purchase History (and Payment Info if card data ever touches Keiro).
- Sign in with Apple → nothing new to tick (still Name and Email), but the policy must mention it.
- Any analytics or new third-party SDK → Usage Data and possibly Identifiers.
