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
