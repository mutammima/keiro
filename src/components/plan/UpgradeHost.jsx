/**
 * UpgradeHost — mounted once in the app shell. Every Upgrade button
 * (EVENTS.OPEN_UPGRADE) and the free limit (EVENTS.OPEN_FREE_LIMIT) open
 * their sheet here, so screens only dispatch an event (plan.js openUpgrade /
 * openFreeLimit).
 */
import { useEffect, useState } from 'react';
import { EVENTS, PLAN_COPY } from '../../utils/constants';
import UpgradeSheet from './UpgradeSheet';
import FreeLimitSheet from './FreeLimitSheet';

export default function UpgradeHost() {
  const [upgradeTitle, setUpgradeTitle] = useState(null);
  const [limitOpen, setLimitOpen] = useState(false);

  useEffect(() => {
    const onUpgrade = (e) => {
      // Only text is a title: onClick={openUpgrade} would hand over the click event, which can't be drawn
      // (and this host sits in the app shell, so drawing it would take the whole app down).
      const title = e.detail?.title;
      setLimitOpen(false);
      setUpgradeTitle(typeof title === 'string' && title ? title : PLAN_COPY.upgradeTitle);
    };
    // The latest event wins, so two sheets are never stacked (PlanSheet has no focus trap: a keyboard
    // user can reach + New behind an open Upgrade sheet).
    const onLimit = () => { setUpgradeTitle(null); setLimitOpen(true); };
    window.addEventListener(EVENTS.OPEN_UPGRADE, onUpgrade);
    window.addEventListener(EVENTS.OPEN_FREE_LIMIT, onLimit);
    return () => {
      window.removeEventListener(EVENTS.OPEN_UPGRADE, onUpgrade);
      window.removeEventListener(EVENTS.OPEN_FREE_LIMIT, onLimit);
    };
  }, []);

  return (
    <>
      <UpgradeSheet open={!!upgradeTitle} title={upgradeTitle} onClose={() => setUpgradeTitle(null)} />
      <FreeLimitSheet
        open={limitOpen}
        onClose={() => setLimitOpen(false)}
        onUpgrade={() => { setLimitOpen(false); setUpgradeTitle(PLAN_COPY.upgradeTitle); }}
      />
    </>
  );
}
