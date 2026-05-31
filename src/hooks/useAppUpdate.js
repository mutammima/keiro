/**
 * useAppUpdate — detects when a new service worker version is waiting and
 * provides an applyUpdate() function that posts SKIP_WAITING, triggering
 * the new SW to take control, then reloads the page.
 *
 * Returns:
 *   updateAvailable  boolean — true when a new SW is sitting in "waiting"
 *   applyUpdate()    function — call to apply the update and reload
 */

import { useState, useEffect, useRef } from 'react';

export default function useAppUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const waitingWorker = useRef(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let registration = null;

    async function checkForWaiting(reg) {
      if (reg.waiting) {
        waitingWorker.current = reg.waiting;
        setUpdateAvailable(true);
      }
    }

    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) return;
      registration = reg;

      // Already waiting on page load (user opened app after a deploy)
      checkForWaiting(reg);

      // New SW found while app is open
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New version is ready, old one still in control
            waitingWorker.current = newWorker;
            setUpdateAvailable(true);
          }
        });
      });
    });

    // Poll every 60 s so long-running sessions don't miss deploys
    const poll = setInterval(() => {
      registration?.update().catch(() => {});
    }, 60_000);

    // When the SW controller changes (new SW took over), reload cleanly
    let reloading = false;
    const onControllerChange = () => {
      if (!reloading) { reloading = true; window.location.reload(); }
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    return () => {
      clearInterval(poll);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  function applyUpdate() {
    if (waitingWorker.current) {
      waitingWorker.current.postMessage({ type: 'SKIP_WAITING' });
      // controllerchange listener above will trigger the reload
    } else {
      window.location.reload();
    }
  }

  return { updateAvailable, applyUpdate };
}
