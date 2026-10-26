/**
 * EasyModeSetting — Settings → Easy Mode, for drivers.
 *
 * Easy Mode reshapes only the driver app (tabs, menu, invoice screen, PDF
 * template, tour — see docs/specs/2026-10-14-easy-mode-design.md), so store
 * owners don't get a switch that would do nothing. Turning it on or off reloads
 * the app so every screen reads the new mode.
 *
 * Normal mode is part of Pro (docs/specs/2026-10-16-pricing-design.md §4): for a
 * signed-in driver on the free plan the switch is locked on, and tapping it
 * opens the Upgrade sheet instead of changing the mode.
 */
import { Section, Toggle } from '../ui/SettingsUI';
import { STORAGE_KEYS, PLAN_COPY } from '../../utils/constants';
import { lsSet } from '../../utils/storage';
import { isEasyMode } from '../../utils/easyMode';
import { onFreePlan, openUpgrade, clearEasyByPlan } from '../../utils/plan';
import { usePlan } from '../../hooks/usePlan';

export const EASY_MODE_DESCRIPTION =
  'Scan items to make invoices. Shows Route, Stores and Reports, with Products and Settings in the menu. Hides Home, Store Info, Marketplace, My Listings and Notes.';

export default function EasyModeSetting({ role, C, dark, onChange = () => window.location.reload() }) {
  usePlan(); // re-render when a plan answer lands, so the lock follows the Plan row
  if (role === 'store_owner') return null;

  // Normal mode is part of Pro: on Free the switch stays on and opens Upgrade.
  const locked = onFreePlan();

  function toggle(on) {
    if (locked) { openUpgrade(PLAN_COPY.normalModeTitle); return; }
    // lsSet frees cache space on a full phone; if it still can't save, a
    // reload would come back in the old mode, so don't reload.
    if (lsSet(STORAGE_KEYS.EASY_MODE, on)) {
      clearEasyByPlan(); // his own choice now: sign-out must not undo it
      onChange(on);
    }
  }

  return (
    <Section title="Easy Mode" C={C} defaultOpen>
      <div style={{ paddingTop: 4 }}>
        <div style={s.row}>
          <div>
            <div style={{ ...s.title, color: C.text }}>{PLAN_COPY.easySwitchText}</div>
            <div style={{ ...s.desc, color: C.textMuted }}>{EASY_MODE_DESCRIPTION}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {locked && <span role="img" aria-label={PLAN_COPY.proLockLabel} style={{ fontSize: 13 }}>🔒</span>}
            <Toggle on={locked || isEasyMode()} onChange={toggle} C={C} dark={dark} label={PLAN_COPY.easySwitchLabel} />
          </div>
        </div>
      </div>
    </Section>
  );
}

const s = {
  row:   { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { fontSize: 14, fontWeight: 600, marginBottom: 3 },
  desc:  { fontSize: 12, lineHeight: 1.45 },
};
