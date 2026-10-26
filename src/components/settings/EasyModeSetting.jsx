/**
 * EasyModeSetting — Settings → Easy Mode, for drivers.
 *
 * Easy Mode reshapes only the driver app (tabs, menu, invoice screen, PDF
 * template, tour — see docs/specs/2026-10-14-easy-mode-design.md), so store
 * owners don't get a switch that would do nothing. Turning it on or off reloads
 * the app so every screen reads the new mode.
 */
import { Section, Toggle } from '../ui/SettingsUI';
import { STORAGE_KEYS } from '../../utils/constants';
import { lsSet } from '../../utils/storage';
import { isEasyMode } from '../../utils/easyMode';

export const EASY_MODE_DESCRIPTION =
  'Scan items to make invoices. Shows Route, Stores and Reports, with Products and Settings in the menu. Hides Home, Store Info, Marketplace, My Listings and Notes.';

export default function EasyModeSetting({ role, C, dark, onChange = () => window.location.reload() }) {
  if (role === 'store_owner') return null;

  function toggle(on) {
    // lsSet frees cache space on a full phone; if it still can't save, a
    // reload would come back in the old mode, so don't reload.
    if (lsSet(STORAGE_KEYS.EASY_MODE, on)) onChange(on);
  }

  return (
    <Section title="Easy Mode" C={C} defaultOpen>
      <div style={{ paddingTop: 4 }}>
        <div style={s.row}>
          <div>
            <div style={{ ...s.title, color: C.text }}>Simplified view</div>
            <div style={{ ...s.desc, color: C.textMuted }}>{EASY_MODE_DESCRIPTION}</div>
          </div>
          <Toggle on={isEasyMode()} onChange={toggle} C={C} dark={dark} />
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
