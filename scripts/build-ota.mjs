// ── OTA bundle builder ───────────────────────────────────────────────────────
// Runs AFTER `vite build` (see the "build" npm script). Packages the freshly
// built web app into an over-the-air update bundle that the native iOS app can
// pull without reinstalling:
//
//   dist/ota/<version>.zip   — the zipped web bundle (@capgo/capacitor-updater)
//   dist/ota/latest.json     — { version, url } the app polls on launch
//
// Vercel serves dist/ statically, so once deployed these live at
// <prod>/ota/latest.json and <prod>/ota/<version>.zip. The installed app compares
// its baked-in __APP_VERSION__ against latest.json and, if different, downloads
// the zip and activates it on next open (see src/utils/otaUpdate.js).
//
// NOTE: only the "build" script runs this. `ios:sync` uses a bare `vite build`
// (which empties dist), so the iOS app bundle never contains ota/ — no recursion,
// no bloat.
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';

const DIST = path.resolve('dist');
const OTA_DIR = path.join(DIST, 'ota');
// Override with OTA_BASE_URL if the production origin ever changes.
const PROD = (process.env.OTA_BASE_URL || 'https://keiro-mutammimas-projects.vercel.app').replace(/\/$/, '');

const versionFile = path.join(DIST, 'version.json');
if (!fs.existsSync(versionFile)) {
  console.error('[Keiro OTA] dist/version.json missing — run `vite build` first. Skipping.');
  process.exit(0);
}
const version = JSON.parse(fs.readFileSync(versionFile, 'utf8')).version;

// Zip every dist entry EXCEPT the ota/ folder itself (avoid packaging the bundle
// inside its own bundle). index.html lands at the zip root, as the plugin expects.
const zip = new AdmZip();
for (const entry of fs.readdirSync(DIST)) {
  if (entry === 'ota') continue;
  const full = path.join(DIST, entry);
  if (fs.statSync(full).isDirectory()) zip.addLocalFolder(full, entry);
  else zip.addLocalFile(full);
}

fs.mkdirSync(OTA_DIR, { recursive: true });
const zipName = `${version}.zip`;
zip.writeZip(path.join(OTA_DIR, zipName));

const manifest = { version, url: `${PROD}/ota/${zipName}` };
fs.writeFileSync(path.join(OTA_DIR, 'latest.json'), JSON.stringify(manifest));

console.log(`[Keiro OTA] ${zipName} (${(fs.statSync(path.join(OTA_DIR, zipName)).size / 1024).toFixed(0)} KB) + latest.json → ${manifest.url}`);
