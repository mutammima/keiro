/**
 * QuickStart — the app's entire first-run tutorial, taught in one sitting.
 *
 * The role is chosen earlier on the RoleSelector, so this component starts
 * right after: a single sequence of Spotlight steps walking through every core
 * screen and action for the user's role, ending in a confetti success screen.
 * Skip is available on every step. There is nothing else that teaches the user
 * anything after this — no separate tips, checklist, or demo — so replaying it
 * (from the drawer's "How it Works" or Settings) shows the exact same tour.
 *
 * Each step is either:
 *   tap:  true  — the user taps the real highlighted element to advance (it's
 *                 natural navigation, e.g. a nav tab or a create button).
 *   tap:  false — a "Next" button in the tooltip advances instead, for steps
 *                 that narrate something already on screen without requiring a
 *                 real interaction (mid-form fields, a screen with no data yet).
 * navTo, when present, fires on that step's advance (tap or Next) to navigate
 * before the NEXT step's target needs to be on screen.
 *
 * onComplete / onSkip are wired by App: on first run they persist the
 * done-flag, light the Home pulse (driver), and land the user on the work tab.
 */

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../../context/ThemeContext';
import Spotlight from './Spotlight';
import Confetti from './Confetti';

const DRIVER_STEPS = [
  {
    selector: '[data-qs-tab="route"]', tap: true,
    title: 'This is where you work',
    desc: 'Your invoices, incoming orders, and new invoice creation all live in Route. Tap it to open.',
  },
  {
    selector: '[data-qs="new-invoice"]', tap: true,
    title: 'Create your first invoice',
    desc: 'Tap + New to start. You don’t have to fill it in right now — just see how it begins.',
  },
  {
    selector: '[data-tip="product-name"]', tap: false,
    title: 'Add items fast',
    desc: 'Start typing a product name and it autofills from your past products — or tap the camera icon to scan a barcode instead of typing.',
  },
  {
    selector: '[data-tutorial="invoice-generate"]', tap: false, navTo: 'route',
    title: 'Share it however works',
    desc: 'Once you’re done, generate the invoice — you can share it over WhatsApp or download a PDF right away.',
  },
  {
    selector: '[data-tip="route-history"]', tap: false,
    title: 'All your invoices, in one place',
    desc: 'Every invoice you generate appears here, newest first. Tap any card to change its payment status, share it again, or send a payment reminder.',
  },
  {
    selector: '[data-qs-tab="stores"]', tap: true,
    title: 'Your connected stores',
    desc: 'Invite a store to link accounts so their orders reach you directly — tap any store to see its full balance.',
  },
  {
    selector: '[data-qs-tab="reports"]', tap: true,
    title: 'Track your revenue',
    desc: 'Home shows your revenue by day; Reports breaks it down by Today, Week, Month, or Year. After your route, check End of Day for your total cash and card collected.',
  },
];

const OWNER_STEPS = [
  {
    selector: '[data-qs-tab="so-orders"]', tap: true,
    title: 'This is where you order',
    desc: 'Request products from your drivers and track every delivery from the Orders tab. Tap it to open.',
  },
  {
    selector: '[data-qs="new-request"]', tap: true,
    title: 'Request your first delivery',
    desc: 'Tap + New to start. You don’t have to finish the form right now — just see how it works.',
  },
  {
    selector: '[data-qs="assign-driver"]', tap: false, navTo: 'so-orders',
    title: 'Choose who delivers it',
    desc: 'Assign a connected driver, or leave it open for any driver to pick up.',
  },
  {
    selector: '[data-tip="so-orders-list"]', tap: false,
    title: 'Track every order',
    desc: 'Watch each order move from pending to accepted to delivered, right here.',
  },
  {
    selector: '[data-qs-tab="so-invoices"]', tap: true,
    title: 'Invoices from your drivers',
    desc: 'Every invoice your connected drivers generate for you appears here automatically, along with its payment status.',
  },
  {
    selector: '[data-qs-tab="so-drivers"]', tap: true,
    title: 'Your connected drivers',
    desc: 'Tap Invite to share a link with a driver — once they sign in, you’re connected and their orders reach them directly.',
  },
  {
    selector: '[data-qs-tab="so-home"]', tap: true,
    title: 'Check your dashboard',
    desc: 'Home tracks your outstanding balance and recent orders — and flags products due for a reorder based on your history, so you can tap Reorder and send it straight to your driver.',
  },
];

const SUCCESS_TEXT = {
  driver: 'You’re ready. Add your business name in Settings so it prints on every invoice, and back up your data there anytime.',
  store_owner: 'You’re ready. Check Reports for your delivery history, and back up your data anytime from Settings.',
};

export default function QuickStart({ role, onNav, onComplete, onSkip }) {
  const { dark, accent } = useTheme();
  const isOwner = role === 'store_owner';
  const steps = isOwner ? OWNER_STEPS : DRIVER_STEPS;
  const [stepIndex, setStepIndex] = useState(0); // 0..steps.length-1 = spotlight steps, steps.length = success

  function advance(step) {
    if (step?.navTo) onNav?.(step.navTo);
    setStepIndex(i => i + 1);
  }

  if (stepIndex < steps.length) {
    const step = steps[stepIndex];
    return (
      <Spotlight
        targetSelector={step.selector}
        onTargetTap={step.tap ? () => advance(step) : undefined}
        onNext={!step.tap ? () => advance(step) : undefined}
        title={step.title}
        desc={step.desc}
        stepNumber={stepIndex + 1} total={steps.length}
        canSkip onSkip={onSkip}
        dark={dark} accent={accent}
      />
    );
  }

  // Final step — success
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
          {SUCCESS_TEXT[isOwner ? 'store_owner' : 'driver']}
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
