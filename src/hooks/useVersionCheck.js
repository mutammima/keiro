/**
 * useVersionCheck — polls /version.json every 30 seconds, bypassing the SW cache.
 * When a newer version is detected it dispatches 'inv-version-update' so the UI
 * can show a prompt. The user decides when to reload — nothing happens automatically.
 *
 * To apply the update the listener should:
 *   1. Unregister all service workers
 *   2. Call window.location.reload()
 */

import { useEffect } from 'react';

export const LOCAL_VERSION = '5.9';

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

    // The inline index.html script may have already detected a mismatch before React
    // mounted — pick that up immediately without waiting for the next poll.
    if (window.__inv_version_update_pending) {
      notified = true;
      window.__inv_version_update_pending = false;
      window.dispatchEvent(new CustomEvent('inv-version-update'));
    }

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
          console.log(`[InvoiceGo] Version mismatch: local=${LOCAL_VERSION} remote=${version}. Prompting user.`);
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
