/**
 * PlanNotices — the one-time plan notes (plan.js applyFreshPlan writes them):
 * "moved" when an existing driver lands on Free and in Easy Mode, "ended" when
 * Pro ends. OK clears the note for good, and only OK does: the sheet is given
 * no onClose, so a stray tap on the dimmed backdrop can't dismiss the one
 * explanation of the change unread (the Upgrade and limit sheets, which lose
 * nothing by closing, do close on a tap outside).
 */
import { useEffect, useState } from 'react';
import { STORAGE_KEYS, EVENTS, PLAN_COPY } from '../../utils/constants';
import PlanSheet, { PrimaryBtn } from './PlanSheet';

function readNotice() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.PLAN_NOTICE)); } catch { return null; }
}

export default function PlanNotices() {
  const [notice, setNotice] = useState(readNotice);

  useEffect(() => {
    const onChange = () => setNotice(readNotice());
    window.addEventListener(EVENTS.PLAN_CHANGE, onChange);
    return () => window.removeEventListener(EVENTS.PLAN_CHANGE, onChange);
  }, []);

  if (notice !== 'moved' && notice !== 'ended') return null;

  function dismiss() {
    try { localStorage.removeItem(STORAGE_KEYS.PLAN_NOTICE); } catch { /* private mode */ }
    setNotice(null);
  }

  return (
    <PlanSheet open label={PLAN_COPY.planNoticeLabel}>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55 }}>
        {notice === 'ended' ? PLAN_COPY.endedNote : PLAN_COPY.movedNote}
      </p>
      <PrimaryBtn onClick={dismiss}>{PLAN_COPY.ok}</PrimaryBtn>
    </PlanSheet>
  );
}
