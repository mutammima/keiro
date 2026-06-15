/**
 * QuickStart — Layer 1 onboarding. Gets a brand-new user to one real action
 * (opening the invoice / request form) in under a minute, then hands off to the
 * contextual tips for everything else.
 *
 * The role is chosen earlier on the RoleSelector ("Step 1"), so this flow runs
 * steps 2–4 of a 4-step journey:
 *   Step 2 — spotlight the primary work tab (Route / Orders); user taps it.
 *   Step 3 — spotlight the create button (+ New / + New Request); user taps it.
 *   Step 4 — success screen with confetti and a Done button.
 * Skip is available on every step here (all are step ≥ 2 per the spec).
 *
 * onComplete / onSkip are wired by App: on first run they persist the
 * done-flag, light the Home pulse (driver), and land the user on the work tab.
 */

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../../context/ThemeContext';
import Spotlight from './Spotlight';
import Confetti from './Confetti';

const TOTAL = 4; // RoleSelector is step 1; this component covers steps 2–4

const FLOWS = {
  driver: {
    tab:    { selector: '[data-qs-tab="route"]', title: 'This is where you work',
              desc: 'Your invoices, incoming orders, and new invoice creation all live in Route. Tap it to open.' },
    create: { selector: '[data-qs="new-invoice"]', title: 'Create your first invoice',
              desc: 'Tap + New to start. You don’t have to fill it in right now — just see how it begins.' },
    success: "You’re ready. Your invoices, orders, and payments all live in Route. Everything else you’ll discover as you go.",
  },
  store_owner: {
    tab:    { selector: '[data-qs-tab="so-orders"]', title: 'This is where you order',
              desc: 'Request products from your drivers and track every delivery from the Orders tab. Tap it to open.' },
    create: { selector: '[data-qs="new-request"]', title: 'Request your first delivery',
              desc: 'Tap + New to start. You don’t have to finish the form right now — just see how it works.' },
    success: "You’re ready. Request products, track deliveries, and manage your invoices — all from here.",
  },
};

export default function QuickStart({ role, onComplete, onSkip }) {
  const { dark, accent } = useTheme();
  const flow = FLOWS[role === 'store_owner' ? 'store_owner' : 'driver'];
  const [stepIndex, setStepIndex] = useState(0); // 0 = tab, 1 = create, 2 = success

  if (stepIndex === 0) {
    return (
      <Spotlight
        targetSelector={flow.tab.selector}
        onTargetTap={() => setStepIndex(1)}
        title={flow.tab.title}
        desc={flow.tab.desc}
        stepNumber={2} total={TOTAL}
        canSkip onSkip={onSkip}
        dark={dark} accent={accent}
      />
    );
  }

  if (stepIndex === 1) {
    return (
      <Spotlight
        targetSelector={flow.create.selector}
        onTargetTap={() => setStepIndex(2)}
        title={flow.create.title}
        desc={flow.create.desc}
        stepNumber={3} total={TOTAL}
        canSkip onSkip={onSkip}
        dark={dark} accent={accent}
      />
    );
  }

  // Step 4 — success
  return createPortal(
    <div
      data-tutorial-ui="quickstart-success"
      style={{ position: 'fixed', inset: 0, zIndex: 9000, background: dark ? 'rgba(0,0,0,0.82)' : 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
    >
      <Confetti />
      <div style={{
        position: 'relative', zIndex: 2, width: '100%', maxWidth: 320, textAlign: 'center',
        background: dark ? '#1d1d22' : '#fff', borderRadius: 24, padding: '30px 24px 22px',
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)', border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'}`,
        animation: 'tut-pop 0.4s cubic-bezier(0.34,1.56,0.64,1) both',
      }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: accent, margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 10px 28px ${accent}66` }}>
          <svg width={32} height={32} viewBox="0 0 24 24" fill="none">
            <polyline points="5,12.5 10,17.5 19,7" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div style={{ fontSize: 21, fontWeight: 900, color: dark ? '#fff' : '#111', marginBottom: 8 }}>You’re ready!</div>
        <div style={{ fontSize: 14, lineHeight: 1.6, color: dark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.55)', marginBottom: 22 }}>
          {flow.success}
        </div>
        <button
          data-tutorial-ui="quickstart-done"
          onClick={onComplete}
          style={{ width: '100%', height: 48, borderRadius: 14, border: 'none', background: accent, color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent', boxShadow: `0 6px 20px ${accent}55` }}
        >
          Done
        </button>
      </div>
    </div>,
    document.body
  );
}
