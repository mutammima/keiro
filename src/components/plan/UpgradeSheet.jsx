/**
 * UpgradeSheet — what Keiro Pro adds and what it will cost. Payments aren't
 * built yet (owner decision 2026-10-17), so it says they're coming soon; until
 * then the owner gives Pro by hand (docs/COWORK_PRICING.md, the owner's switch).
 */
import { useTheme } from '../../context/ThemeContext';
import { LIGHT, DARK, ACCENT } from '../../theme';
import { PLAN_COPY } from '../../utils/constants';
import PlanSheet, { PrimaryBtn } from './PlanSheet';

export default function UpgradeSheet({ open, title, onClose }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;
  return (
    <PlanSheet open={open} onClose={onClose} title={title || PLAN_COPY.upgradeTitle}>
      {/* role="list": with list-style: none, VoiceOver drops a <ul>'s list semantics. */}
      <ul role="list" style={s.perks}>
        {PLAN_COPY.perks.map(p => (
          <li key={p} style={{ ...s.perk, color: C.textSub }}>
            <span aria-hidden="true" style={{ color: ACCENT, fontWeight: 900 }}>✓</span>
            <span>{p}</span>
          </li>
        ))}
      </ul>
      <p style={{ ...s.price, color: C.text }}>{PLAN_COPY.priceLine}</p>
      <p style={{ ...s.soon, color: C.textMuted }}>{PLAN_COPY.comingSoon}</p>
      <PrimaryBtn onClick={onClose}>{PLAN_COPY.ok}</PrimaryBtn>
    </PlanSheet>
  );
}

const s = {
  perks: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 },
  perk: { display: 'flex', gap: 8, fontSize: 14, lineHeight: 1.4 },
  price: { margin: '4px 0 0', fontSize: 16, fontWeight: 800 },
  soon: { margin: 0, fontSize: 14, lineHeight: 1.45 },
};
