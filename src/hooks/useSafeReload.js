/**
 * useSafeReload — a reload the app asks for itself (a plan change that flips the
 * mode, see PlanRunner) that never lands under unsaved work.
 *
 * `busy` is true while the driver is making an invoice (App.jsx passes
 * page === 'invoice', the condition UpdateBanner already uses as isMidInvoice).
 * The returned function reloads at once when idle; while busy it only
 * remembers, and the reload happens when `busy` turns false. It is the same
 * function every render, so it is safe as an effect dependency.
 *
 * `reload` is a parameter so tests can watch it (jsdom can't stub
 * location.reload). Its default is module-level, so it never changes either.
 */
import { useCallback, useEffect, useRef } from 'react';

const hardReload = () => window.location.reload();

export function useSafeReload(busy, reload = hardReload) {
  const busyRef = useRef(busy);
  const askedRef = useRef(false);   // a reload was asked for while busy

  useEffect(() => {
    busyRef.current = busy;
    if (!busy && askedRef.current) {
      askedRef.current = false;
      reload();
    }
  }, [busy, reload]);

  return useCallback(() => {
    if (busyRef.current) askedRef.current = true;
    else reload();
  }, [reload]);
}
