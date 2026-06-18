/**
 * useVersionCheck — polls /version.json every 30 seconds, bypassing the SW cache.
 * When a newer version is detected it dispatches 'inv-version-update' so the UI
 * can show a prompt. The user decides when to reload — nothing happens automatically.
 *
 * LOCAL_VERSION is injected at build time by vite.config.js as __APP_VERSION__
 * (a git short-hash). public/version.json is also written with that same hash
 * during the build, so every deploy automatically produces a mismatch for users
 * still running the old bundle — no manual version bumping needed.
 *
 * To apply the update the listener should:
 *   1. Unregister all service workers
 *   2. Call window.location.reload()
 */

import { useEffect } from 'react';

// Injected by vite.config.js at build time — unique git hash per deploy
// eslint-disable-next-line no-undef
export const LOCAL_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

/** Unregisters all service workers then hard-reloads. */
export async function applyVersionUpdate() {
  if ('serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map(r => r.unregister()));
  }
  window.location.reload();
}

export default function useVersionCheck() {
  useEffect(() => {
    let notified = false; // only fire the event once per session

    async function check() {
      if (notified) return; // already told the user — don't keep re-firing
      try {
        const res = await fetch('/version.json', {
          cache: 'no-store',
          headers: { 'pragma': 'no-cache', 'cache-control': 'no-cache' },
        });
        if (!res.ok) return;
        const { version } = await res.json();
        if (version && version !== LOCAL_VERSION) {
          notified = true;
          // Let the UI handle it — no auto-reload
          window.dispatchEvent(new CustomEvent('inv-version-update', { detail: { version } }));
        }
      } catch {
        // Offline — silently ignore
      }
    }

    // Check immediately on mount, then every 30 seconds
    check();
    const interval = setInterval(check, 30_000);

    // Also check when the tab becomes visible again (user switches back to app)
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
}
