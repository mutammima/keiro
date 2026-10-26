# Launch Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Keiro safe and observable for public users: no silent save failures,
crash reports reaching the owner, a real version number, deliverable sign-in emails,
an always-awake database that doubles as an outage alert, and a two-phone test script.

**Architecture:** A new guarded-write module (`src/utils/storageRoom.js`) sits under
every important `localStorage` write (`lsSet`, the sync queue, signatures). It frees
room by removing signature images the cloud has confirmed, and announces a full disk
through window events that a banner listens to. Crash reports reuse the single funnel
`errorLog.logError()` already provides, through a lazily loaded, scrubbed Sentry.
Everything else is small local edits, a GitHub Actions workflow and docs.

**Tech Stack:** React 19, Vite 8, Vitest 3 (jsdom + Testing Library), Supabase JS 2,
Capacitor 8, `@sentry/react`, `@sentry/vite-plugin` (optional), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-07-launch-readiness-design.md`

## Global Constraints

- Work on branch `feature/launch-readiness`; never commit to `main`; one commit per task.
- Inline styles only; static styles in `const s = { ... }` at the bottom of the file;
  colours from `C` tokens; banners/modals `createPortal(..., document.body)`, z-index 150.
- Every `localStorage` key is `inv_`-prefixed and declared in `STORAGE_KEYS`; every
  window event name in `EVENTS` (`src/utils/constants.js`).
- `__APP_VERSION__` stays the git short hash: `otaUpdate.js` and `useVersionCheck.js`
  compare it. The new release number is `__APP_RELEASE__`.
- Tests live in `src/__tests__/`, import from `'vitest'` explicitly (`globals: false`),
  and mock `../services/db` instead of touching Supabase.
- Run the suite the way CI does, without `.env`:
  `mv .env /tmp/keiro.env.bak; npx vitest run; mv /tmp/keiro.env.bak .env`
  (CI has no `.env`; a test must not depend on `VITE_*` values).
- `npm run build` must pass after every task; `npx eslint src` must report no new errors.
- No smart/curly quotes in `.js`/`.jsx` (Vite build crash). Strings with an
  apostrophe use double quotes.
- Sentry must never receive invoice contents, store/customer names, emails, phone
  numbers, the IP address, URL query strings or hashes (invite codes), console or
  network breadcrumbs, session replay or performance traces.
- Owner-only steps (Gmail, Sentry, Vercel env, GitHub secrets, merging) are listed in
  "Owner actions" at the end; never attempt them without the owner.

## Review Focus

1. A signature saved before this change (no `syncedVersion`) must never be removed by
   `makeRoom()` — test in Task 1.
2. The signed-invoice index key `inv_sig_index` starts with the signature prefix
   `inv_sig_`; `makeRoom()` must never remove it — test in Task 1.
3. A guest (no session, so the cloud save fails) whose phone is full presses Generate:
   the form must stay open with everything typed — test in Task 2.
4. Signing out must keep the "Send crash reports" choice, a device preference —
   test in Task 6.
5. A build with no Sentry DSN must cost nothing: Sentry never imported, nothing queued
   or sent — test in Task 6.

---

## File structure

| File | Status | Responsibility |
|---|---|---|
| `src/utils/storageRoom.js` | create | Guarded writes, usage estimate, make-room, upload stamps, launch check |
| `src/utils/constants.js` | modify | `EVENTS.STORAGE_FULL/OK`, `STORAGE_FULL_MESSAGE`, `STORAGE_KEYS.CRASH_REPORTS`, `SPAM_HINT` |
| `src/utils/storage.js` | modify | `lsSet` returns success; `saveInvoice` returns `savedLocally` |
| `src/utils/syncQueue.js` | modify | Queue writes guarded; `enqueueSync` returns success; replayed signature stamped |
| `src/utils/signatureStorage.js` | modify | Guarded signature write; upload and cloud copies stamped |
| `src/hooks/useInvoiceForm.js` | modify | Keep the form when the invoice was saved nowhere |
| `src/components/ui/StorageBanner.jsx` | create | "Storage full" banner, guest notice, launch check |
| `src/App.jsx` | modify | Mount `StorageBanner`; tag crash reports with the current screen |
| `src/utils/signatureImage.js` | create | 1× export; recolour a signature's ink |
| `src/components/ui/SignaturePad.jsx` | modify | Use the 1× export; redraw saved ink in the theme colour |
| `src/utils/pdfGenerator.js` | modify | Print signatures in near-black ink |
| `src/utils/crashReporter.js` | create | Lazy Sentry, scrubbing, cap, opt-out, test report |
| `src/utils/errorLog.js` | modify | `logError` reports through `crashReporter` |
| `src/main.jsx` | modify | Start the crash reporter after first paint |
| `src/services/auth.js` | modify | Keep `inv_crash_reports` across sign-out; export `DEVICE_PREF_KEYS` |
| `src/pages/Settings.jsx` | modify | "Send crash reports" switch; "Send test report" row; privacy blurb |
| `PRIVACY.md`, `src/pages/Legal.jsx` | modify | Name Sentry and what it receives; real contact address |
| `vite.config.js`, `eslint.config.js`, `package.json` | modify | `__APP_RELEASE__`; version `5.9.0`; optional source-map upload |
| `src/utils/appVersion.js` | create | `versionLabel()` |
| `src/components/navigation/AppFooter.jsx`, `src/pages/About.jsx` | modify | Show the real version |
| `src/components/auth/OnboardingFlow.jsx`, `src/pages/Profile.jsx` | modify | Spam hint on "we sent you an email" notices |
| `.github/workflows/keep-supabase-awake.yml` | create | Ping every 3 days; failing run = outage email |
| `docs/device-test.md` | create | Two-phone + on-device test script |
| `CLAUDE.md`, `docs/CONTEXT.md` | modify | Email setup, keep-awake, device test pointer |
| Tests | create | `storageRoom.test.js`, `storageBanner.test.jsx`, `signatureImage.test.js`, `crashReporter.test.js`, `appVersion.test.js`; extend `invoiceFlow.test.jsx` |

---

### Task 1: Guarded writes and make-room

**Files:**
- Create: `src/utils/storageRoom.js`
- Modify: `src/utils/constants.js` (EVENTS), `src/utils/storage.js:35-41`, `src/utils/syncQueue.js:89-95,105-131`, `src/utils/signatureStorage.js:47-67,140-187`
- Test: `src/__tests__/storageRoom.test.js`

**Interfaces:**
- Produces: `writeLocal(key: string, text: string): boolean`, `makeRoom({ target?: number } = {}): number`,
  `markSignatureSynced(invoiceNumber: number|string, version: string): void`,
  `estimateUsage(): number`, `isQuotaError(e): boolean`, `isStorageFull(): boolean`,
  `_resetStorageRoomForTests(): void`, constants `STORAGE_BUDGET_BYTES`, `MAKE_ROOM_TARGET`, `GUEST_WARN_AT`;
  `EVENTS.STORAGE_FULL = 'inv-storage-full'`, `EVENTS.STORAGE_OK = 'inv-storage-ok'`;
  `lsSet(key, value): boolean`; `enqueueSync(action): boolean`.
- Signature entries gain `syncedVersion` (equal to `updatedAt` once the cloud has that version).

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/storageRoom.test.js`:

```js
/**
 * storageRoom.test.js
 *
 * localStorage holds ~5 MB and a full one throws on write. These tests pin the
 * guarded write (never fail silently), make-room (only remove what the cloud is
 * known to have), and the callers that now report a failed write.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../services/db', () => ({
  saveSignatureRow:   vi.fn(async () => ({ error: null })),
  deleteSignatureRow: vi.fn(async () => ({ error: null })),
  saveInvoice:        vi.fn(async () => ({ error: new Error('offline') })),
}));

import {
  writeLocal, makeRoom, markSignatureSynced, estimateUsage, isQuotaError,
  isStorageFull, _resetStorageRoomForTests,
} from '../utils/storageRoom';
import { EVENTS, STORAGE_KEYS } from '../utils/constants';
import { lsSet } from '../utils/storage';
import { enqueueSync, processSyncQueue } from '../utils/syncQueue';
import { saveSignatures } from '../utils/signatureStorage';

function quotaError() {
  return new DOMException('The quota has been exceeded.', 'QuotaExceededError');
}

/** A stored signature entry; `synced` stamps it as confirmed in the cloud. */
function sig(n, { at, synced = true, size = 1000 }) {
  const updatedAt = new Date(at).toISOString();
  localStorage.setItem(STORAGE_KEYS.SIG_PREFIX + n, JSON.stringify({
    seller: 'data:image/png;base64,' + 'A'.repeat(size),
    buyer: null,
    updatedAt,
    ...(synced ? { syncedVersion: updatedAt } : {}),
  }));
}

beforeEach(() => {
  localStorage.clear();
  _resetStorageRoomForTests();
});

describe('isQuotaError', () => {
  it('recognises the standard name and the legacy codes', () => {
    expect(isQuotaError(quotaError())).toBe(true);
    expect(isQuotaError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' })).toBe(true);
    expect(isQuotaError({ code: 22 })).toBe(true);
    expect(isQuotaError({ code: 1014 })).toBe(true);
    expect(isQuotaError(new Error('other'))).toBe(false);
  });
});

describe('writeLocal', () => {
  let setItem;
  beforeEach(() => { setItem = vi.spyOn(Storage.prototype, 'setItem'); });
  afterEach(() => { setItem.mockRestore(); });

  it('writes and returns true', () => {
    expect(writeLocal('inv_x', '"a"')).toBe(true);
    expect(localStorage.getItem('inv_x')).toBe('"a"');
  });

  it('frees room and retries once when the first write hits the quota', () => {
    setItem.mockImplementationOnce(() => { throw quotaError(); });
    const onFull = vi.fn();
    window.addEventListener(EVENTS.STORAGE_FULL, onFull);
    expect(writeLocal('inv_x', '"a"')).toBe(true);
    expect(localStorage.getItem('inv_x')).toBe('"a"');
    expect(onFull).not.toHaveBeenCalled();
    window.removeEventListener(EVENTS.STORAGE_FULL, onFull);
  });

  it('returns false and announces STORAGE_FULL when there is still no room, then STORAGE_OK on the next success', () => {
    const onFull = vi.fn();
    const onOk = vi.fn();
    window.addEventListener(EVENTS.STORAGE_FULL, onFull);
    window.addEventListener(EVENTS.STORAGE_OK, onOk);
    setItem.mockImplementation(() => { throw quotaError(); });

    expect(writeLocal('inv_x', '"a"')).toBe(false);
    expect(isStorageFull()).toBe(true);
    expect(onFull).toHaveBeenCalledTimes(1);

    setItem.mockRestore();
    expect(writeLocal('inv_x', '"b"')).toBe(true);
    expect(isStorageFull()).toBe(false);
    expect(onOk).toHaveBeenCalledTimes(1);

    window.removeEventListener(EVENTS.STORAGE_FULL, onFull);
    window.removeEventListener(EVENTS.STORAGE_OK, onOk);
  });

  it('returns false without announcing for a failure that is not about space', () => {
    setItem.mockImplementation(() => { throw new Error('SecurityError'); });
    const onFull = vi.fn();
    window.addEventListener(EVENTS.STORAGE_FULL, onFull);
    expect(writeLocal('inv_x', '"a"')).toBe(false);
    expect(onFull).not.toHaveBeenCalled();
    window.removeEventListener(EVENTS.STORAGE_FULL, onFull);
  });

  it('lsSet and enqueueSync report a write that could not happen', () => {
    setItem.mockImplementation(() => { throw quotaError(); });
    expect(lsSet('inv_x', { a: 1 })).toBe(false);
    expect(enqueueSync({ type: 'save_invoice', payload: { invoice: { number: 1001 } } })).toBe(false);
  });
});

describe('makeRoom', () => {
  it('removes signatures the cloud has confirmed, oldest first, and stops once under the target', () => {
    sig(1001, { at: '2026-01-01' });
    sig(1002, { at: '2026-02-01' });
    sig(1003, { at: '2026-03-01' });
    const each = estimateUsage() / 3;
    makeRoom({ target: estimateUsage() - each * 1.5 }); // needs exactly two removed

    expect(localStorage.getItem('inv_sig_1001')).toBeNull();
    expect(localStorage.getItem('inv_sig_1002')).toBeNull();
    expect(localStorage.getItem('inv_sig_1003')).not.toBeNull();
  });

  it('never removes a signature not confirmed in the cloud, waiting to upload, or set aside', () => {
    sig(1001, { at: '2026-01-01', synced: false }); // saved before this change, or upload unconfirmed
    sig(1002, { at: '2026-01-02' });
    sig(1003, { at: '2026-01-03' });
    localStorage.setItem(STORAGE_KEYS.SYNC_QUEUE, JSON.stringify([
      { id: 'a', type: 'sync_signature', payload: { invoiceNumber: 1002 } },
    ]));
    localStorage.setItem(STORAGE_KEYS.SYNC_FAILED, JSON.stringify([
      { id: 'b', type: 'sync_signature', payload: { invoiceNumber: 1003 } },
    ]));

    expect(makeRoom({ target: 0 })).toBe(0);
    expect(localStorage.getItem('inv_sig_1001')).not.toBeNull();
    expect(localStorage.getItem('inv_sig_1002')).not.toBeNull();
    expect(localStorage.getItem('inv_sig_1003')).not.toBeNull();
  });

  it('keeps the signed-invoice index, invoices and the queue', () => {
    sig(1001, { at: '2026-01-01' });
    localStorage.setItem(STORAGE_KEYS.SIG_INDEX, JSON.stringify([1001]));
    localStorage.setItem(STORAGE_KEYS.LIST, JSON.stringify([{ number: 1001 }]));
    localStorage.setItem(STORAGE_KEYS.SYNC_QUEUE, JSON.stringify([]));

    makeRoom({ target: 0 });

    expect(localStorage.getItem('inv_sig_1001')).toBeNull();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.SIG_INDEX))).toEqual([1001]);
    expect(localStorage.getItem(STORAGE_KEYS.LIST)).not.toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.SYNC_QUEUE)).not.toBeNull();
  });

  it('removes nothing for a guest, whose phone is the only copy', () => {
    sig(1001, { at: '2026-01-01' });
    localStorage.setItem(STORAGE_KEYS.GUEST_MODE, 'true');
    expect(makeRoom({ target: 0 })).toBe(0);
    expect(localStorage.getItem('inv_sig_1001')).not.toBeNull();
  });
});

describe('upload stamps', () => {
  it('markSignatureSynced stamps only the version that was uploaded', () => {
    sig(1001, { at: '2026-01-01', synced: false });
    const { updatedAt } = JSON.parse(localStorage.getItem('inv_sig_1001'));

    markSignatureSynced(1001, '2025-12-31T00:00:00.000Z'); // an older upload finishing late
    expect(JSON.parse(localStorage.getItem('inv_sig_1001')).syncedVersion).toBeUndefined();

    markSignatureSynced(1001, updatedAt);
    expect(JSON.parse(localStorage.getItem('inv_sig_1001')).syncedVersion).toBe(updatedAt);
  });

  it('saveSignatures stamps the signature once the cloud accepts it', async () => {
    saveSignatures(1001, 'data:image/png;base64,AAA', null);
    await vi.waitFor(() => {
      const entry = JSON.parse(localStorage.getItem('inv_sig_1001'));
      expect(entry.syncedVersion).toBe(entry.updatedAt);
    });
  });

  it('a queued signature replay stamps it once uploaded', async () => {
    sig(1001, { at: '2026-01-01', synced: false });
    localStorage.setItem(STORAGE_KEYS.SYNC_QUEUE, JSON.stringify([
      { id: 'a', type: 'sync_signature', payload: { invoiceNumber: 1001 }, ts: 1, retries: 0 },
    ]));
    await processSyncQueue();
    const entry = JSON.parse(localStorage.getItem('inv_sig_1001'));
    expect(entry.syncedVersion).toBe(entry.updatedAt);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `mv .env /tmp/keiro.env.bak; npx vitest run src/__tests__/storageRoom.test.js; mv /tmp/keiro.env.bak .env`
Expected: FAIL — `Failed to resolve import "../utils/storageRoom"`.

- [ ] **Step 3: Add the events**

In `src/utils/constants.js`, inside `export const EVENTS = { ... }`, after `DENSITY_CHANGE`:

```js
  // This phone's storage for Keiro is full: a write failed even after
  // makeRoom() (utils/storageRoom.js). STORAGE_OK follows the next write that
  // succeeds. StorageBanner listens for both.
  STORAGE_FULL:   'inv-storage-full',
  STORAGE_OK:     'inv-storage-ok',
```

- [ ] **Step 4: Create `src/utils/storageRoom.js`**

```js
/**
 * storageRoom.js — Keiro's guarded localStorage writes.
 *
 * localStorage gives the app about 5 MB, and a full one throws on write.
 * Before this module, lsSet and the sync queue caught that and only logged it,
 * so a save could vanish while the app carried on as if it had worked. Now:
 *
 *   writeLocal(key, text)  writes; on a quota error frees room (makeRoom) and
 *                          tries once more; if it still fails it returns false
 *                          and announces EVENTS.STORAGE_FULL (StorageBanner).
 *   makeRoom()             removes this phone's copies of signature images the
 *                          cloud is known to have, oldest first. Nothing else
 *                          is ever removed: not invoices, payments, the sync
 *                          queue, guest data, or a signature not yet uploaded.
 *
 * A signature counts as "in the cloud" only when its stored entry carries
 * syncedVersion === updatedAt. markSignatureSynced() stamps that after an upload
 * of exactly that version succeeds, and copies downloaded from the cloud arrive
 * stamped. Entries saved before this module existed carry no stamp and are
 * never removed. Removing an image leaves the signed-invoice index alone, so the
 * invoice still shows as signed and fetchSignatureFromCloud() brings the image
 * back when the invoice is opened.
 *
 * This module must never import storage.js: storage.js imports it.
 */

import { STORAGE_KEYS, EVENTS } from './constants';
import { isGuest } from './guestMode';

/** Browsers give an origin about 5 MB of localStorage and do not say exactly. */
export const STORAGE_BUDGET_BYTES = 5 * 1024 * 1024;
/** makeRoom() frees space until usage is under this share of the budget. */
export const MAKE_ROOM_TARGET = 0.7;
/** A guest is warned at this share: they have no cloud copy to fall back on. */
export const GUEST_WARN_AT = 0.8;

const SIG_PREFIX = STORAGE_KEYS.SIG_PREFIX;
// Exactly `inv_sig_<digits>`: the index key `inv_sig_index` shares the prefix.
const SIG_KEY = new RegExp(`^${SIG_PREFIX}(\\d+)$`);

let full = false;

export function isQuotaError(e) {
  if (!e) return false;
  return e.name === 'QuotaExceededError'
    || e.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    || e.code === 22
    || e.code === 1014;
}

/** Bytes in use, approximately: JS strings are UTF-16, two bytes a character. */
export function estimateUsage() {
  let chars = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) chars += k.length + (localStorage.getItem(k) || '').length;
    }
  } catch {
    return 0;
  }
  return chars * 2;
}

/** True after a write failed for lack of space, until one succeeds. */
export function isStorageFull() {
  return full;
}

function announce(name) {
  try { window.dispatchEvent(new CustomEvent(name)); } catch { /* no DOM */ }
}

function succeeded() {
  if (full) {
    full = false;
    announce(EVENTS.STORAGE_OK);
  }
  return true;
}

/**
 * Writes one localStorage value.
 * @param {string} key
 * @param {string} text  already serialised
 * @returns {boolean} whether it was written
 */
export function writeLocal(key, text) {
  try {
    localStorage.setItem(key, text);
    return succeeded();
  } catch (e) {
    if (!isQuotaError(e)) {
      console.error('localStorage write failed', key, e);
      return false;
    }
  }
  makeRoom();
  try {
    localStorage.setItem(key, text);
    return succeeded();
  } catch (e) {
    console.error('localStorage is full; not saved', key, e);
    full = true;
    announce(EVENTS.STORAGE_FULL);
    return false;
  }
}

/** Invoice numbers with a signature change still waiting to upload or set aside. */
function signaturesAwaitingUpload() {
  const waiting = new Set();
  for (const key of [STORAGE_KEYS.SYNC_QUEUE, STORAGE_KEYS.SYNC_FAILED]) {
    try {
      const list = JSON.parse(localStorage.getItem(key) || '[]');
      if (!Array.isArray(list)) continue;
      for (const a of list) {
        if (a?.type === 'sync_signature') waiting.add(Number(a.payload?.invoiceNumber));
      }
    } catch { /* unreadable: nothing known to be waiting there */ }
  }
  return waiting;
}

/**
 * Frees space by removing local copies of signature images the cloud is known
 * to have, oldest first, until usage is under `target` bytes.
 * @param {{ target?: number }} [opts]
 * @returns {number} approximate bytes freed
 */
export function makeRoom({ target = MAKE_ROOM_TARGET * STORAGE_BUDGET_BYTES } = {}) {
  if (isGuest()) return 0;
  let usage = estimateUsage();
  if (usage <= target) return 0;
  const waiting = signaturesAwaitingUpload();
  const candidates = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const m = key ? SIG_KEY.exec(key) : null;
      if (!m || waiting.has(Number(m[1]))) continue;
      const raw = localStorage.getItem(key) || '';
      let entry = null;
      try { entry = JSON.parse(raw); } catch { continue; }
      if (!entry?.updatedAt || entry.syncedVersion !== entry.updatedAt) continue;
      candidates.push({ key, bytes: (key.length + raw.length) * 2, at: Date.parse(entry.updatedAt) || 0 });
    }
  } catch {
    return 0;
  }
  candidates.sort((a, b) => a.at - b.at);
  let freed = 0;
  for (const c of candidates) {
    if (usage <= target) break;
    try {
      localStorage.removeItem(c.key);
      usage -= c.bytes;
      freed += c.bytes;
    } catch { /* leave it */ }
  }
  return freed;
}

/**
 * Records that the cloud holds this invoice's signatures as of `version` (the
 * entry's updatedAt when it was uploaded). Stamps nothing if the entry changed
 * since, so a newer, not-yet-uploaded signature is never taken for uploaded.
 * @param {number|string} invoiceNumber
 * @param {string} version
 */
export function markSignatureSynced(invoiceNumber, version) {
  if (!version) return;
  const key = SIG_PREFIX + invoiceNumber;
  try {
    const entry = JSON.parse(localStorage.getItem(key) || 'null');
    if (!entry || entry.updatedAt !== version || entry.syncedVersion === version) return;
    localStorage.setItem(key, JSON.stringify({ ...entry, syncedVersion: version }));
  } catch { /* a missed stamp only means this image is never removed */ }
}

/** Test-only: forget the "full" state between tests. */
export function _resetStorageRoomForTests() {
  full = false;
}
```

- [ ] **Step 5: Route `lsSet` through it**

In `src/utils/storage.js`, add the import under the existing imports:

```js
import { writeLocal } from './storageRoom';
```

Replace `lsSet` (lines 35-41) with:

```js
/**
 * Writes a value as JSON. Returns whether it was written: false means this
 * phone's storage is full even after freeing room (StorageBanner says so).
 * @returns {boolean}
 */
export function lsSet(key, value) {
  let text;
  try {
    text = JSON.stringify(value);
  } catch (e) {
    console.error('lsSet: value cannot be stored', key, e);
    return false;
  }
  return writeLocal(key, text);
}
```

- [ ] **Step 6: Guard the sync queue and stamp replayed signatures**

In `src/utils/syncQueue.js`, add to the imports:

```js
import { writeLocal, markSignatureSynced } from './storageRoom';
```

Replace the `sync_signature` handler (lines 89-95) with:

```js
  sync_signature:          (p) => {
    let sig = null;
    try { sig = JSON.parse(localStorage.getItem(STORAGE_KEYS.SIG_PREFIX + p.invoiceNumber) || 'null'); } catch { /* unreadable → treat as cleared */ }
    if (!(sig && (sig.seller || sig.buyer))) return db.deleteSignatureRow(p.invoiceNumber);
    return db.saveSignatureRow({ invoiceNumber: p.invoiceNumber, seller: sig.seller || null, buyer: sig.buyer || null })
      .then((res) => {
        // The cloud now has this exact version: makeRoom may drop the local copy.
        if (!res?.error) markSignatureSynced(p.invoiceNumber, sig.updatedAt);
        return res;
      });
  },
```

Replace `writeList` (lines 105-107) with:

```js
function writeList(key, list) {
  return writeLocal(key, JSON.stringify(list));
}
```

Replace `enqueueSync` (lines 118-131) with:

```js
/**
 * Parks a failed cloud write for automatic retry. No-op for guests.
 * @param {{ type: string, payload?: object }} action
 * @returns {boolean} whether it was parked (false for a guest, an unknown type,
 *   or when this phone's storage is full; StorageBanner reports the last one)
 */
export function enqueueSync(action) {
  if (isGuest()) return false;                 // no cloud target — nothing to retry
  if (!action || !HANDLERS[action.type]) {
    console.error('enqueueSync: unknown action type', action?.type);
    return false;
  }
  const q = read();
  q.push({ id: uid(), type: action.type, payload: action.payload || {}, ts: Date.now(), retries: 0 });
  return write(q);
}
```

- [ ] **Step 7: Guard signature writes and stamp uploads**

In `src/utils/signatureStorage.js`, add to the imports:

```js
import { writeLocal, markSignatureSynced } from './storageRoom';
```

Replace the body of `saveSignatures` from `try {` through the `db.saveSignatureRow(...)` chain (lines 53-66) with:

```js
  const updatedAt = new Date().toISOString();
  const wrote = writeLocal(
    PREFIX + invoiceNumber,
    JSON.stringify({ seller: sellerSig, buyer: buyerSig, updatedAt })
  );
  // The index says "signed" even if only the cloud ends up with the image.
  markIndexed(invoiceNumber, true);
  // Cloud sync. A failure is queued only when this phone holds the image: the
  // queue replays whatever is stored locally, and replaying a missing entry
  // would delete the cloud's older signature.
  db.saveSignatureRow({ invoiceNumber, seller: sellerSig, buyer: buyerSig })
    .then(({ error }) => {
      if (error) { if (wrote) queueSignatureSync(invoiceNumber, error); }
      else markSignatureSynced(invoiceNumber, updatedAt);
    })
    .catch(e => { if (wrote) queueSignatureSync(invoiceNumber, e); });
```

In `fetchSignatureFromCloud` and `cacheAllSignaturesForBackup`, the stored object comes from the cloud, so stamp it. In each `JSON.stringify({ ... })`, after the `updatedAt:` line add:

```js
        syncedVersion: data.updated_at,
```

(in `cacheAllSignaturesForBackup` it is `row.updated_at`).

- [ ] **Step 8: Run the tests to verify they pass**

Run: `mv .env /tmp/keiro.env.bak; npx vitest run; mv /tmp/keiro.env.bak .env`
Expected: all files pass, including the 15 new tests in `storageRoom.test.js` and the
existing `syncQueue.test.js` and `signatureSync.test.js`.

- [ ] **Step 9: Build and lint**

Run: `npm run build && npx eslint src`
Expected: build succeeds; no new lint errors.

- [ ] **Step 10: Commit**

```bash
git add src/utils/storageRoom.js src/utils/constants.js src/utils/storage.js src/utils/syncQueue.js src/utils/signatureStorage.js src/__tests__/storageRoom.test.js
git commit -m "fix(storage): never drop a save silently when the phone's storage is full

writeLocal frees room (signature images the cloud has confirmed, oldest
first) and retries; if it still fails it says so instead of logging and
carrying on. lsSet and enqueueSync now return whether they wrote.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Keep the invoice form when the invoice was saved nowhere

**Files:**
- Modify: `src/utils/constants.js`, `src/utils/storage.js:80-97`, `src/hooks/useInvoiceForm.js:33,388`
- Test: `src/__tests__/invoiceFlow.test.jsx`, `src/__tests__/storageRoom.test.js`

**Interfaces:**
- Consumes: `lsSet(): boolean` (Task 1).
- Produces: `saveInvoice(invoice): Promise<{ error, savedLocally: boolean }>`;
  `STORAGE_FULL_MESSAGE = "Not saved: this phone's storage for Keiro is full."`.

- [ ] **Step 1: Write the failing tests**

In `src/__tests__/invoiceFlow.test.jsx`, add to the imports:

```js
import { STORAGE_FULL_MESSAGE } from '../utils/constants';
```

and add inside `describe('useInvoiceForm — create → generate', ...)`:

```js
  it('keeps the form when the invoice reached neither the cloud nor this phone', async () => {
    saveInvoice.mockResolvedValueOnce({ error: new Error('offline'), savedLocally: false });
    const onGenerated = vi.fn();
    const { result } = renderHook(() => useInvoiceForm(onGenerated));

    addOneItem(result);
    await act(async () => { await result.current.handleGenerate(); });

    expect(result.current.error).toBe(STORAGE_FULL_MESSAGE);
    expect(onGenerated).not.toHaveBeenCalled();
    expect(saveStoreName).not.toHaveBeenCalled();
    expect(result.current.items).toHaveLength(1);           // nothing typed is lost
    expect(result.current.storeName).toBe('Corner Store');
  });

  it('carries on when the cloud saved it even though this phone is full', async () => {
    saveInvoice.mockResolvedValueOnce({ error: null, savedLocally: false });
    const onGenerated = vi.fn();
    const { result } = renderHook(() => useInvoiceForm(onGenerated));

    addOneItem(result);
    await act(async () => { await result.current.handleGenerate(); });

    expect(result.current.error).toBe('');
    expect(onGenerated).toHaveBeenCalledTimes(1);
  });
```

In `src/__tests__/storageRoom.test.js`, add to the imports
`import { saveInvoice } from '../utils/storage';` and add a new block:

```js
describe('saveInvoice', () => {
  it('reports savedLocally: false when the phone is full and the cloud failed', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw quotaError(); });
    const res = await saveInvoice({ number: 1001, items: [] });
    setItem.mockRestore();
    expect(res.savedLocally).toBe(false);
    expect(res.error).toBeTruthy();
  });

  it('reports savedLocally: true normally', async () => {
    const res = await saveInvoice({ number: 1002, items: [] });
    expect(res.savedLocally).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `mv .env /tmp/keiro.env.bak; npx vitest run src/__tests__/invoiceFlow.test.jsx src/__tests__/storageRoom.test.js; mv /tmp/keiro.env.bak .env`
Expected: FAIL — `STORAGE_FULL_MESSAGE` is undefined; `res.savedLocally` is undefined.

- [ ] **Step 3: Add the message**

In `src/utils/constants.js`, after the `EVENTS` object:

```js
/** Shown when an invoice reached neither the cloud nor this phone. */
export const STORAGE_FULL_MESSAGE = "Not saved: this phone's storage for Keiro is full.";
```

- [ ] **Step 4: Return `savedLocally` from `saveInvoice`**

In `src/utils/storage.js`, replace the doc comment and body of `saveInvoice` (lines 75-97) with:

```js
/**
 * Saves an invoice to the cloud, and to this phone's cache either way.
 * @param {object} invoice
 * @returns {Promise<{ error: object|null, savedLocally: boolean }>} savedLocally
 *   is false when this phone's storage is full; with an error as well, the
 *   invoice is nowhere and the caller must keep it on screen.
 */
export async function saveInvoice(invoice) {
  const { error } = await db.saveInvoice(invoice);

  // Mirror the invoice into the localStorage cache regardless of outcome so the
  // local copy always matches what we attempted to persist (including
  // customerName and paymentMethod). On error this is the offline fallback;
  // on success it keeps the cache in sync with the cloud.
  const list = lsGet(STORAGE_KEYS.LIST, []);
  const idx = list.findIndex(i => (i.number || i.invoice_number) === invoice.number);
  if (idx >= 0) list[idx] = invoice; else list.unshift(invoice);
  const savedLocally = lsSet(STORAGE_KEYS.LIST, list);

  if (error) {
    console.warn('saveInvoice: cloud save failed, queued for retry', error);
    enqueueSync({ type: 'save_invoice', payload: { invoice } });
  }
  return { error, savedLocally };
}
```

- [ ] **Step 5: Keep the form in `handleGenerate`**

In `src/hooks/useInvoiceForm.js`, change line 33 to:

```js
import { STORAGE_KEYS, EVENTS, AUTOFILL_DEBOUNCE_MS, STORAGE_FULL_MESSAGE } from '../utils/constants';
```

Replace line 388 (`await saveInvoice(invoice); // upserts by number ...`) with:

```js
      // Upserts by number → updates in place when editing.
      const saved = (await saveInvoice(invoice)) || {};
      if (saved.error && saved.savedLocally === false) {
        // Neither the cloud nor this phone has it: keep everything on screen.
        setError(STORAGE_FULL_MESSAGE);
        return;
      }
```

- [ ] **Step 6: Run the tests**

Run: `mv .env /tmp/keiro.env.bak; npx vitest run; mv /tmp/keiro.env.bak .env`
Expected: all pass.

- [ ] **Step 7: Build, lint, commit**

```bash
npm run build && npx eslint src
git add src/utils/constants.js src/utils/storage.js src/hooks/useInvoiceForm.js src/__tests__/invoiceFlow.test.jsx src/__tests__/storageRoom.test.js
git commit -m "fix(invoice): keep the form open when an invoice was saved nowhere

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Storage banner and launch check

**Files:**
- Create: `src/components/ui/StorageBanner.jsx`
- Modify: `src/utils/storageRoom.js` (add `checkStorageOnLaunch`), `src/App.jsx:26-27,726`
- Test: `src/__tests__/storageBanner.test.jsx`, `src/__tests__/storageRoom.test.js`

**Interfaces:**
- Consumes: `isStorageFull`, `makeRoom`, `estimateUsage`, `EVENTS.STORAGE_FULL/OK` (Task 1); `promptAccount()` from `guestMode.js`.
- Produces: `checkStorageOnLaunch({ budget?: number } = {}): 'ok' | 'guest-near-full'`; `<StorageBanner />`.

- [ ] **Step 1: Write the failing tests**

Append to `src/__tests__/storageRoom.test.js` (add `checkStorageOnLaunch` to the
`../utils/storageRoom` import):

```js
describe('checkStorageOnLaunch', () => {
  it('frees room early for a signed-in user past the target', () => {
    sig(1001, { at: '2026-01-01' });
    const budget = estimateUsage() / 0.9;          // 90% full
    expect(checkStorageOnLaunch({ budget })).toBe('ok');
    expect(localStorage.getItem('inv_sig_1001')).toBeNull();
  });

  it('asks a guest near the limit to create an account, and removes nothing', () => {
    sig(1001, { at: '2026-01-01' });
    localStorage.setItem(STORAGE_KEYS.GUEST_MODE, 'true');
    const budget = estimateUsage() / 0.85;         // 85% full
    expect(checkStorageOnLaunch({ budget })).toBe('guest-near-full');
    expect(localStorage.getItem('inv_sig_1001')).not.toBeNull();
  });

  it('says ok with room to spare', () => {
    expect(checkStorageOnLaunch()).toBe('ok');
  });
});
```

Create `src/__tests__/storageBanner.test.jsx`:

```jsx
/**
 * storageBanner.test.jsx
 *
 * A save that could not happen must be visible until a later one succeeds,
 * and a guest near the limit is asked to create an account.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

vi.mock('../utils/storageRoom', () => ({
  isStorageFull: vi.fn(() => false),
  checkStorageOnLaunch: vi.fn(() => 'ok'),
}));
vi.mock('../utils/guestMode', () => ({ promptAccount: vi.fn() }));

import StorageBanner from '../components/ui/StorageBanner';
import { checkStorageOnLaunch } from '../utils/storageRoom';
import { promptAccount } from '../utils/guestMode';
import { EVENTS } from '../utils/constants';

describe('StorageBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkStorageOnLaunch.mockReturnValue('ok');
  });

  it('shows nothing while storage is fine', () => {
    render(<StorageBanner />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('appears when a save fails for lack of space and goes when one succeeds', () => {
    render(<StorageBanner />);
    act(() => { window.dispatchEvent(new CustomEvent(EVENTS.STORAGE_FULL)); });
    expect(screen.getByRole('status')).toHaveTextContent("Not saved on this phone: Keiro's storage here is full.");
    act(() => { window.dispatchEvent(new CustomEvent(EVENTS.STORAGE_OK)); });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('asks a guest near the limit to create an account', () => {
    checkStorageOnLaunch.mockReturnValue('guest-near-full');
    render(<StorageBanner />);
    expect(screen.getByRole('status')).toHaveTextContent('Create a free account');
    fireEvent.click(screen.getByText('Create account'));
    expect(promptAccount).toHaveBeenCalledTimes(1);
  });

  it('"Later" hides the guest notice', () => {
    checkStorageOnLaunch.mockReturnValue('guest-near-full');
    render(<StorageBanner />);
    fireEvent.click(screen.getByText('Later'));
    expect(screen.queryByRole('status')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `mv .env /tmp/keiro.env.bak; npx vitest run src/__tests__/storageBanner.test.jsx src/__tests__/storageRoom.test.js; mv /tmp/keiro.env.bak .env`
Expected: FAIL — `StorageBanner` and `checkStorageOnLaunch` do not exist.

- [ ] **Step 3: Add `checkStorageOnLaunch` to `src/utils/storageRoom.js`**

Before `_resetStorageRoomForTests`:

```js
/**
 * At launch: frees room early for a signed-in user near the limit, and says
 * whether a guest should be warned (nothing of a guest's is ever removed).
 * @param {{ budget?: number }} [opts]
 * @returns {'ok' | 'guest-near-full'}
 */
export function checkStorageOnLaunch({ budget = STORAGE_BUDGET_BYTES } = {}) {
  const usage = estimateUsage();
  if (isGuest()) return usage > GUEST_WARN_AT * budget ? 'guest-near-full' : 'ok';
  if (usage > MAKE_ROOM_TARGET * budget) makeRoom({ target: MAKE_ROOM_TARGET * budget });
  return 'ok';
}
```

- [ ] **Step 4: Create `src/components/ui/StorageBanner.jsx`**

```jsx
/**
 * StorageBanner — this phone's storage for Keiro is full (or nearly, for a guest).
 *
 * Listens for EVENTS.STORAGE_FULL / STORAGE_OK from utils/storageRoom.js. While
 * full it stays up — a save that did not happen is not something to forget —
 * and goes by itself once a later save succeeds. On mount it runs
 * checkStorageOnLaunch(): a signed-in user near the limit gets room freed
 * quietly; a guest near it is asked to create an account, since a guest's phone
 * is their only copy. Placed like SyncAttentionBanner (beneath every sheet,
 * z-index 150), one row higher so both can show at once.
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../../context/ThemeContext';
import { EVENTS } from '../../utils/constants';
import { isStorageFull, checkStorageOnLaunch } from '../../utils/storageRoom';
import { promptAccount } from '../../utils/guestMode';

export default function StorageBanner() {
  const { dark } = useTheme();
  const [full, setFull] = useState(() => isStorageFull());
  const [guestNotice, setGuestNotice] = useState(false);

  useEffect(() => {
    const onFull = () => setFull(true);
    const onOk = () => setFull(false);
    window.addEventListener(EVENTS.STORAGE_FULL, onFull);
    window.addEventListener(EVENTS.STORAGE_OK, onOk);
    if (checkStorageOnLaunch() === 'guest-near-full') setGuestNotice(true);
    return () => {
      window.removeEventListener(EVENTS.STORAGE_FULL, onFull);
      window.removeEventListener(EVENTS.STORAGE_OK, onOk);
    };
  }, []);

  if (!full && !guestNotice) return null;

  const fg = dark ? '#fbbf24' : '#b45309';
  return createPortal(
    <div
      role="status"
      style={{
        ...s.bar,
        background: dark ? '#2a1500' : '#fff7ed',
        color: fg,
        border: `1px solid ${dark ? '#3a2000' : '#fed7aa'}`,
      }}
    >
      <span aria-hidden style={{ fontSize: 15, flexShrink: 0 }}>⚠</span>
      {full ? (
        <span style={{ flex: 1 }}>Not saved on this phone: Keiro's storage here is full.</span>
      ) : (
        <>
          <span style={{ flex: 1 }}>Create a free account so your invoices are backed up and this phone has room for more.</span>
          <button onClick={() => setGuestNotice(false)} style={{ ...s.btn, color: fg, border: 'none', padding: '0 6px' }}>Later</button>
          <button onClick={promptAccount} style={{ ...s.btn, color: fg, borderColor: fg }}>Create account</button>
        </>
      )}
    </div>,
    document.body
  );
}

const s = {
  bar: {
    position: 'fixed',
    // One row above SyncAttentionBanner (bottom + 52px) so both can show.
    bottom: 'calc(env(safe-area-inset-bottom, 0px) + 112px)',
    left: 'calc(var(--app-inset-left, 0px) + (100% - var(--app-inset-left, 0px)) / 2)',
    transform: 'translateX(-50%)',
    width: 'calc(100% - var(--app-inset-left, 0px) - 32px)',
    maxWidth: 420,
    zIndex: 150, // beneath sheets (200+), dialogs and the drawer (1500)
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 8px 8px 14px',
    borderRadius: 14,
    boxShadow: '0 8px 28px rgba(0,0,0,0.25)',
    fontSize: 13,
    fontWeight: 600,
  },
  btn: {
    minHeight: 44,
    padding: '0 14px',
    borderRadius: 10,
    border: '1px solid',
    background: 'transparent',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
    flexShrink: 0,
  },
};
```

- [ ] **Step 5: Mount it in `src/App.jsx`**

After line 26 (`import SyncAttentionBanner ...`) add:

```js
import StorageBanner from './components/ui/StorageBanner';
```

After `<SyncAttentionBanner />` (line ~726) add:

```jsx
      <StorageBanner />
```

- [ ] **Step 6: Run the tests, build, lint**

Run: `mv .env /tmp/keiro.env.bak; npx vitest run; mv /tmp/keiro.env.bak .env && npm run build && npx eslint src`
Expected: all pass; build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/StorageBanner.jsx src/utils/storageRoom.js src/App.jsx src/__tests__/storageBanner.test.jsx src/__tests__/storageRoom.test.js
git commit -m "feat(storage): say so when the phone's storage is full; warn guests early

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Save signatures at on-screen size

**Files:**
- Create: `src/utils/signatureImage.js`
- Modify: `src/components/ui/SignaturePad.jsx:74`
- Test: `src/__tests__/signatureImage.test.js`

**Interfaces:**
- Produces: `exportSignature(canvas, doc = document): string` (PNG data URL).

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/signatureImage.test.js`:

```js
/**
 * signatureImage.test.js
 *
 * The pad's canvas is backed at devicePixelRatio (3× on an iPhone). Saving that
 * made each signature ~9× larger than a signature printed small needs.
 */

import { describe, it, expect, vi } from 'vitest';
import { exportSignature } from '../utils/signatureImage';

function fakeCanvas({ cssW, cssH, dpr }) {
  return {
    width: cssW * dpr,
    height: cssH * dpr,
    getBoundingClientRect: () => ({ width: cssW, height: cssH }),
    toDataURL: vi.fn(() => 'data:full-size'),
  };
}

describe('exportSignature', () => {
  it('saves at on-screen size, not the device-pixel backing store', () => {
    const source = fakeCanvas({ cssW: 320, cssH: 90, dpr: 3 });
    const drawImage = vi.fn();
    const out = { getContext: () => ({ drawImage }), toDataURL: vi.fn(() => 'data:small') };
    const doc = { createElement: vi.fn(() => out) };

    expect(exportSignature(source, doc)).toBe('data:small');
    expect(out.width).toBe(320);
    expect(out.height).toBe(90);
    expect(drawImage).toHaveBeenCalledWith(source, 0, 0, 320, 90);
  });

  it('uses the canvas as it is when it is already 1×', () => {
    const source = fakeCanvas({ cssW: 320, cssH: 90, dpr: 1 });
    const doc = { createElement: vi.fn() };
    expect(exportSignature(source, doc)).toBe('data:full-size');
    expect(doc.createElement).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/__tests__/signatureImage.test.js`
Expected: FAIL — cannot resolve `../utils/signatureImage`.

- [ ] **Step 3: Create `src/utils/signatureImage.js`**

```js
/**
 * signatureImage.js — the signature image Keiro stores and prints.
 *
 * exportSignature(): SignaturePad's canvas is backed at devicePixelRatio (3× on
 * an iPhone) so strokes look sharp while drawing; saving that backing store made
 * each PNG ~9× larger than a signature printed small on an invoice needs, and
 * signatures were the main thing filling the phone's ~5 MB of storage. This
 * saves it at its on-screen (CSS pixel) size instead.
 */

/**
 * @param {HTMLCanvasElement} canvas  the pad's canvas
 * @param {Document} [doc]
 * @returns {string} PNG data URL
 */
export function exportSignature(canvas, doc = document) {
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
  if (canvas.width <= w && canvas.height <= h) return canvas.toDataURL('image/png');
  const out = doc.createElement('canvas');
  out.width = w;
  out.height = h;
  out.getContext('2d').drawImage(canvas, 0, 0, w, h);
  return out.toDataURL('image/png');
}
```

- [ ] **Step 4: Use it in `SignaturePad.jsx`**

Add the import under the existing imports:

```js
import { exportSignature } from '../../utils/signatureImage';
```

Replace line 74 (`const dataUrl = canvasRef.current.toDataURL('image/png');`) with:

```js
    const dataUrl = exportSignature(canvasRef.current);
```

- [ ] **Step 5: Run the tests, build, lint, commit**

```bash
mv .env /tmp/keiro.env.bak; npx vitest run; mv /tmp/keiro.env.bak .env
npm run build && npx eslint src
git add src/utils/signatureImage.js src/components/ui/SignaturePad.jsx src/__tests__/signatureImage.test.js
git commit -m "perf(signatures): save signatures at on-screen size, ~9x smaller

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Signature ink readable on the PDF — ADDED DURING PLANNING, NEEDS OWNER OK

Not in the approved spec. Found while planning Task 4: `SignaturePad` draws in the
theme's ink (`#ffffff` in dark mode, Keiro's default) on a transparent canvas, and
`pdfGenerator.js` places that PNG on a white page, so signatures drawn in dark mode
very likely print invisible. Skip this task if the owner declines.

**Files:**
- Modify: `src/utils/signatureImage.js`, `src/utils/pdfGenerator.js:21-22,227-246`, `src/components/ui/SignaturePad.jsx:16-37`
- Test: `src/__tests__/signatureImage.test.js`

**Interfaces:**
- Produces: `recolorSignature(dataUrl, color, { doc?, loadImage? } = {}): Promise<string>`; `PRINT_INK = '#111111'`.

- [ ] **Step 1: Write the failing tests**

Append to `src/__tests__/signatureImage.test.js` (add `recolorSignature, PRINT_INK` to the import):

```js
describe('recolorSignature', () => {
  it('paints every stroke in the given colour, keeping the transparent background', async () => {
    const ops = [];
    const ctx = {
      drawImage: (...a) => ops.push(['draw', ...a]),
      fillRect: (...a) => ops.push(['fill', ...a]),
      set globalCompositeOperation(v) { ops.push(['op', v]); },
      set fillStyle(v) { ops.push(['style', v]); },
    };
    const out = { getContext: () => ctx, toDataURL: () => 'data:recoloured' };
    const img = { width: 320, height: 90 };

    const result = await recolorSignature('data:in', PRINT_INK, {
      doc: { createElement: () => out },
      loadImage: async () => img,
    });

    expect(result).toBe('data:recoloured');
    expect(ops).toEqual([
      ['draw', img, 0, 0],
      ['op', 'source-in'],
      ['style', '#111111'],
      ['fill', 0, 0, 320, 90],
    ]);
  });

  it('returns the original when the image cannot be read', async () => {
    const result = await recolorSignature('data:bad', PRINT_INK, {
      doc: { createElement: vi.fn() },
      loadImage: async () => { throw new Error('unreadable'); },
    });
    expect(result).toBe('data:bad');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/__tests__/signatureImage.test.js`
Expected: FAIL — `recolorSignature` is not exported.

- [ ] **Step 3: Add to `src/utils/signatureImage.js`**

```js
/** Ink for a printed signature: near-black, on the PDF's white page. */
export const PRINT_INK = '#111111';

/**
 * The same signature with every stroke in `color`. SignaturePad draws in the
 * theme's ink (white in dark mode, Keiro's default) and the PDF places the image
 * on a white page, so a dark-mode signature printed invisible. The PDF
 * recolours to PRINT_INK; the pad recolours a saved image to its current ink,
 * which also fixes signatures saved before this change.
 * @param {string} dataUrl
 * @param {string} color  CSS colour
 * @param {{ doc?: Document, loadImage?: (src: string) => Promise<{ width: number, height: number }> }} [deps]
 * @returns {Promise<string>} PNG data URL; the input unchanged if it cannot be drawn
 */
export async function recolorSignature(dataUrl, color, { doc = document, loadImage = loadImageElement } = {}) {
  try {
    const img = await loadImage(dataUrl);
    const out = doc.createElement('canvas');
    out.width = img.width;
    out.height = img.height;
    const ctx = out.getContext('2d');
    ctx.drawImage(img, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, out.width, out.height);
    return out.toDataURL('image/png');
  } catch {
    return dataUrl;
  }
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
```

- [ ] **Step 4: Print in near-black**

In `src/utils/pdfGenerator.js`, add to the imports:

```js
import { recolorSignature, PRINT_INK } from './signatureImage';
```

At the top of the `// ── Signatures ──` block (before `const sigStartY`), add:

```js
  // Signatures may be drawn in white (dark-mode ink): print them dark.
  const sellerInk = sellerSignature ? await recolorSignature(sellerSignature, PRINT_INK) : null;
  const buyerInk  = buyerSignature  ? await recolorSignature(buyerSignature,  PRINT_INK) : null;
```

and change the two image calls to use them:
`if (sellerSignature) {` → `if (sellerInk) {`, `doc.addImage(sellerSignature, ...)` → `doc.addImage(sellerInk, ...)`,
`if (buyerSignature) {` → `if (buyerInk) {`, `doc.addImage(buyerSignature, ...)` → `doc.addImage(buyerInk, ...)`.

- [ ] **Step 5: Redraw saved signatures in the pad's ink**

In `src/components/ui/SignaturePad.jsx`, change the import line to:

```js
import { exportSignature, recolorSignature } from '../../utils/signatureImage';
```

In the setup effect, replace `ctx.strokeStyle = dark ? '#ffffff' : '#111111';` with:

```js
    const ink = dark ? '#ffffff' : '#111111';
    ctx.strokeStyle = ink;
```

and replace the restore block (`if (initialDataUrl) { const img = new Image(); ... img.src = initialDataUrl; }`) with:

```js
    // Restore a saved signature in this theme's ink, whatever ink it was saved in.
    if (initialDataUrl) {
      recolorSignature(initialDataUrl, ink).then((src) => {
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0, rect.width, rect.height);
          setIsEmpty(false);
        };
        img.src = src;
      });
    }
```

- [ ] **Step 6: Run the tests, build, lint, commit**

```bash
mv .env /tmp/keiro.env.bak; npx vitest run; mv /tmp/keiro.env.bak .env
npm run build && npx eslint src
git add src/utils/signatureImage.js src/utils/pdfGenerator.js src/components/ui/SignaturePad.jsx src/__tests__/signatureImage.test.js
git commit -m "fix(pdf): print signatures in dark ink; dark-mode ink was white on a white page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Crash reporter (Sentry) core

**Files:**
- Create: `src/utils/crashReporter.js`
- Modify: `package.json` (dependency), `src/utils/constants.js` (STORAGE_KEYS), `src/services/auth.js:162`, `src/utils/errorLog.js:1-56`, `src/main.jsx:12-16,end`, `src/App.jsx` (after line 274)
- Test: `src/__tests__/crashReporter.test.js`

**Interfaces:**
- Produces: `initCrashReporter({ dsn?, load? } = {}): Promise<object|null>`,
  `reportCrash(error, meta = {}): boolean`, `sendTestReport(): Promise<'sent'|'no-dsn'|'off'|'offline'|'not-ready'>`,
  `crashReportsEnabled(): boolean`, `setCrashReportsEnabled(on: boolean): void`,
  `setCrashScreen(name: string): void`, `scrubEvent`, `scrubBreadcrumb`, `scrubUrl`,
  `SESSION_CAP = 20`, `_resetCrashReporterForTests()`;
  `STORAGE_KEYS.CRASH_REPORTS = 'inv_crash_reports'`; `export const DEVICE_PREF_KEYS` from `services/auth.js`.

- [ ] **Step 1: Install the SDK**

Run: `npm install @sentry/react`
Expected: added to `dependencies` in `package.json`.

- [ ] **Step 2: Write the failing tests**

Create `src/__tests__/crashReporter.test.js`:

```js
/**
 * crashReporter.test.js
 *
 * Crash reports go to Sentry: scrubbed, capped, switchable, and costing nothing
 * in a build without a DSN.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/db', () => ({}));
vi.mock('../services/supabase', () => ({ supabase: { auth: {} } }));
// @capacitor/core is NOT mocked: under jsdom it already reports a web platform,
// and auth.js (imported below) needs its real registerPlugin.

import {
  initCrashReporter, reportCrash, sendTestReport, scrubEvent, setCrashScreen,
  crashReportsEnabled, setCrashReportsEnabled, SESSION_CAP, _resetCrashReporterForTests,
} from '../utils/crashReporter';
import { STORAGE_KEYS } from '../utils/constants';

const DSN = 'https://key@o0.ingest.sentry.io/1';

function fakeSentry() {
  return { init: vi.fn(), captureException: vi.fn() };
}

beforeEach(() => {
  localStorage.clear();
  _resetCrashReporterForTests();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('crash reporter', () => {
  it('without a DSN never loads Sentry and sends nothing', async () => {
    const load = vi.fn();
    expect(await initCrashReporter({ dsn: '', load })).toBeNull();
    expect(load).not.toHaveBeenCalled();
    expect(reportCrash(new Error('x'))).toBe(false);
    expect(await sendTestReport()).toBe('no-dsn');
  });

  it("starts Sentry without personal data or its own global handlers, and sends crashes with the screen", async () => {
    const S = fakeSentry();
    await initCrashReporter({ dsn: DSN, load: async () => S });
    const opts = S.init.mock.calls[0][0];
    expect(opts.sendDefaultPii).toBe(false);
    expect(opts.integrations([{ name: 'GlobalHandlers' }, { name: 'Breadcrumbs' }]).map(i => i.name)).toEqual(['Breadcrumbs']);

    setCrashScreen('route');
    expect(reportCrash(new Error('boom'), { source: 'ErrorBoundary' })).toBe(true);
    expect(S.captureException).toHaveBeenCalledWith(expect.any(Error), { tags: { source: 'ErrorBoundary', screen: 'route' } });
  });

  it('sends crashes from before Sentry loaded once it is ready, and only once', async () => {
    const S = fakeSentry();
    let resolve;
    const ready = initCrashReporter({ dsn: DSN, load: () => new Promise((r) => { resolve = r; }) });
    reportCrash(new Error('early'));
    resolve(S);
    await ready;
    expect(S.captureException).toHaveBeenCalledTimes(1);
    reportCrash(new Error('later'));
    expect(S.captureException).toHaveBeenCalledTimes(2);
  });

  it('stops at the session cap', async () => {
    const S = fakeSentry();
    await initCrashReporter({ dsn: DSN, load: async () => S });
    for (let i = 0; i < SESSION_CAP + 5; i++) reportCrash(new Error('loop'));
    expect(S.captureException).toHaveBeenCalledTimes(SESSION_CAP);
  });

  it('is on by default; switched off it sends nothing and Sentry drops the rest', async () => {
    expect(crashReportsEnabled()).toBe(true);
    const S = fakeSentry();
    await initCrashReporter({ dsn: DSN, load: async () => S });
    setCrashReportsEnabled(false);
    expect(crashReportsEnabled()).toBe(false);
    expect(reportCrash(new Error('x'))).toBe(false);
    expect(S.captureException).not.toHaveBeenCalled();
    expect(S.init.mock.calls[0][0].beforeSend({ message: 'm' })).toBeNull();
    expect(await sendTestReport()).toBe('off');
  });

  it('scrubs the user, extras, query strings, hashes and chatty breadcrumbs', () => {
    const out = scrubEvent({
      message: 'boom',
      user: { email: 'a@b.c' },
      extra: { invoice: { storeName: 'Corner Store' } },
      request: { url: 'https://keiro.app/?invite=ABC123#x', headers: { a: 1 }, query_string: 'invite=ABC123' },
      breadcrumbs: [
        { category: 'console', message: 'Corner Store' },
        { category: 'ui.click', message: 'button Corner Store' },
        { category: 'fetch', data: { url: '/rest/v1/invoices?store=Corner' } },
        { category: 'navigation', data: { from: '/?invite=X', to: '/#y' } },
        { category: 'sentry.event', data: { a: 1 } },
      ],
    });
    expect(out.user).toBeUndefined();
    expect(out.extra).toBeUndefined();
    expect(out.request).toEqual({ url: 'https://keiro.app/' });
    expect(out.breadcrumbs).toEqual([
      { category: 'navigation', data: { from: '/', to: '/' } },
      { category: 'sentry.event', data: undefined },
    ]);
  });

  it('the test report says why it was not sent, and is tagged as a test', async () => {
    const S = fakeSentry();
    await initCrashReporter({ dsn: DSN, load: async () => S });
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    expect(await sendTestReport()).toBe('offline');
    online.mockRestore();
    expect(await sendTestReport()).toBe('sent');
    expect(S.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ tags: expect.objectContaining({ source: 'test-report' }) }),
    );
  });

  it('every crash the phone records is also reported', async () => {
    const S = fakeSentry();
    await initCrashReporter({ dsn: DSN, load: async () => S });
    const { logError } = await import('../utils/errorLog');
    logError(new Error('render crash'), { source: 'ErrorBoundary' });
    expect(S.captureException).toHaveBeenCalledTimes(1);
  });

  it('signing out keeps the crash-report choice (a device preference)', async () => {
    const { DEVICE_PREF_KEYS } = await import('../services/auth');
    expect(DEVICE_PREF_KEYS.has(STORAGE_KEYS.CRASH_REPORTS)).toBe(true);
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `mv .env /tmp/keiro.env.bak; npx vitest run src/__tests__/crashReporter.test.js; mv /tmp/keiro.env.bak .env`
Expected: FAIL — cannot resolve `../utils/crashReporter`.

- [ ] **Step 4: Add the key**

In `src/utils/constants.js`, in `STORAGE_KEYS` under `// Settings / flags`, after `EASY_MODE`:

```js
  CRASH_REPORTS:    'inv_crash_reports',   // device pref: send crash reports (default on); kept across sign-out
```

In `src/services/auth.js`, replace line 162 with:

```js
export const DEVICE_PREF_KEYS = new Set(['inv_dark_mode', 'inv_accent_color', 'inv_density', 'inv_easy_mode', 'inv_crash_reports']);
```

- [ ] **Step 5: Create `src/utils/crashReporter.js`**

```js
/**
 * crashReporter.js — sends Keiro's crash reports to Sentry (free plan).
 *
 * errorLog.logError() is the single funnel for every render crash
 * (ErrorBoundary) and every uncaught error or unhandled rejection (window
 * listeners); it calls reportCrash(). Sentry's SDK is imported lazily, after
 * first paint, and only when VITE_SENTRY_DSN is set, so a build without one
 * (local dev, tests, CI) never loads it. Crashes before it loads wait in memory
 * and are sent once it is ready.
 *
 * What is sent (PRIVACY.md §2 and §5, Legal.jsx): the error and its stack, the
 * build (__APP_VERSION__), web or iOS app, device/browser type, and the screen
 * it happened on. Never invoice contents, names, emails, phone numbers, the IP
 * address, URL query strings or hashes (invite codes), console or network
 * breadcrumbs, replays or performance traces; scrubEvent() enforces it.
 * Switchable in Settings → Terms & Privacy ("Send crash reports", on by default,
 * a device preference kept across sign-out). At most SESSION_CAP per session.
 */

import { Capacitor } from '@capacitor/core';
import { STORAGE_KEYS } from './constants';
import { lsGet, lsSet } from './storage';

export const SESSION_CAP = 20;

const KEY = STORAGE_KEYS.CRASH_REPORTS;
const ENV_DSN = import.meta.env.VITE_SENTRY_DSN || '';

let configured = Boolean(ENV_DSN);
let sentry = null;
let loading = null;
let sent = 0;
let screen = 'startup';
const waiting = [];

export function crashReportsEnabled() {
  return lsGet(KEY, true) !== false;
}

export function setCrashReportsEnabled(on) {
  lsSet(KEY, Boolean(on));
}

/** The tab or overlay on screen, attached to each report. */
export function setCrashScreen(name) {
  if (name) screen = String(name);
}

/** The URL without its query string or hash (invite codes live there). */
export function scrubUrl(url) {
  if (typeof url !== 'string') return url;
  const cut = url.search(/[?#]/);
  return cut < 0 ? url : url.slice(0, cut);
}

// Console lines, network requests and clicked-element text can all carry names.
const DROPPED_BREADCRUMBS = /^(console|fetch|xhr|ui\.)/;

export function scrubBreadcrumb(b) {
  if (!b || DROPPED_BREADCRUMBS.test(b.category || '')) return null;
  if (b.category === 'navigation') {
    return { ...b, data: { from: scrubUrl(b.data?.from), to: scrubUrl(b.data?.to) } };
  }
  return { ...b, data: undefined };
}

export function scrubEvent(event) {
  if (!event) return event;
  const out = { ...event };
  delete out.user;
  delete out.extra;
  if (out.request) out.request = { url: scrubUrl(out.request.url) };
  if (Array.isArray(out.breadcrumbs)) out.breadcrumbs = out.breadcrumbs.map(scrubBreadcrumb).filter(Boolean);
  return out;
}

/**
 * Loads and starts Sentry. Safe to call more than once; a no-op without a DSN.
 * @param {{ dsn?: string, load?: () => Promise<object> }} [opts]  overrides for tests
 * @returns {Promise<object|null>} the Sentry module, or null
 */
export function initCrashReporter({ dsn = ENV_DSN, load = () => import('@sentry/react') } = {}) {
  configured = Boolean(dsn);
  if (!configured) return Promise.resolve(null);
  if (loading) return loading;
  loading = load()
    .then((S) => {
      S.init({
        dsn,
        release: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev',
        environment: Capacitor.isNativePlatform() ? 'ios-app' : 'web',
        sendDefaultPii: false,
        // errorLog's own window listeners already report uncaught errors;
        // Sentry's would send each one twice.
        integrations: (defaults) => defaults.filter((i) => i.name !== 'GlobalHandlers'),
        beforeSend: (event) => (crashReportsEnabled() ? scrubEvent(event) : null),
        beforeBreadcrumb: scrubBreadcrumb,
      });
      sentry = S;
      waiting.splice(0).forEach(send);
      return S;
    })
    .catch((e) => {
      console.warn('Crash reporting could not start', e);
      return null;
    });
  return loading;
}

/**
 * Sends one crash, or holds it until Sentry has loaded.
 * @returns {boolean} whether it was sent now
 */
export function reportCrash(error, meta = {}) {
  if (!configured || !crashReportsEnabled()) return false;
  const report = { error, meta };
  if (!sentry) {
    if (waiting.length < SESSION_CAP) waiting.push(report);
    return false;
  }
  return send(report);
}

function send({ error, meta }) {
  if (sent >= SESSION_CAP || !crashReportsEnabled()) return false;
  sent += 1;
  const err = error instanceof Error ? error : new Error(String(error?.message || error));
  sentry.captureException(err, { tags: { source: meta.source || 'unknown', screen } });
  return true;
}

/**
 * Settings → Help → "Send test report".
 * @returns {Promise<'sent' | 'no-dsn' | 'off' | 'offline' | 'not-ready'>}
 */
export async function sendTestReport() {
  if (!configured) return 'no-dsn';
  if (!crashReportsEnabled()) return 'off';
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
  const S = sentry || (await (loading || initCrashReporter()));
  if (!S) return 'not-ready';
  S.captureException(new Error('Keiro test report'), { tags: { source: 'test-report', screen } });
  return 'sent';
}

/** Test-only: forget all state, as if the app had just started without a DSN. */
export function _resetCrashReporterForTests() {
  configured = false;
  sentry = null;
  loading = null;
  sent = 0;
  screen = 'startup';
  waiting.length = 0;
}
```

- [ ] **Step 6: Report through it from `errorLog.js`**

In `src/utils/errorLog.js`:
- Replace the header paragraph starting `There is no remote crash reporter` through `...wired up — that needs an account/DSN the project owner hasn't provided yet (see CLAUDE.md "Pending — real-world launch blockers"). Until then, this module is the on-device substitute:` with:
  `Every crash is kept on the device here (Settings → Help → Error Log) and also sent to Sentry through crashReporter.js when a DSN is configured:`
- Delete the paragraph starting `Swap-in path for a real reporter later:` (keep the sentence about handled sync failures, reworded to `Handled, transient failures like failed cloud writes report separately via syncNotify → SyncToast and are deliberately NOT captured here.`).
- Add the import: `import { reportCrash } from './crashReporter';`
- Replace `  // reportToRemote(entry); // ← enable once a Sentry DSN (or equivalent) exists` with:

```js
  reportCrash(error, { source: entry.source });
```

- [ ] **Step 7: Start it after first paint, and tag the screen**

In `src/main.jsx`:
- Replace the comment above `initGlobalErrorListeners();` with:
  `// Catches uncaught exceptions and rejected promises outside React's render tree (ErrorBoundary below covers render-phase crashes). Both funnel into errorLog.logError, which keeps them on the device and reports them (crashReporter.js).`
- Add the import `import { initCrashReporter } from './utils/crashReporter'`.
- At the end of the file add:

```js
// Crash reporting (Sentry): loaded off the startup path, and only when a DSN
// is configured. Crashes before it is ready are held and sent once it is.
setTimeout(() => { initCrashReporter(); }, 0);
```

In `src/App.jsx`, add `import { setCrashScreen } from './utils/crashReporter';` with the
other utils imports, and after the effect that keeps `page` in sync with `tabIdx`
(ends line 274) add:

```js
  // Crash reports say which screen they happened on.
  useEffect(() => { setCrashScreen(page); }, [page]);
```

- [ ] **Step 8: Run the tests, build, lint**

Run: `mv .env /tmp/keiro.env.bak; npx vitest run; mv /tmp/keiro.env.bak .env && npm run build && npx eslint src`
Expected: all pass. The build log shows Sentry in its own lazily loaded chunk; the
entry chunk size is unchanged within a few KB.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json src/utils/crashReporter.js src/utils/constants.js src/services/auth.js src/utils/errorLog.js src/main.jsx src/App.jsx src/__tests__/crashReporter.test.js
git commit -m "feat(errors): send crash reports to Sentry, scrubbed and capped

Loaded after first paint and only with VITE_SENTRY_DSN set; no invoice
data, names, contact details, IP or invite codes ever leave the phone.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Crash reports in Settings, and the privacy text

**Files:**
- Modify: `src/pages/Settings.jsx:23,139-145,211-222,459-482`, `PRIVACY.md`, `src/pages/Legal.jsx:20,24`

**Interfaces:**
- Consumes: `crashReportsEnabled`, `setCrashReportsEnabled`, `sendTestReport` (Task 6); `Row`, `Toggle` (`components/ui/SettingsUI`).

The behaviour behind these controls is tested in Task 6; this task is wiring and copy,
checked by build plus a 375px browser look (Step 5).

- [ ] **Step 1: Settings state and imports**

In `src/pages/Settings.jsx`, after the `errorLog` import (line 23) add:

```js
import { crashReportsEnabled, setCrashReportsEnabled, sendTestReport } from '../utils/crashReporter';
```

Above `export default function Settings`, add:

```js
const TEST_REPORT_TEXT = {
  sent: 'Sent. It should appear in Sentry within a minute.',
  'no-dsn': "Crash reporting isn't set up in this build.",
  off: 'Crash reports are switched off (Terms & Privacy).',
  offline: "You're offline. Try again when connected.",
  'not-ready': 'Crash reporting could not start. Try again in a moment.',
};
```

Next to the error-log state (line ~143) add:

```js
  const [crashOn, setCrashOn] = useState(() => crashReportsEnabled());
  const [testReport, setTestReport] = useState(null);
```

- [ ] **Step 2: "Send test report" in Help & Tutorial**

After the `Error Log` row (line 221) add:

```jsx
          <Row label="Send test report" sub={testReport ? TEST_REPORT_TEXT[testReport] : 'Check that crash reports reach the developer'} C={C}>
            <button style={{ ...s.smallBtn, background: C.rowBg, color: ACCENT, border: `1px solid ${C.divider}` }} onClick={async () => setTestReport(await sendTestReport())}>
              Send
            </button>
          </Row>
```

- [ ] **Step 3: The switch and the blurb in Terms & Privacy**

Directly inside `<div style={{ paddingTop: 8 }}>` of the Terms & Privacy section (line 460),
before the Alpha badge, add:

```jsx
            <Row label="Send crash reports" sub="Helps fix problems. Never includes invoices, names or contact details." C={C}>
              <Toggle on={crashOn} onChange={(on) => { setCrashReportsEnabled(on); setCrashOn(on); }} dark={dark} />
            </Row>
```

In the Privacy Policy paragraph (line 481), after `We collect minimal usage data.` insert:

```
 If the app crashes, a report goes to Sentry (our error-monitoring provider): the error, the app version, your device type and the screen it happened on, never your invoices, names or contact details. You can switch this off above.
```

- [ ] **Step 4: The written policies**

In `PRIVACY.md`:
- Replace `**[your-email@example.com]**` with `**alomonds@gmail.com**` (the address `Legal.jsx` already shows).
- In section 2, after the "Device-local preferences" bullet, add:

```markdown
- **Crash reports** — if the App crashes, a report is sent to **Sentry**, our
  error-monitoring provider: the error and where in the code it happened, the
  App version, whether you use the web or iPhone app, your device and browser
  type, and which screen it happened on. Reports never include invoice
  contents, customer or store names, emails, phone numbers, your IP address, or
  invite codes. You can switch them off in Settings → Terms & Privacy.
```

- In section 5, change `(e.g. Supabase for authentication and database hosting)` to
  `(e.g. Supabase for authentication and database hosting, and Sentry for crash reports)`.

In `src/pages/Legal.jsx`:
- At the end of the `'Information we collect'` text (line 20), before the closing quote, add:
  ` If the app crashes, a report is sent to Sentry: the error, the app version, web or iPhone app, device and browser type, and the screen it happened on; never invoice contents, names, emails, phone numbers, your IP address or invite codes. You can switch this off in Settings → Terms & Privacy.`
- In `'Sharing of information'` (line 24), change `(such as Supabase)` to `(such as Supabase, and Sentry for crash reports)`.

- [ ] **Step 5: Verify**

Run: `mv .env /tmp/keiro.env.bak; npx vitest run; mv /tmp/keiro.env.bak .env && npm run build && npx eslint src`
Expected: all pass.

Then check in a browser at 375px (`npm run dev`, http://localhost:5173, follow
`.claude/skills/verified-fix/`): Settings → Help & Tutorial shows "Send test report";
tapping Send without a DSN shows "Crash reporting isn't set up in this build.";
Terms & Privacy shows the switch, which survives a reload. Screenshot both.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Settings.jsx PRIVACY.md src/pages/Legal.jsx
git commit -m "feat(settings): crash-report switch and test report; privacy text names Sentry

Also replaces PRIVACY.md's placeholder contact with the real address.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Readable stack traces (optional source-map upload)

**Files:**
- Modify: `package.json` (devDependency), `vite.config.js`

Only does anything when the owner sets `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` and
`SENTRY_PROJECT` in Vercel. Without them the build is exactly as before: no source
maps are produced at all.

- [ ] **Step 1: Install the plugin**

Run: `npm install -D @sentry/vite-plugin`

- [ ] **Step 2: Wire it in `vite.config.js`**

Add the import after the existing imports:

```js
import { sentryVitePlugin } from '@sentry/vite-plugin';
```

After `console.log(\`[Keiro] Build version: ${appVersion}\`);` add:

```js
// Readable stack traces in Sentry: only when the owner has set these three in
// Vercel. Maps are uploaded, then deleted before anything is deployed or zipped
// for OTA, so they are never served. Without them, no maps are built at all.
const uploadSourceMaps = Boolean(
  process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT
);
```

Change `plugins: [react()],` to:

```js
  plugins: [
    react(),
    ...(uploadSourceMaps
      ? [sentryVitePlugin({
          org: process.env.SENTRY_ORG,
          project: process.env.SENTRY_PROJECT,
          authToken: process.env.SENTRY_AUTH_TOKEN,
          release: { name: appVersion },          // matches crashReporter's release
          sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
          telemetry: false,
        })]
      : []),
  ],
  build: { sourcemap: uploadSourceMaps ? 'hidden' : false },
```

- [ ] **Step 3: Verify nothing changes without the variables**

Run: `npm run build && ls dist/assets/*.map 2>/dev/null | wc -l`
Expected: build succeeds; `0` map files.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json vite.config.js
git commit -m "build: upload source maps to Sentry when the owner configures it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The real version number

**Files:**
- Create: `src/utils/appVersion.js`
- Modify: `package.json` (`version`), `vite.config.js` (define), `eslint.config.js:24`, `src/components/navigation/AppFooter.jsx:67`, `src/pages/About.jsx:90`
- Test: `src/__tests__/appVersion.test.js`

**Interfaces:**
- Produces: `APP_RELEASE: string`, `APP_BUILD: string`, `versionLabel(release?, build?): string`; global `__APP_RELEASE__`.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/appVersion.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { versionLabel, APP_RELEASE } from '../utils/appVersion';

describe('versionLabel', () => {
  it('shows major.minor and the build', () => {
    expect(versionLabel('5.9.0', '4854eda')).toBe('Keiro 5.9 · build 4854eda');
  });

  it('reads the release the build injected from package.json', () => {
    expect(APP_RELEASE).toBe('5.9.0');
    expect(versionLabel()).toMatch(/^Keiro 5\.9 · build \S+$/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/__tests__/appVersion.test.js`
Expected: FAIL — cannot resolve `../utils/appVersion`.

- [ ] **Step 3: Make 5.9.0 the release**

In `package.json` change `"version": "0.0.0"` to `"version": "5.9.0"`.

In `vite.config.js`, after `console.log(\`[Keiro] Build version: ${appVersion}\`);` add:

```js
// The release people see ("Keiro 5.9"). __APP_VERSION__ stays the git hash:
// the update check and OTA compare that one.
const appRelease = JSON.parse(fs.readFileSync('./package.json', 'utf8')).version;
```

and in `define` add after `__APP_VERSION__`:

```js
    __APP_RELEASE__: JSON.stringify(appRelease),
```

In `eslint.config.js` line 24 change the globals to:

```js
      globals: { ...globals.browser, __APP_VERSION__: 'readonly', __APP_RELEASE__: 'readonly' },
```

- [ ] **Step 4: Create `src/utils/appVersion.js`**

```js
/**
 * appVersion.js — the version line in the footer and About.
 *
 * __APP_RELEASE__ is package.json's version; __APP_VERSION__ the git hash of
 * the build. vite.config.js injects both.
 */

export const APP_RELEASE = typeof __APP_RELEASE__ !== 'undefined' ? __APP_RELEASE__ : '0.0.0';
export const APP_BUILD = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

/** "Keiro 5.9 · build 4854eda" */
export function versionLabel(release = APP_RELEASE, build = APP_BUILD) {
  const [major = '0', minor = '0'] = String(release).split('.');
  return `Keiro ${major}.${minor} · build ${build}`;
}
```

- [ ] **Step 5: Show it**

In `src/components/navigation/AppFooter.jsx` add `import { versionLabel } from '../../utils/appVersion';`
and change line 67's text `Keiro v5.9 · Cloud sync` to `{versionLabel()} · Cloud sync`.

In `src/pages/About.jsx` add `import { versionLabel } from '../utils/appVersion';`
and change line 90's text `Keiro v5.9 — Built for delivery drivers.` to `{versionLabel()} — Built for delivery drivers.`.

- [ ] **Step 6: Run the tests, build, lint, commit**

```bash
mv .env /tmp/keiro.env.bak; npx vitest run; mv /tmp/keiro.env.bak .env
npm run build && npx eslint src
git add package.json package-lock.json vite.config.js eslint.config.js src/utils/appVersion.js src/components/navigation/AppFooter.jsx src/pages/About.jsx src/__tests__/appVersion.test.js
git commit -m "feat(about): show the real version and build instead of a typed-in v5.9

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Spam hint and the email notes

**Files:**
- Modify: `src/utils/constants.js`, `src/components/auth/OnboardingFlow.jsx:642,656`, `src/pages/Profile.jsx:45`, `CLAUDE.md` (Pending section), `docs/CONTEXT.md` (§11 table)

Copy-only; verified by build and the grep in Step 4.

- [ ] **Step 1: Add the hint**

In `src/utils/constants.js`, after `STORAGE_FULL_MESSAGE`:

```js
/** Gmail-sent sign-in mail lands in Spam more often than domain mail. */
export const SPAM_HINT = "Can't find it? Check your Spam folder.";
```

- [ ] **Step 2: Show it on every "we sent you an email" notice**

`src/components/auth/OnboardingFlow.jsx`: add `import { SPAM_HINT } from '../../utils/constants';`, then:
- line 642 → ``setNotice(`Almost there — we sent a confirmation link to ${email}. Tap it, then come back and log in. ${SPAM_HINT}`);``
- line 656 → ``setNotice(`Reset link sent to ${email} — tap it to choose a new password. ${SPAM_HINT}`);``

`src/pages/Profile.jsx`: add `import { SPAM_HINT } from '../utils/constants';`, then line 45 →
``else { setMsg(`Email updated! Check your inbox to confirm. ${SPAM_HINT}`); setNewEmail(''); }``

- [ ] **Step 3: Update the notes**

In `CLAUDE.md`, in "Pending — real-world launch blockers", replace the sentence beginning
`**Remaining blocker:** Resend's shared` through `No domain purchased yet, by choice.` with:

```markdown
**Remaining blocker (owner, 2026-10-07 decision):** switch Supabase SMTP from Resend's
shared `onboarding@resend.dev` sender (delivers only to the Resend account's own address)
to a Gmail account made for Keiro: `smtp.gmail.com`, port 465, the Gmail address as user
and sender, a Google app password (needs 2-Step Verification), sender name "Keiro";
templates and the 30/hour limit stay. Gmail allows ~500 messages a day. Steps:
`docs/superpowers/plans/2026-10-07-launch-readiness.md`, "Owner actions". Every "we sent
you an email" notice adds `SPAM_HINT` because Gmail-sent mail lands in Spam more often.
```

In `docs/CONTEXT.md` §11, replace the row starting `| Resend shared sender` with:

```markdown
| Auth email sender | Supabase custom SMTP. Resend's shared sender only reaches the Resend account owner; the decided fix is a Keiro Gmail (`smtp.gmail.com:465`, app password). Gmail mail lands in Spam more often, hence `SPAM_HINT` on every "we sent you an email" notice |
```

- [ ] **Step 4: Verify and commit**

Run: `grep -c "SPAM_HINT" src/components/auth/OnboardingFlow.jsx src/pages/Profile.jsx`
Expected: `3` and `2` (each file's import plus its uses).

```bash
mv .env /tmp/keiro.env.bak; npx vitest run; mv /tmp/keiro.env.bak .env
npm run build && npx eslint src
git add src/utils/constants.js src/components/auth/OnboardingFlow.jsx src/pages/Profile.jsx CLAUDE.md docs/CONTEXT.md
git commit -m "feat(auth): spam hint on sign-in emails; document the Gmail SMTP switch

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Keep the database awake (and alert when it is down)

**Files:**
- Create: `.github/workflows/keep-supabase-awake.yml`
- Modify: `CLAUDE.md` (Supabase Migrations section)

- [ ] **Step 1: Prove the request works against the live project**

```bash
URL=$(grep -m1 '^VITE_SUPABASE_URL=' .env | cut -d= -f2-)
KEY=$(grep -m1 '^VITE_SUPABASE_ANON_KEY=' .env | cut -d= -f2-)
curl -s -o /dev/null -w '%{http_code}\n' -H "apikey: $KEY" -H "Authorization: Bearer $KEY" "$URL/rest/v1/profiles?select=id&limit=1"
```

Expected: `200` (RLS returns `[]` to the anon key; the request still counts as activity).

- [ ] **Step 2: Create the workflow**

`.github/workflows/keep-supabase-awake.yml`:

```yaml
name: Keep Supabase awake

# The free Supabase plan pauses a project after about 7 days without activity,
# which takes sign-in and sync down for everyone. One tiny read every 3 days
# keeps it awake. A run that gets anything but HTTP 200 fails, and GitHub
# emails the owner: the same job is the "Keiro's database is down" alert.
# Needs repo secrets SUPABASE_URL and SUPABASE_ANON_KEY (the public anon key).
# GitHub disables scheduled workflows after 60 days with no repo activity; any
# push re-arms it.

on:
  schedule:
    - cron: '17 9 */3 * *'
  workflow_dispatch:

jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - name: Read one row
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
        run: |
          code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 \
            -H "apikey: $SUPABASE_ANON_KEY" \
            -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
            "$SUPABASE_URL/rest/v1/profiles?select=id&limit=1")
          echo "Supabase answered HTTP $code"
          test "$code" = "200"
```

- [ ] **Step 3: Note it in `CLAUDE.md`**

At the end of "Supabase Migrations (manual, run in dashboard SQL editor)" add:

```markdown
**Keep-awake + outage alert:** `.github/workflows/keep-supabase-awake.yml` reads one row
every 3 days so the free project never pauses; a run that doesn't get HTTP 200 fails and
GitHub emails the owner. Needs repo secrets `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
GitHub disables scheduled workflows after 60 days without repo activity; any push re-arms it.
```

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/keep-supabase-awake.yml CLAUDE.md
git commit -m "ci: keep the free Supabase project awake; a failed ping emails the owner

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(The run itself is verified after the owner adds the secrets and the branch is merged:
Actions → "Keep Supabase awake" → Run workflow → green.)

---

### Task 12: Two-phone and on-device test script

**Files:**
- Create: `docs/device-test.md`
- Modify: `CLAUDE.md` (Pending section)

- [ ] **Step 1: Write `docs/device-test.md`**

```markdown
# Device test — two phones

Run after a release that touches sign-in, connections, orders, invoices or storage.
Phone A = driver, Phone B = store owner. Use real `alomonds+<tag>@gmail.com` accounts
and note which ones you created. Tick each step; write down anything that differs.

## Before you start
- [ ] Both phones have the latest app (web: hard refresh; iPhone app: open twice so the OTA update applies).
- [ ] Settings → About on both shows the same "build" code as `curl -s https://keiro-mutammimas-projects.vercel.app/version.json`.

## 1. Sign-up emails (Gmail SMTP)
1. [ ] Phone B: Sign up with email using an address that is NOT the Keiro Gmail.
   Expect: "Almost there — we sent a confirmation link… Can't find it? Check your Spam folder."
2. [ ] The email arrives within 2 minutes (check Spam). Sender: Keiro, from the Keiro Gmail.
3. [ ] Tap the link → lands on the live Keiro site, not a dead page. Log in.
4. [ ] Log out → "Forgot password" → reset email arrives → link opens "set the new password" → new password works.

## 2. Google sign-in on the iPhone app
5. [ ] Phone A (iPhone app): Continue with Google → Safari sheet → choose account → returns to Keiro signed in.

## 3. Invite → connect
6. [ ] Phone A (driver): Stores → Connect a store → share the invite link to Phone B.
7. [ ] Phone B: open the link → it connects → Drivers tab shows Phone A's business.
8. [ ] Phone A: Stores shows Phone B's store as connected.

## 4. Order → invoice → signature → receipt
9. [ ] Phone B: Orders → New request to Phone A (one product, quantity 5).
10. [ ] Phone A: the order appears in Route within a minute → Accept → Fill invoice → Generate.
11. [ ] Phone A: open the invoice → Sign → both signatures → leave the invoice → reopen: signatures still there.
12. [ ] Phone A: Download PDF / Share → the share sheet opens (iPhone app) → the PDF shows both signatures in dark ink (also with the app in dark mode).
13. [ ] Phone B: Orders shows the order delivered with the invoice number → Invoices shows the invoice → Confirm receipt.
14. [ ] Phone A: the order shows receipt confirmed.

## 5. Offline
15. [ ] Phone A: turn on Airplane Mode → New invoice → Generate. Expect: saved, an amber "saved on this phone" toast.
16. [ ] Turn Airplane Mode off → within a minute a green "Synced 1 pending change" toast; the invoice is on Phone A's other session / the web.

## 6. Crash reports
17. [ ] Phone A: Settings → Help & Tutorial → Send test report → "Sent…".
18. [ ] Sentry (sentry.io → Issues) shows "Keiro test report" tagged `source: test-report`, with no names or invite codes in it.
19. [ ] Settings → Terms & Privacy → switch "Send crash reports" off → Send test report → "Crash reports are switched off".

## Record
| Date | Build | Phones | Passed | Notes |
|---|---|---|---|---|
| | | | | |
```

- [ ] **Step 2: Point to it from `CLAUDE.md`**

In "Pending — real-world launch blockers", in the **Two-device pass** bullet, replace
`Numbered test script written and ready to run.` with
`Test script: [docs/device-test.md](docs/device-test.md).`, and in the **Native PDF share
+ Google sign-in** bullet replace `On-device checklist written and ready to run.` with
`Covered by docs/device-test.md (steps 5 and 12).`

- [ ] **Step 3: Commit**

```bash
git add docs/device-test.md CLAUDE.md
git commit -m "docs: two-phone and on-device test script

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Final verification and handoff

- [ ] **Step 1: Whole suite, as CI runs it**

Run: `mv .env /tmp/keiro.env.bak; npx vitest run; mv /tmp/keiro.env.bak .env`
Expected: every file passes; the count is 181 plus the new tests.

- [ ] **Step 2: Build and lint**

Run: `npm run build && npx eslint src`
Expected: build succeeds (the two pre-existing `INEFFECTIVE_DYNAMIC_IMPORT` warnings only); no lint errors.

- [ ] **Step 3: Browser check at 375px** (follow `.claude/skills/verified-fix/`: clear the service worker first)

- Footer and About show `Keiro 5.9 · build <hash>`.
- Settings → Help & Tutorial: "Send test report" works as in Task 7.
- Settings → Terms & Privacy: the switch; the privacy text mentions Sentry.
- In the console: `window.dispatchEvent(new CustomEvent('inv-storage-full'))` shows the storage
  banner above any sync banner; `window.dispatchEvent(new CustomEvent('inv-storage-ok'))` hides it.
- Draw a signature in dark mode, download the PDF: the signature is visible (Task 5, if done).
Screenshot each.

- [ ] **Step 4: Report, then stop**

Post a state table (branch, commits, tests, build, what was checked in the browser) and the
"Owner actions" list. Do not push or open a PR until the owner says so (CLAUDE.md:
"When the user asks to create a PR, push the branch and open a PR").

---

## Owner actions

1. **Sign-in email through Gmail**
   1. Create a Gmail for Keiro (e.g. `keiro.app.team@gmail.com`).
   2. Google Account → Security → turn on 2-Step Verification.
   3. Google Account → Security → App passwords → create one named "Supabase" → copy the 16 letters.
   4. Supabase dashboard → Authentication → Emails → SMTP Settings: Host `smtp.gmail.com`,
      Port `465`, Username = the Gmail address, Password = the app password,
      Sender email = the Gmail address, Sender name `Keiro` → Save.
   5. Run `docs/device-test.md` section 1.
2. **Sentry**
   1. sentry.io → sign up (free Developer plan) → Create project → platform **React** → name `keiro`.
   2. Copy the DSN (Settings → Projects → keiro → Client Keys).
   2a. Settings → Projects → keiro → Security & Privacy → turn on **Prevent Storing of IP
       Addresses** (a server-side backstop; the app already tells Sentry never to infer the IP).
   3. Vercel → keiro project → Settings → Environment Variables → `VITE_SENTRY_DSN` = the DSN, all environments → redeploy.
   4. Optional, for readable stack traces: Sentry → Settings → Auth Tokens → create one with
      `project:releases` and `org:read`; add `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` (your org slug)
      and `SENTRY_PROJECT` (`keiro`) to Vercel.
3. **Keep-awake secrets** — GitHub → keiro repo → Settings → Secrets and variables → Actions:
   `SUPABASE_URL` and `SUPABASE_ANON_KEY` (the same values as `.env`). Or tell Claude to set
   them with `gh secret set`.
4. **Merge the PR**, then run `docs/device-test.md` on two phones.
