/**
 * UpgradeHost — mounted once in App() (beside the sync banner, so it works on every screen). Every
 * Upgrade button (EVENTS.OPEN_UPGRADE) and the free limit (EVENTS.OPEN_FREE_LIMIT) open their sheet
 * here, so screens only dispatch an event (plan.js openUpgrade / openFreeLimit).
 */
import { useEffect, useState } from 'react';
import { EVENTS, PLAN_COPY } from '../../utils/constants';
import UpgradeSheet from './UpgradeSheet';
import FreeLimitSheet from './FreeLimitSheet';

export default function UpgradeHost() {
  // Which sheet is open: null (none), { kind: 'upgrade', title } or { kind: 'limit' }. One value, so the latest
  // request wins and two sheets can never stack (PlanSheet has no focus trap: a keyboard user can reach + New
  // behind an open Upgrade sheet).
  const [sheet, setSheet] = useState(null);

  useEffect(() => {
    const onUpgrade = (e) => {
      // Only text is a title: onClick={openUpgrade} would hand over the click event, which can't be drawn
      // (and this host sits in App(), above AuthGate and everything it gates, so drawing it would take the whole app down).
      const title = e.detail?.title;
      setSheet({ kind: 'upgrade', title: typeof title === 'string' && title ? title : PLAN_COPY.upgradeTitle });
    };
    const onLimit = () => setSheet({ kind: 'limit' });
    window.addEventListener(EVENTS.OPEN_UPGRADE, onUpgrade);
    window.addEventListener(EVENTS.OPEN_FREE_LIMIT, onLimit);
    return () => {
      window.removeEventListener(EVENTS.OPEN_UPGRADE, onUpgrade);
      window.removeEventListener(EVENTS.OPEN_FREE_LIMIT, onLimit);
    };
  }, []);

  const close = () => setSheet(null);

  return (
    <>
      <UpgradeSheet open={sheet?.kind === 'upgrade'} title={sheet?.kind === 'upgrade' ? sheet.title : undefined} onClose={close} />
      <FreeLimitSheet
        open={sheet?.kind === 'limit'}
        onClose={close}
        onUpgrade={() => setSheet({ kind: 'upgrade', title: PLAN_COPY.upgradeTitle })}
      />
    </>
  );
}
