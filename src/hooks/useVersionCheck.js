/**
 * useVersionCheck — polls /version.json every 30 seconds, completely bypassing
 * the service worker cache. If the remote version differs from the local one,
 * it unregisters all service workers and hard-reloads the page so every device
 * always runs the latest build — no user action required.
 *
 * This is independent of the SW update flow and acts as a guaranteed fallback.
 */

import { useEffect } from 'react';

export const LOCAL_VERSION = '5.8';

export default function useVersionCheck() {
  useEffect(() => {
    async function check() {
      try {
        const res = await fetch('/version.json', {
          cache: 'no-store',
          headers: { 'pragma': 'no-cache', 'cache-control': 'no-cache' },
        });
        if (!res.ok) return;
        const { version } = await res.json();
        if (version && version !== LOCAL_VERSION) {
          console.log(`[InvoiceGo] Version mismatch: local=${LOCAL_VERSION} remote=${version}. Reloading.`);
          // Unregister all service workers so we don't get stuck again
          if ('serviceWorker' in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            await Promise.all(regs.map(r => r.unregister()));
          }
          window.location.reload();
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
