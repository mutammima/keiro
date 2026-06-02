/**
 * Generates InvoGo PWA icons (192×192 and 512×512).
 *
 * Design:
 *   • Black rounded-square background
 *   • Large white invoice document (body + ruled lines + green checkmark badge)
 *     centred and scaled to fill ~75 % of the icon — no wordmark
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

function makeSVG(S) {
  const outerRx = Math.round(S * 0.22);

  // Scale the 44×44 AppLogoSVG viewBox so the document fills ~72 % of the icon.
  // Original document: rect x=8 y=4 w=24 h=32 → centre at (20, 20) in 44-space.
  const scale = (S * 0.72) / 44;

  // Document rect (x=8 y=4 w=24 h=32 rx=4 in 44-space)
  const docW  = 24 * scale;
  const docH  = 32 * scale;
  const docRx = 4  * scale;
  // Centre the whole 44×44 scaled block in the icon
  const originX = (S - 44 * scale) / 2;   // where x=0 of the 44-space lands
  const originY = (S - 44 * scale) / 2;

  const docX = originX + 8 * scale;
  const docY = originY + 4 * scale;

  // Ruled lines (x1=14 x2=26, third line x2=20, y=14/20/26 in 44-space)
  const lx1  = originX + 14 * scale;
  const lx2  = originX + 26 * scale;
  const lx2s = originX + 20 * scale;
  const ly1  = originY + 14 * scale;
  const ly2  = originY + 20 * scale;
  const ly3  = originY + 26 * scale;
  const lw   = Math.max(2, 2.2 * scale);

  // Check badge (cx=32 cy=34 r=7 in 44-space)
  const bCx = originX + 32 * scale;
  const bCy = originY + 34 * scale;
  const bR  = 7  * scale;
  const bSW = Math.max(1.5, 1.5 * scale);

  // Checkmark polyline (28.5,34  31,36.5  35.5,31.5 in 44-space)
  const ck = (ox, oy) => `${originX + ox * scale},${originY + oy * scale}`;
  const checkPts = `${ck(28.5, 34)} ${ck(31, 36.5)} ${ck(35.5, 31.5)}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">

  <!-- Black background -->
  <rect width="${S}" height="${S}" rx="${outerRx}" fill="${BLACK}"/>

  <!-- Invoice document -->
  <rect x="${docX}" y="${docY}" width="${docW}" height="${docH}" rx="${docRx}"
        fill="rgba(255,255,255,0.18)" stroke="${WHITE}" stroke-width="${lw}"/>

  <!-- Ruled lines -->
  <line x1="${lx1}" y1="${ly1}" x2="${lx2}"  y2="${ly1}" stroke="${WHITE}" stroke-width="${lw}" stroke-linecap="round"/>
  <line x1="${lx1}" y1="${ly2}" x2="${lx2}"  y2="${ly2}" stroke="${WHITE}" stroke-width="${lw}" stroke-linecap="round"/>
  <line x1="${lx1}" y1="${ly3}" x2="${lx2s}" y2="${ly3}" stroke="${WHITE}" stroke-width="${lw}" stroke-linecap="round"/>

  <!-- Green checkmark badge -->
  <circle cx="${bCx}" cy="${bCy}" r="${bR}" fill="${GREEN}" stroke="${WHITE}" stroke-width="${bSW}"/>
  <polyline points="${checkPts}"
            stroke="${WHITE}" stroke-width="${lw}"
            stroke-linecap="round" stroke-linejoin="round" fill="none"/>

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
