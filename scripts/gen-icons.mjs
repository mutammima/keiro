/**
 * Generates InvoGo PWA icons (192×192 and 512×512).
 *
 * Design — matches the SplashScreen exactly:
 *   • Black rounded-square background
 *   • White invoice document shape (body + ruled lines + green checkmark badge),
 *     centered in the upper portion — identical geometry to AppLogoSVG in SplashScreen.jsx
 *   • "Invo" (green #16A34A) + "Go" (white) bold wordmark below the mark
 *
 * Run once:  node scripts/gen-icons.mjs
 */
import sharp from 'sharp';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const GREEN = '#16A34A';
const WHITE = '#FFFFFF';
const BLACK = '#0C0C0C';

/**
 * Builds the SVG string for a given square size.
 * All geometry is derived proportionally from the AppLogoSVG viewBox (44×44).
 */
function makeSVG(S) {
  // ── Outer rounded square ────────────────────────────────────────────────────
  const outerRx = Math.round(S * 0.22);

  // ── Scale factor: map the 44×44 splash viewBox onto the icon ───────────────
  // The invoice mark will occupy ~55 % of the icon height
  const scale = (S * 0.55) / 44;

  // ── Invoice document (rect x=8 y=4 w=24 h=32 rx=4 in 44×44 space) ─────────
  const docW  = 24 * scale;
  const docH  = 32 * scale;
  const docRx = 4  * scale;
  // Centre the document horizontally; leave 10 % top padding
  const docX  = (S - docW) / 2;
  const docY  = S * 0.10;

  // ── Text lines inside the document ─────────────────────────────────────────
  // Original: x1=14 x2=26, last line x2=20, y = 14 / 20 / 26 in 44-space
  // Origin of document in 44-space = (8, 4)
  const lx1  = docX + (14 - 8) * scale;
  const lx2  = docX + (26 - 8) * scale;
  const lx2s = docX + (20 - 8) * scale;   // short 3rd line
  const ly1  = docY + (14 - 4) * scale;
  const ly2  = docY + (20 - 4) * scale;
  const ly3  = docY + (26 - 4) * scale;
  const lw   = Math.max(1.5, 2 * scale);  // stroke-width

  // ── Check badge (cx=32 cy=34 r=7 in 44-space) ──────────────────────────────
  const bCx = docX + (32 - 8) * scale;
  const bCy = docY + (34 - 4) * scale;
  const bR  = 7 * scale;
  const bSW = Math.max(1, 1.5 * scale);

  // Checkmark polyline: 28.5,34  31,36.5  35.5,31.5 in 44-space
  const ck = (ox, oy) => `${docX + (ox - 8) * scale},${docY + (oy - 4) * scale}`;
  const checkPts = `${ck(28.5, 34)} ${ck(31, 36.5)} ${ck(35.5, 31.5)}`;

  // ── "InvoGo" wordmark — centred below the mark ─────────────────────────────
  const fontSize = Math.round(S * 0.175);
  const textY    = docY + docH + bR + S * 0.14;   // below badge bottom + gap
  const ls       = -Math.round(S * 0.008);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">

  <!-- Black background -->
  <rect width="${S}" height="${S}" rx="${outerRx}" fill="${BLACK}"/>

  <!-- Document body (fill + stroke, matching AppLogoSVG) -->
  <rect x="${docX}" y="${docY}" width="${docW}" height="${docH}" rx="${docRx}"
        fill="rgba(255,255,255,0.18)" stroke="${WHITE}" stroke-width="${lw}"/>

  <!-- Ruled lines -->
  <line x1="${lx1}" y1="${ly1}" x2="${lx2}"  y2="${ly1}" stroke="${WHITE}" stroke-width="${lw}" stroke-linecap="round"/>
  <line x1="${lx1}" y1="${ly2}" x2="${lx2}"  y2="${ly2}" stroke="${WHITE}" stroke-width="${lw}" stroke-linecap="round"/>
  <line x1="${lx1}" y1="${ly3}" x2="${lx2s}" y2="${ly3}" stroke="${WHITE}" stroke-width="${lw}" stroke-linecap="round"/>

  <!-- Checkmark badge -->
  <circle cx="${bCx}" cy="${bCy}" r="${bR}" fill="${GREEN}" stroke="${WHITE}" stroke-width="${bSW}"/>
  <polyline points="${checkPts}"
            stroke="${WHITE}" stroke-width="${lw}"
            stroke-linecap="round" stroke-linejoin="round" fill="none"/>

  <!-- Wordmark: "Invo" green + "Go" white -->
  <text
    x="${S / 2}" y="${textY}"
    text-anchor="middle" dominant-baseline="middle"
    font-family="'Helvetica Neue', Arial, sans-serif"
    font-weight="900" font-size="${fontSize}"
    letter-spacing="${ls}"
  ><tspan fill="${GREEN}">Invo</tspan><tspan fill="${WHITE}">Go</tspan></text>

</svg>`;
}

async function generate(size, outPath) {
  const svg = Buffer.from(makeSVG(size));
  await sharp(svg).resize(size, size).png().toFile(outPath);
  console.log(`✓ ${outPath}  (${size}×${size})`);
}

await generate(192, resolve(__dirname, '../public/icon-192.png'));
await generate(512, resolve(__dirname, '../public/icon-512.png'));
console.log('Done — icons updated.');
