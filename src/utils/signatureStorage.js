/**
 * signatureStorage — persistence for invoice signatures (proof of delivery).
 *
 * Mirrors the rest of the app: write localStorage first (instant + offline),
 * then best-effort sync to Supabase. Signatures are kept in a separate key from
 * the invoice list to avoid bloating the main invoice payload (base64 PNGs can
 * be 20-60 KB each).
 *
 * Key pattern: `inv_sig_<invoiceNumber>`
 * Value shape: JSON { seller: dataUrl | null, buyer: dataUrl | null, updatedAt: ISO }
 *
 * `updatedAt` lets migration.js tell which signatures are new since the last
 * sync; getSignatures ignores it (back-compat: older entries simply lack it).
 */

import * as db from '../services/db';
import { STORAGE_KEYS } from './constants';
import { lsGet, lsSet } from './storage';
import { enqueueSync, dropQueuedSyncs } from './syncQueue';
import { writeLocal, markSignatureSynced } from './storageRoom';

const PREFIX = STORAGE_KEYS.SIG_PREFIX;
const INDEX_KEY = STORAGE_KEYS.SIG_INDEX;

// One invoice's cloud writes run in the order they were made. The pad saves on
// every stroke, and two upserts of the same row racing could leave the cloud
// with the older signature (and the phone's copy stamped as if it matched).
const uploads = new Map();
function inOrder(invoiceNumber, run) {
  const key = Number(invoiceNumber);
  const next = (uploads.get(key) || Promise.resolve()).then(run, run);
  uploads.set(key, next);
  next.then(() => { if (uploads.get(key) === next) uploads.delete(key); });
  return next;
}

/**
 * Returns the stored signatures for an invoice, or nulls if none saved.
 * @param {number|string} invoiceNumber
 * @returns {{ seller: string|null, buyer: string|null }}
 */
export function getSignatures(invoiceNumber) {
  try {
    const raw = localStorage.getItem(PREFIX + invoiceNumber);
    if (!raw) return { seller: null, buyer: null };
    const parsed = JSON.parse(raw);
    return { seller: parsed.seller ?? null, buyer: parsed.buyer ?? null };
  } catch {
    return { seller: null, buyer: null };
  }
}

/**
 * Saves signatures for an invoice. Pass null to clear a signature.
 * Local write is synchronous; cloud sync runs in the background, in order.
 * @param {number|string} invoiceNumber
 * @param {string|null} sellerSig  - data URL or null
 * @param {string|null} buyerSig   - data URL or null
 * @returns {{ savedLocally: boolean, cloud: Promise<boolean> }} savedLocally is
 *   false when this phone's storage is full; cloud resolves true once the cloud
 *   has this signature. Both false: it is saved nowhere, and the caller says so.
 */
export function saveSignatures(invoiceNumber, sellerSig, buyerSig) {
  // Both empty → treat as a clear (and remove the cloud row too).
  if (!sellerSig && !buyerSig) {
    return { savedLocally: true, cloud: clearSignatures(invoiceNumber) };
  }
  const updatedAt = new Date().toISOString();
  const wrote = writeLocal(
    PREFIX + invoiceNumber,
    JSON.stringify({ seller: sellerSig, buyer: buyerSig, updatedAt })
  );
  // "Signed" (which locks editing) only once a copy exists somewhere.
  if (wrote) markIndexed(invoiceNumber, true);
  // Cloud sync. A failure is queued only when this phone holds the image: the
  // queue replays whatever is stored locally, and replaying a missing entry
  // would delete the cloud's older signature.
  const cloud = inOrder(invoiceNumber, () =>
    db.saveSignatureRow({ invoiceNumber, seller: sellerSig, buyer: buyerSig })
      .then(({ error }) => {
        if (error) {
          if (wrote) queueSignatureSync(invoiceNumber, error);
          return false;
        }
        if (wrote) markSignatureSynced(invoiceNumber, updatedAt);
        else keepCloudCopyOnly(invoiceNumber);
        return true;
      })
      .catch((e) => {
        if (wrote) queueSignatureSync(invoiceNumber, e);
        return false;
      })
  );
  return { savedLocally: wrote, cloud };
}

/**
 * The cloud took a signature this phone could not store. Drop the phone's
 * older copy, and any queued replay of it, so neither hides nor overwrites the
 * newer one; opening the invoice downloads it.
 */
function keepCloudCopyOnly(invoiceNumber) {
  markIndexed(invoiceNumber, true);
  try { localStorage.removeItem(PREFIX + invoiceNumber); } catch { /* best-effort */ }
  dropQueuedSyncs('sync_signature', (p) => Number(p.invoiceNumber) === Number(invoiceNumber));
}

/**
 * Removes saved signatures for an invoice (e.g. when the invoice is deleted).
 * @param {number|string} invoiceNumber
 * @returns {Promise<boolean>} whether the cloud row is gone
 */
export function clearSignatures(invoiceNumber) {
  // Local cache eviction only — the authoritative delete is the cloud call
  // below, and a stale local copy is rebuilt by loadSignatureIndexFromCloud.
  try {
    localStorage.removeItem(PREFIX + invoiceNumber);
    markIndexed(invoiceNumber, false);
  } catch { /* cache eviction is best-effort */ }
  return inOrder(invoiceNumber, () =>
    db.deleteSignatureRow(invoiceNumber)
      .then((res) => {
        if (res?.error) { queueSignatureSync(invoiceNumber, res.error); return false; }
        return true;
      })
      .catch((e) => { queueSignatureSync(invoiceNumber, e); return false; })
  );
}

function queueSignatureSync(invoiceNumber, err) {
  console.error('signature cloud sync failed, queued for retry', err);
  enqueueSync({ type: 'sync_signature', payload: { invoiceNumber: Number(invoiceNumber) } });
}

// ── Signed-invoice index ─────────────────────────────────────────────────────
// The history list only needs to know WHICH invoices are signed (a signed
// invoice is locked from editing). It does not need the images. This index is
// an array of invoice numbers — a few bytes each, versus 20-60 KB per base64
// PNG. Fetching the blobs for every invoice on every history mount was the
// app's single largest egress cost; see db.getSignatureIndex.

function readIndex() {
  const raw = lsGet(INDEX_KEY, []);
  return Array.isArray(raw) ? raw.map(Number) : [];
}

function writeIndex(numbers) {
  lsSet(INDEX_KEY, Array.from(new Set(numbers.map(Number))));
}

/** Adds/removes one invoice number from the local index. */
function markIndexed(invoiceNumber, signed) {
  const n = Number(invoiceNumber);
  const cur = readIndex();
  const has = cur.includes(n);
  if (signed && !has) writeIndex([...cur, n]);
  else if (!signed && has) writeIndex(cur.filter(x => x !== n));
}

/**
 * Does this invoice carry a signature? Answers from the local blob cache first
 * (authoritative on this device), then the index (covers invoices signed on
 * another device whose image hasn't been downloaded here yet).
 * @param {number|string} invoiceNumber
 * @returns {boolean}
 */
export function hasSignature(invoiceNumber) {
  const local = getSignatures(invoiceNumber);
  if (local.seller || local.buyer) return true;
  return readIndex().includes(Number(invoiceNumber));
}

/**
 * Refreshes the signed-invoice index from the cloud. Cheap: two small columns,
 * no image data. Called on InvoiceHistory mount (where the full-blob fetch
 * used to be) so a fresh device still knows which invoices are locked.
 * @returns {Promise<void>}
 */
export async function loadSignatureIndexFromCloud() {
  const { data, error } = await db.getSignatureIndex();
  if (error || !data) return;
  writeIndex(data.map(r => r.invoice_number));
}

/**
 * Fetches ONE invoice's signature images from the cloud and caches them
 * locally. Called when an invoice is actually opened and its signatures aren't
 * cached on this device yet. Returns what it found (or nulls).
 * @param {number|string} invoiceNumber
 * @returns {Promise<{ seller: string|null, buyer: string|null }>}
 */
export async function fetchSignatureFromCloud(invoiceNumber) {
  const { data, error } = await db.getSignatureRow(invoiceNumber);
  if (error || !data || (!data.seller && !data.buyer)) return { seller: null, buyer: null };
  try {
    localStorage.setItem(
      PREFIX + invoiceNumber,
      JSON.stringify({
        seller: data.seller ?? null,
        buyer:  data.buyer  ?? null,
        updatedAt: data.updated_at,
        syncedVersion: data.updated_at,   // came from the cloud: it has this version
      })
    );
    markIndexed(invoiceNumber, true);
  } catch { /* quota — the returned value below still renders this session */ }
  return { seller: data.seller ?? null, buyer: data.buyer ?? null };
}

/**
 * Every signature INCLUDING images, cached locally. Only for the backup export,
 * so a backup taken on a device that never opened those invoices still contains
 * them. Never call this on a render path.
 * @returns {Promise<void>}
 */
export async function cacheAllSignaturesForBackup() {
  const { data, error } = await db.getAllSignatures();
  if (error || !data) return;
  data.forEach(row => {
    if (!row.seller && !row.buyer) return;
    try {
      localStorage.setItem(
        PREFIX + row.invoice_number,
        JSON.stringify({
          seller: row.seller ?? null,
          buyer:  row.buyer  ?? null,
          updatedAt: row.updated_at,
          syncedVersion: row.updated_at,  // came from the cloud: it has this version
        })
      );
    } catch { /* quota — skip this row */ }
  });
  writeIndex(data.map(r => r.invoice_number));
}
