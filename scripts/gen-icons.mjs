/**
 * Generates InvoGo PWA icons (192×192 and 512×512).
 * Design: green rounded square, bold white "IG" lettermark.
 * Run once: node scripts/gen-icons.mjs
 */
import sharp from 'sharp';
import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function makeSVG(size) {
  const r      = Math.round(size * 0.22);
  const accent = '#16A34A';

  // Two-line layout: "Invo" top, "Go" bottom — large, bold, tight
  const fsTop = Math.round(size * 0.30);  // "Invo"
  const fsBot = Math.round(size * 0.36);  // "Go" — slightly larger for balance
  const yTop  = Math.round(size * 0.42);  // vertical position of "Invo"
  const yBot  = Math.round(size * 0.73);  // vertical position of "Go"

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${r}" fill="${accent}"/>
  <text
    x="${size * 0.5}" y="${yTop}"
    text-anchor="middle" dominant-baseline="middle"
    font-family="'Helvetica Neue', Arial, sans-serif"
    font-weight="900" font-size="${fsTop}"
    letter-spacing="-${Math.round(size * 0.008)}"
    fill="rgba(255,255,255,0.80)"
  >Invo</text>
  <text
    x="${size * 0.5}" y="${yBot}"
    text-anchor="middle" dominant-baseline="middle"
    font-family="'Helvetica Neue', Arial, sans-serif"
    font-weight="900" font-size="${fsBot}"
    letter-spacing="-${Math.round(size * 0.01)}"
    fill="white"
  >Go</text>
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
