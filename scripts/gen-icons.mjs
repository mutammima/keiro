/**
 * Generates InvoGo PWA icons (192×192 and 512×512).
 * Design:
 *   - Black rounded-square background
 *   - Centered invoice-shaped rectangle (portrait, narrow) with corner fold,
 *     white stroke + very subtle fill — extends just above/below the text
 *   - "Invo" (white) + "Go" (green) in one bold line, centered
 * Run once: node scripts/gen-icons.mjs
 */
import sharp from 'sharp';
import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const GREEN  = '#16A34A';
const WHITE  = '#FFFFFF';
const BLACK  = '#0C0C0C';

function makeSVG(size) {
  const S    = size;
  const rx   = Math.round(S * 0.22); // outer rounded square radius

  // --- Invoice rectangle (portrait, centered) ---
  // Narrow: ~55% of S wide, ~70% of S tall
  const rw   = Math.round(S * 0.55);  // rect width
  const rh   = Math.round(S * 0.70);  // rect height
  const rx1  = Math.round((S - rw) / 2);   // left x
  const ry1  = Math.round((S - rh) / 2);   // top y
  const rx2  = rx1 + rw;                   // right x
  const ry2  = ry1 + rh;                   // bottom y

  // Corner fold (top-right)
  const fold = Math.round(S * 0.08);
  // Polygon path: full rect minus top-right corner, replaced with diagonal
  // M top-left → to fold start (top edge) → diagonal → to fold end (right edge) → bottom-right → bottom-left → close
  const rectPath = [
    `M${rx1},${ry1}`,
    `L${rx2 - fold},${ry1}`,
    `L${rx2},${ry1 + fold}`,
    `L${rx2},${ry2}`,
    `L${rx1},${ry2}`,
    `Z`,
  ].join(' ');

  // Fold crease (small triangle outline in corner)
  const foldPath = [
    `M${rx2 - fold},${ry1}`,
    `L${rx2 - fold},${ry1 + fold}`,
    `L${rx2},${ry1 + fold}`,
  ].join(' ');

  // --- Horizontal lines inside the rect (invoice ruled lines) ---
  const lineStartX  = rx1 + Math.round(S * 0.06);
  const lineEndX    = rx2 - Math.round(S * 0.06);
  const lineY1      = ry1 + Math.round(rh * 0.55);
  const lineY2      = ry1 + Math.round(rh * 0.67);
  const lineY3      = ry1 + Math.round(rh * 0.79);
  const lineStroke  = `rgba(255,255,255,0.18)`;
  const lineW       = Math.max(1, Math.round(S * 0.006));

  // --- Typography ---
  const fontSize   = Math.round(S * 0.195);
  const textY      = ry1 + Math.round(rh * 0.38); // centered in upper portion
  const letterSp   = -Math.round(S * 0.008);

  // Stroke/fill weights
  const strokeW    = Math.max(1, Math.round(S * 0.004));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <!-- Outer black background -->
  <rect width="${S}" height="${S}" rx="${rx}" fill="${BLACK}"/>

  <!-- Invoice shape fill (subtle) -->
  <path d="${rectPath}" fill="rgba(255,255,255,0.06)"/>

  <!-- Invoice shape stroke -->
  <path d="${rectPath}" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="${strokeW}"/>

  <!-- Fold crease -->
  <path d="${foldPath}" fill="none" stroke="rgba(255,255,255,0.40)" stroke-width="${strokeW}"/>

  <!-- Ruled lines (lower half) -->
  <line x1="${lineStartX}" y1="${lineY1}" x2="${lineEndX}" y2="${lineY1}" stroke="${lineStroke}" stroke-width="${lineW}"/>
  <line x1="${lineStartX}" y1="${lineY2}" x2="${lineEndX}" y2="${lineY2}" stroke="${lineStroke}" stroke-width="${lineW}"/>
  <line x1="${lineStartX}" y1="${lineY3}" x2="${lineEndX}" y2="${lineY3}" stroke="${lineStroke}" stroke-width="${lineW}"/>

  <!-- "InvoGo" — Invo white, Go green, one line, centered -->
  <text
    x="${S / 2}" y="${textY}"
    text-anchor="middle" dominant-baseline="middle"
    font-family="'Helvetica Neue', Arial, sans-serif"
    font-weight="900" font-size="${fontSize}"
    letter-spacing="${letterSp}"
  ><tspan fill="${WHITE}">Invo</tspan><tspan fill="${GREEN}">Go</tspan></text>
</svg>`;
}

async function generate(size, outPath) {
  const svg = Buffer.from(makeSVG(size));
  await sharp(svg).resize(size, size).png().toFile(outPath);
  console.log(`✓ ${outPath} (${size}×${size})`);
}

await generate(192, resolve(__dirname, '../public/icon-192.png'));
await generate(512, resolve(__dirname, '../public/icon-512.png'));
console.log('Done — icons updated.');
