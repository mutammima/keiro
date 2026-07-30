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

const PREFIX = STORAGE_KEYS.SIG_PREFIX;
const INDEX_KEY = STORAGE_KEYS.SIG_INDEX;

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
 * Local write is synchronous; cloud sync is best-effort in the background.
 * @param {number|string} invoiceNumber
 * @param {string|null} sellerSig  - data URL or null
 * @param {string|null} buyerSig   - data URL or null
 */
export function saveSignatures(invoiceNumber, sellerSig, buyerSig) {
  // Both empty → treat as a clear (and remove the cloud row too).
  if (!sellerSig && !buyerSig) {
    clearSignatures(invoiceNumber);
    return;
  }
  try {
    localStorage.setItem(
      PREFIX + invoiceNumber,
      JSON.stringify({ seller: sellerSig, buyer: buyerSig, updatedAt: new Date().toISOString() })
    );
    markIndexed(invoiceNumber, true);
  } catch (e) {
    console.warn('saveSignatures: localStorage write failed', e);
  }
  // Best-effort cloud sync (no toast: signatures aren't money records and the
  // local copy is always the source of truth for the current device).
  db.saveSignatureRow({ invoiceNumber, seller: sellerSig, buyer: buyerSig })
    .then(({ error }) => { if (error) console.error('saveSignatureRow cloud error', error); })
    .catch(e => console.error('saveSignatureRow cloud error', e));
}

/**
 * Removes saved signatures for an invoice (e.g. when the invoice is deleted).
 * @param {number|string} invoiceNumber
 */
export function clearSignatures(invoiceNumber) {
  // Local cache eviction only — the authoritative delete is the cloud call
  // below, and a stale local copy is rebuilt by loadSignatureIndexFromCloud.
  try {
    localStorage.removeItem(PREFIX + invoiceNumber);
    markIndexed(invoiceNumber, false);
  } catch { /* cache eviction is best-effort */ }
  db.deleteSignatureRow(invoiceNumber)
    .catch(e => console.error('deleteSignatureRow cloud error', e));
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
        })
      );
    } catch { /* quota — skip this row */ }
  });
  writeIndex(data.map(r => r.invoice_number));
}
