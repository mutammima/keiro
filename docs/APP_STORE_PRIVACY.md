# App Store Connect: privacy answers for Keiro

Copy these into **App Store Connect → your app → App Privacy**. Each answer was checked against the
code on `main` (2026-10-26, status updated 2026-10-27), not against the privacy policy. Before you
submit, do the two owner steps under "Before you submit" at the end. Re-check this file whenever a
feature starts sending something new off the phone.

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
| Location → **Coarse Location** | ✅ | The location saved with Marketplace posts and store requests, rounded to ~1 km since #198 (merged 2026-10-27). **Posts saved before that keep their exact position until `docs/COWORK_ROUND_MARKETPLACE_LOCATIONS.md` is run; until then tick Precise Location instead** |
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

App Store Connect requires a public URL:
`https://keiro-mutammimas-projects.vercel.app/privacy` (#199, merged 2026-10-27; built from
`PRIVACY.md` on every deploy). Open it once before pasting it in.

---

## Before you submit

The five gaps found on 2026-10-26 are fixed in the code:

| Gap | Fixed by |
|---|---|
| No public privacy-policy URL | #199: `/privacy`, built from `PRIVACY.md` |
| Exact GPS published with Marketplace posts | #198: rounded to 2 decimals (~1 km) before saving; a missing position stays empty instead of 0°, 0° |
| `PRIVACY.md` behind the in-app policy | #198: name, rounded location and the OpenStreetMap address lookup are in both |
| Settings said "We collect minimal usage data" | #198: removed (nothing collects usage data) |
| Account deletion was "email us" | #200: Settings → Security & Permissions → Delete account, and on Profile; the policy's retention section says so |

Two steps are still yours, and both change the live database, so they run through Cowork:

1. **Round the posts saved before #198**: `docs/COWORK_ROUND_MARKETPLACE_LOCATIONS.md`. Until it
   has run, tick Precise Location, not Coarse.
2. **Install account deletion on the server**: `docs/COWORK_ACCOUNT_DELETION.md`. Until it has run,
   the Delete account button says to email instead of deleting, which App Review rejects
   (guideline 5.1.1(v)).

## When to revisit

- Payments ship → Purchases → Purchase History (and Payment Info if card data ever touches Keiro).
- Sign in with Apple → nothing new to tick (still Name and Email), but the policy must mention it.
- Any analytics or new third-party SDK → Usage Data and possibly Identifiers.
