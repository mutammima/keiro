/** FreeLimitSheet — "You've used your 20 free invoices this month. They reset Nov 1." */
import { PLAN_COPY } from '../../utils/constants';
import { resetDateLabel } from '../../utils/plan';
import PlanSheet, { PrimaryBtn, TextBtn } from './PlanSheet';

export default function FreeLimitSheet({ open, onClose, onUpgrade }) {
  return (
    <PlanSheet open={open} onClose={onClose} title={PLAN_COPY.limitTitle}>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>{PLAN_COPY.limitBody(resetDateLabel())}</p>
      <PrimaryBtn onClick={onUpgrade}>{PLAN_COPY.upgrade}</PrimaryBtn>
      <TextBtn onClick={onClose}>{PLAN_COPY.notNow}</TextBtn>
    </PlanSheet>
  );
}
