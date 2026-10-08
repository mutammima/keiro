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
