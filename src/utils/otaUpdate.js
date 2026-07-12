import { Capacitor } from '@capacitor/core';

// ── Self-hosted over-the-air updates (native only) ───────────────────────────
// On launch the installed iOS app compares its baked-in __APP_VERSION__ (the git
// hash it was built from) against the deployed /ota/latest.json. If they differ,
// it downloads the new web bundle and activates it on the NEXT app open — so the
// user gets updates without re-sideloading, and never mid-session.
//
// Safety: notifyAppReady() tells @capgo/capacitor-updater the current bundle
// booted successfully. If an update is ever bad and this never fires (within
// appReadyTimeout), the plugin automatically rolls back to the last good bundle —
// the app can't be bricked by a broken OTA push.
//
// On web (isNativePlatform() === false) this is a no-op; web keeps its existing
// service-worker "Update available" banner.

const MANIFEST_URL = 'https://keiro-mutammimas-projects.vercel.app/ota/latest.json';

export async function initOtaUpdates() {
  if (!Capacitor.isNativePlatform()) return;

  let Updater;
  try {
    ({ CapacitorUpdater: Updater } = await import('@capgo/capacitor-updater'));
  } catch {
    return; // plugin unavailable — nothing to do
  }

  // Must fire every launch so a freshly-activated bundle isn't rolled back.
  try { await Updater.notifyAppReady(); } catch { /* non-fatal */ }

  try {
    const running = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : null;
    const latest = await fetch(MANIFEST_URL, { cache: 'no-store' }).then((r) => r.json());
    if (latest && latest.version && latest.url && latest.version !== running) {
      const bundle = await Updater.download({ url: latest.url, version: latest.version });
      await Updater.next({ id: bundle.id }); // applies on next background/relaunch
    }
  } catch {
    // Offline or manifest unreachable — keep the current bundle, retry next launch.
  }
}
