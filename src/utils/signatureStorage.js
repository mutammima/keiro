/**
 * signatureStorage — lightweight localStorage helpers for persisting invoice signatures.
 *
 * Signatures are kept in a separate key from the invoice list to avoid bloating the
 * main invoice payload (base64 PNGs can be 20-60 KB each).
 *
 * Key pattern: `inv_sig_<invoiceNumber>`
 * Value shape: JSON { seller: dataUrl | null, buyer: dataUrl | null }
 */

const PREFIX = 'inv_sig_';

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
 * @param {number|string} invoiceNumber
 * @param {string|null} sellerSig  - data URL or null
 * @param {string|null} buyerSig   - data URL or null
 */
export function saveSignatures(invoiceNumber, sellerSig, buyerSig) {
  try {
    if (!sellerSig && !buyerSig) {
      localStorage.removeItem(PREFIX + invoiceNumber);
    } else {
      localStorage.setItem(
        PREFIX + invoiceNumber,
        JSON.stringify({ seller: sellerSig, buyer: buyerSig })
      );
    }
  } catch (e) {
    console.warn('saveSignatures: localStorage write failed', e);
  }
}

/**
 * Removes saved signatures for an invoice (e.g. when the invoice is deleted).
 * @param {number|string} invoiceNumber
 */
export function clearSignatures(invoiceNumber) {
  try { localStorage.removeItem(PREFIX + invoiceNumber); } catch {}
}
