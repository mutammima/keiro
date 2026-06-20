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

const PREFIX = STORAGE_KEYS.SIG_PREFIX;

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
  try { localStorage.removeItem(PREFIX + invoiceNumber); } catch {}
  db.deleteSignatureRow(invoiceNumber)
    .catch(e => console.error('deleteSignatureRow cloud error', e));
}

/**
 * Fetches all of the current user's signatures from Supabase and rebuilds the
 * local inv_sig_* cache. Called on InvoiceHistory mount so a fresh device shows
 * previously-captured proof of delivery. No-op (silent) when signed out.
 * @returns {Promise<void>}
 */
export async function loadAllSignaturesFromCloud() {
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
}
