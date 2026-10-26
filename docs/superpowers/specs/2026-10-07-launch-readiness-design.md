# Launch readiness — design

2026-10-07. Sub-project 1 of the "A + C" plan (launch readiness first, then new
features, each with its own spec). Decisions were made by the owner one at a time
in the brainstorm; each is recorded with the option chosen.

## Goal

Keiro is aimed at the public (owner, 2026-10-06), so data safety and first
impressions come first. Success: a driver and a store owner can sign up, invoice,
order and get paid without help, without losing anything, and the owner hears about
crashes and outages without being told by a user. Free tiers wherever possible.

## Scope

1. Storage safety: never fail silently, make room, smaller signatures, guest warning.
2. Crash reporting with Sentry (free plan).
3. Real version number in the app.
4. Sign-in emails through Gmail SMTP (owner setup) plus a spam hint.
5. Keep-awake ping for the free Supabase project (doubles as an outage alert).
6. Two-phone and on-device test script, checked into the repo.

Out of scope: moving storage to IndexedDB, redesigning PR #186, database migration
tracking (the "heavy users" option, not chosen), push notifications and App Store
distribution (need the paid Apple account), new features (sub-project 2+).

---

## 1. Storage safety

**Problem.** `lsSet` in `src/utils/storage.js` catches every `localStorage` write
error and only logs to the console. When the ~5 MB origin quota is full, every
local-first save (invoices, payments, the sync queue itself) is silently dropped
while the UI behaves as if it worked. Signatures are the main consumer:
`SignaturePad.jsx` exports at `devicePixelRatio` (3× on iPhone), 20–60 KB per image,
two per invoice, so a driver signing 30 stops a day fills the quota in days.

**Decision:** "Guard + make room".

### 1a. Never fail silently
- `lsSet(key, value)` returns `true` on success, `false` on failure. On a quota
  error (`QuotaExceededError`, or legacy code 22 / 1014) it runs `makeRoom()` and
  retries once. If it still fails it dispatches `EVENTS.STORAGE_FULL` and returns
  `false`. Existing callers that ignore the return value keep working.
- A global listener (alongside `SyncToast`) shows a persistent banner:
  "Not saved on this phone: Keiro's storage here is full." It stays until a later
  write succeeds.
- **Invoice generation** (`useInvoiceForm.handleGenerate`): if the local write of the
  invoice fails AND the cloud write did not succeed (offline, guest, or error), the
  form stays open with that message, so nothing typed is lost. If the cloud write
  succeeded, the invoice is saved and only the banner shows.
- The sync queue (`enqueueSync`) uses the same path: a failed enqueue raises the
  banner, never silently drops the change.

### 1b. Make room automatically
- `makeRoom()` (new module `src/utils/storageRoom.js`, which reads `localStorage`
  and `STORAGE_KEYS` directly and never imports `storage.js`, so `lsSet` can call it
  without a circular import) removes
  local copies of signature images (`inv_sig_<n>`) that are already in the cloud,
  oldest first, until usage is under ~70% of the measured quota or nothing more can
  be removed. "Already in the cloud" means the cloud has **confirmed** that exact
  version: a successful upload (direct or queue replay) stamps the stored entry with
  `syncedVersion = updatedAt`, and copies downloaded from the cloud arrive stamped.
  Unstamped entries (saved before this change, or an upload cut off by the app
  closing) are never removed, nor anything with a `sync_signature` action queued or
  set aside. (Tightened during planning: "not in the queue" alone would remove a
  signature whose upload was interrupted.) The signed-invoice index is left alone, so
  the invoice still shows as signed and `fetchSignatureFromCloud` re-downloads the
  image on open (existing behaviour).
- Never removed: anything in the sync queue, invoices or payments, guest data, the
  queue itself, device preferences.
- Runs at launch (after auth resolves) when usage is over 70%, and on any quota
  error.
- Usage is estimated as the sum of key and value lengths × 2 bytes against a 5 MB
  budget (browsers do not expose the localStorage quota).

### 1c. Smaller signatures
- `SignaturePad.jsx` exports at 1× (CSS pixel size) instead of `devicePixelRatio`.
  Drawing stays sharp on screen; only the saved PNG is downscaled. Expected ~10×
  smaller. Existing saved signatures are untouched.

### 1d. Guests
- Guests have no cloud copy, so nothing of theirs is ever removed. At ~80% usage a
  dismissible notice: "Create a free account so your invoices are backed up and this
  phone has room for more." Shown at most once per session.

### Tests
- `lsSet` returns false and dispatches `STORAGE_FULL` when `setItem` throws a quota
  error; returns true otherwise; retries after `makeRoom()`.
- Invoice generation keeps the form open with the message when local and cloud both
  fail; saves normally when the cloud succeeds.
- `makeRoom()` removes only uploaded signatures, oldest first, never one with a
  queued `sync_signature`, never guest data.
- Signature export size is CSS pixels, not device pixels.
- The guest notice appears at the threshold and not for signed-in users.

---

## 2. Crash reporting (Sentry)

**Decision:** "Sentry, free plan".

### Owner setup (documented step by step in the plan)
- Free Sentry account, a React project, its DSN (public by design) added to Vercel as
  `VITE_SENTRY_DSN` and to `.env.local` when testing.
- Optional: `SENTRY_AUTH_TOKEN` in Vercel so source maps upload at build time for
  readable stack traces. Without it reports still arrive, minified.

### App behaviour
- `@sentry/react`, imported dynamically after first paint so startup is not slowed.
  `errorLog.logError()` already funnels every render crash (ErrorBoundary) and every
  uncaught error / unhandled rejection; its commented `reportToRemote(entry)` becomes
  the real call. Entries logged before Sentry loads are flagged unsent and flushed
  once it is ready.
- No DSN (local dev, tests, CI): Sentry is never loaded; nothing is sent.
- Release = the build's git short hash (same value as `version.json`); environment =
  `web` or `ios-app` (`Capacitor.isNativePlatform()`).
- Sent: error message and stack, release, platform, browser/OS, current screen
  (tab / overlay id).
- Never sent: invoice contents, store or customer names, emails, phone numbers, IP
  (`sendDefaultPii: false`), URL query strings and hashes (invite codes), console
  breadcrumbs, session replay, performance tracing. A `beforeSend` scrubs URLs and
  drops `extra`/`user` fields.
- Cap: 20 events per app session.
- Opt-out: Settings → Privacy, "Send crash reports", on by default, stored as a
  device preference (`inv_` key in `STORAGE_KEYS`, kept across sign-out).
- Settings → Help gains "Send test report" (sends one test event, shows "Sent" or
  why not: no DSN, switched off, offline).
- `PRIVACY.md`, `Legal.jsx` and the Settings privacy blurb name Sentry under
  service providers and list exactly what is sent, consistent with each other.

### Tests
- No DSN: the Sentry module is never imported.
- `beforeSend` strips query strings, hashes and user fields.
- Switch off: nothing is sent; switch on: `logError` reports.
- Errors logged before load are flushed once, not twice.
- Session cap stops at 20.

---

## 3. Real version number

- `package.json` `version` becomes `5.9.0` (single source of truth).
- `vite.config.js` keeps `__APP_VERSION__` exactly as it is (the git short hash:
  `otaUpdate.js` and `useVersionCheck.js` compare it against `version.json` and
  `latest.json`) and adds `__APP_RELEASE__`, the `package.json` version.
- `AppFooter.jsx` and `About.jsx` show "Keiro 5.9 · build 4854eda"
  (`__APP_RELEASE__` major.minor and `__APP_VERSION__`) instead of the hardcoded
  "v5.9".
- Test: the footer renders both values.

## 4. Sign-in emails via Gmail

**Decision:** "Free: send from a Gmail".

- Owner setup: a Gmail account for Keiro, 2-Step Verification on, an app password;
  Supabase → Authentication → SMTP: host `smtp.gmail.com`, port 465, username and
  sender = that address, password = the app password, sender name "Keiro". Templates
  and the 30/hour rate limit stay. Gmail allows ~500 messages a day.
- App: the sign-up confirmation notice (`OnboardingFlow.jsx`), the password-reset
  sent notice and the email-change notice (`Profile.jsx`) add "Can't find it? Check
  your Spam folder."
- `CLAUDE.md` "Pending — real-world launch blockers" and `docs/CONTEXT.md` gotchas
  updated: Gmail SMTP instead of the Resend shared sender.
- Verification: sign up with an outside address; full "forgot password" round trip.

## 5. Keep-awake ping

**Decision:** "Free keep-awake ping".

- `.github/workflows/keep-supabase-awake.yml`: `schedule` every 3 days plus
  `workflow_dispatch`. One `GET $SUPABASE_URL/rest/v1/profiles?select=id&limit=1`
  with the anon key; anything but HTTP 200 fails the job, so GitHub emails the
  owner (an outage alert).
- Repo secrets `SUPABASE_URL` and `SUPABASE_ANON_KEY` (set by the owner, or by
  Claude with `gh secret set` once the owner OKs it).
- Caveat recorded in `CLAUDE.md`: GitHub disables scheduled workflows after 60 days
  without repo activity; any push re-arms it.

## 6. Device test script

- `docs/device-test.md`: numbered steps with expected results, for two phones
  (driver + store owner): email sign-up (Gmail delivery, spam check), Google sign-in
  on the iOS app, invite → connect, order → accept → invoice → signature → receive
  confirmation, an offline invoice that syncs on reconnect, the PDF share sheet, and
  "Send test report" reaching Sentry.
- `CLAUDE.md` points at it (it previously said a script existed; none was in the
  repo).

---

## Order of work

On branch `feature/launch-readiness`, one commit per item, tests and build green at
each: 1 storage safety → 2 crash reporting → 3 version → 4 spam hint and notes →
5 keep-awake workflow → 6 device test script. Owner merges.

## Owner actions (collected)

1. Gmail account, 2-Step Verification, app password, Supabase SMTP settings.
2. Sentry account, DSN into Vercel (`VITE_SENTRY_DSN`); optional `SENTRY_AUTH_TOKEN`.
3. GitHub repo secrets for the ping (or OK Claude to set them).
4. Merge the PR; run `docs/device-test.md` on two phones.
