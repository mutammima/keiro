/**
 * PlanSetting — Settings → Plan, for signed-in drivers
 * (docs/specs/2026-10-16-pricing-design.md §4). Free shows the month's count
 * and Upgrade (the Upgrade sheet says payments are coming soon); the owner's
 * switch shows "Pro (free)" or "Pro until …".
 */
import { ACCENT } from '../../theme';
import { Section, Row } from '../ui/SettingsUI';
import { PLAN_COPY, STORAGE_KEYS } from '../../utils/constants';
import { planSummary, openUpgrade } from '../../utils/plan';
import { usePlan } from '../../hooks/usePlan';

function isGuestNow() {
  try { return localStorage.getItem(STORAGE_KEYS.GUEST_MODE) === 'true'; } catch { return false; }
}

export default function PlanSetting({ role, C }) {
  const plan = usePlan();
  if (role === 'store_owner' || isGuestNow()) return null;

  const v = planSummary(plan);
  return (
    <Section title={PLAN_COPY.planSectionTitle} C={C} defaultOpen>
      <Row label={v.label} sub={v.sub || null} C={C}>
        {v.action === 'upgrade' && (
          <button type="button" onClick={() => openUpgrade()} style={{ ...s.btn, background: ACCENT, color: '#fff' }}>
            {PLAN_COPY.upgrade}
          </button>
        )}
      </Row>
    </Section>
  );
}

const s = {
  // 44px is the app's minimum tap target (TopNav and PlanSheet's buttons use the same).
  btn: { flexShrink: 0, minHeight: 44, padding: '0 14px', borderRadius: 10, border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
};
