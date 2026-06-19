/**
 * SyncQueueRunner — drives the offline retry queue (utils/syncQueue.js).
 *
 * Renders nothing. Mounted once near the app root, it replays any parked cloud
 * writes:
 *   • once on startup (catches a queue left from a previous session),
 *   • on the browser `online` event,
 *   • on app foreground (visibilitychange → visible),
 *   • and on a 60s interval while online (in case the `online` event was missed).
 */

import { useEffect } from 'react';
import { processSyncQueue } from '../../utils/syncQueue';

export default function SyncQueueRunner() {
  useEffect(() => {
    processSyncQueue();

    const onOnline = () => processSyncQueue();
    const onVisible = () => { if (document.visibilityState === 'visible') processSyncQueue(); };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    const interval = setInterval(() => { if (navigator.onLine) processSyncQueue(); }, 60000);

    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(interval);
    };
  }, []);

  return null;
}
