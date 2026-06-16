/**
 * WalkthroughRunner — hands-on guided walkthroughs (Layer 4).
 *
 * Each walkthrough is a sequence of steps. Every step is one of:
 *   modal   — centered overlay with a button the user taps to proceed
 *   tap     — Spotlight that advances on capture-phase click of the target
 *   input   — Spotlight that advances when the target input has a non-empty value
 *   change  — Spotlight that advances on any 'change' event from the target
 *   event   — Spotlight that advances when a named window CustomEvent fires
 *   success — centered overlay with confetti; tapping Finish completes the walkthrough
 *
 * Portaled entirely to document.body (iOS safe-area / containing-block rule).
 * Step progress is persisted in localStorage (inv_wt_step_<id>) so the user
 * can exit and resume. Completion is stored as inv_wt_done_<id>.
 */

import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../../context/ThemeContext';
import { useElementRect } from './useElementRect';
import TutorialTooltip from './TutorialTooltip';
import Confetti from './Confetti';
import {
  getWalkthroughStep, setWalkthroughStep,
  clearWalkthroughStep, setWalkthroughDone, isWalkthroughDone,
} from '../../utils/tutorialProgress';
import { setTutorialActive } from '../../utils/tutorialState';

// ── Z-index layer ───────────────────────────────────────────────────────────
const Z = 9200; // above TipManager (9500) is intentional: walkthroughs ARE blocking
// Actually keep below FeatureTip so we don't conflict — tips are paused anyway
// when a walkthrough is active, so 9200 is fine.

const DIM = 'rgba(0,0,0,0.68)';
const PAD = 8;

// ── Step definitions ─────────────────────────────────────────────────────────

const DRIVER_INVOICE_STEPS = [
  {
    type: 'modal',
    title: 'Create, edit, and manage an invoice',
    body: 'This walkthrough guides you through creating a real invoice, exploring your options, and marking it paid. Everything you do here is real and will be saved.',
    cta: 'Begin',
  },
  {
    type: 'tap',
    selector: '[data-qs-tab="route"]',
    title: 'This is where you work',
    body: 'Your invoices live here. Tap Route to open it.',
  },
  {
    type: 'tap',
    selector: '[data-qs="new-invoice"]',
    title: 'Start a new invoice',
    body: 'Tap + New to open the invoice form.',
  },
  {
    type: 'input',
    selector: '[data-tutorial="invoice-store-name"] input',
    title: 'Enter the store name',
    body: 'Type the name of the store you are delivering to. If you have visited this store before it will autofill.',
  },
  {
    type: 'input',
    // Customer Name input is the second input inside the Customer card
    selector: '[data-tutorial="invoice-store-name"] input[placeholder="John Smith"]',
    title: 'Add the customer name',
    body: 'Add the name of the person receiving the delivery.',
  },
  {
    type: 'input',
    selector: '[data-tip="product-name"] input',
    title: 'Name a product',
    body: 'Type a product name here. Your catalog will suggest past products as you type. You can also tap the camera icon to scan a barcode.',
  },
  {
    type: 'input',
    selector: 'input[placeholder="1"][type="number"]',
    title: 'Set the quantity',
    body: 'How many units are you delivering?',
  },
  {
    type: 'input',
    selector: 'input[placeholder="0.00"][type="number"]',
    title: 'Set the price',
    body: 'Price per unit. The total updates automatically.',
    skipLabel: 'Skip this step',
  },
  {
    type: 'tap',
    selector: '[data-tutorial="invoice-generate"]',
    title: 'Generate the invoice',
    body: 'When you are ready, tap Generate to save the invoice. This is real — it will be saved to your account.',
  },
  {
    type: 'event',
    event: 'inv-onboarding-invoice-created',
    selector: null,
    title: 'Saving your invoice…',
    body: 'Tap Generate Invoice to continue.',
    // This step resolves as soon as the invoice-created event fires.
    // The selector is null so the spotlight shows full-screen dim while waiting.
  },
  {
    type: 'modal',
    title: 'Invoice created!',
    body: 'Your invoice was saved. Now navigate back to the Route tab to see it in your history and try the action buttons.',
    cta: 'Continue',
    confetti: true,
  },
  {
    type: 'tap',
    selector: '[data-tutorial="invoice-expand-latest"]',
    title: 'Expand your invoice',
    body: 'Your new invoice is at the top of the list. Tap the card to expand it and reveal your options.',
  },
  {
    type: 'event',
    event: 'inv-onboarding-invoice-paid',
    selector: '[data-tutorial="status-badge-latest"]',
    title: 'Mark it paid',
    body: 'Tap the status badge to cycle through payment statuses. Keep tapping until it shows Paid.',
  },
  {
    type: 'skippable-tap',
    selector: '[data-tip="overdue"] , [data-tutorial="status-badge-latest"]',
    title: 'Send a WhatsApp reminder',
    body: 'Tap Remind (on overdue invoices) or the ••• menu to share this invoice or send a pre-filled payment reminder via WhatsApp.',
    skipLabel: 'Skip this step',
  },
  {
    type: 'success',
    title: 'You know how to run your route.',
    body: 'You created a real invoice, explored your options, marked it paid, and learned how to follow up with a store. These are the actions you will use every day on Keiro.',
    cta: 'Finish',
  },
];

const SO_REQUEST_STEPS = [
  {
    type: 'modal',
    title: 'Place your first delivery request',
    body: 'This walkthrough guides you through requesting a delivery from a driver, tracking its status, and finding your invoices when deliveries arrive. Everything you do here is real and will be saved.',
    cta: 'Begin',
  },
  {
    type: 'tap',
    selector: '[data-qs-tab="so-orders"]',
    title: 'This is where you order',
    body: 'Your delivery requests live here. Tap Orders to open it.',
  },
  {
    type: 'tap',
    selector: '[data-qs="new-request"]',
    title: 'Start a new request',
    body: 'Tap + New to open the delivery request form.',
  },
  {
    type: 'input',
    selector: '[data-tutorial="so-request-product"]',
    title: 'What do you need?',
    body: 'Type the product you need delivered. For example: Monster Energy 24 pack.',
  },
  {
    type: 'input',
    selector: '[data-tutorial="so-request-qty"]',
    title: 'How many units?',
    body: 'Enter the quantity you need.',
  },
  {
    type: 'change',
    selector: '[data-tutorial="so-request-date"]',
    title: 'When do you need it?',
    body: 'Tap to pick a delivery date.',
  },
  {
    type: 'modal',
    title: 'Notes are optional',
    body: 'You can add special instructions for your driver in the Notes field — like "leave at back entrance" or "call on arrival". Tap Continue to skip to sending.',
    cta: 'Continue',
    skipLabel: null,
  },
  {
    type: 'tap',
    selector: '[data-tutorial="so-request-submit"]',
    title: 'Send the request',
    body: 'Tap Send Request to place your order. Your driver will see it in their app within seconds.',
  },
  {
    type: 'modal',
    title: 'Request sent!',
    body: 'Your driver will accept it and generate an invoice when they deliver. Tap Continue to see how to track your order.',
    cta: 'Continue',
    confetti: true,
  },
  {
    type: 'tap',
    selector: '[data-tutorial="so-order-card"]',
    title: 'Find your request',
    body: 'Your order appears here with a Pending status. Tap it to see the details and your options.',
  },
  {
    type: 'modal',
    title: 'Understanding order statuses',
    body: 'Pending — your driver has not accepted yet.\n\nAccepted — your driver is on their way.\n\nDelivered — your order arrived and an invoice was generated.',
    cta: 'Got it',
  },
  {
    type: 'skippable-tap',
    selector: '[data-tutorial="so-order-card"]',
    title: 'Cancelling a pending order',
    body: 'While an order is still Pending, expand the card and tap Cancel Order if you need to cancel it. You do not have to cancel this one.',
    skipLabel: 'Skip this step',
  },
  {
    type: 'tap',
    selector: '[data-qs-tab="so-invoices"]',
    title: 'Where to find your invoices',
    body: 'When your driver delivers and generates an invoice, it will appear in the Invoices tab automatically. Tap Invoices to see it.',
  },
  {
    type: 'success',
    title: 'You are ready to manage your deliveries.',
    body: 'You placed a real delivery request, learned how to track its status, and know where your invoices appear when deliveries arrive.',
    cta: 'Finish',
  },
];

const WALKTHROUGHS = {
  driver_invoice: DRIVER_INVOICE_STEPS,
  so_request:     SO_REQUEST_STEPS,
};

// ── Dim panel (blocks taps outside the spotlight hole) ──────────────────────
function Panel({ style }) {
  const blockTouch = e => { e.preventDefault(); e.stopPropagation(); };
  return (
    <div
      onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
      onTouchStart={e => e.stopPropagation()}
      onTouchMove={blockTouch}
      style={{ position: 'fixed', background: DIM, zIndex: Z, touchAction: 'none', ...style }}
    />
  );
}

// ── Exit confirmation sheet ──────────────────────────────────────────────────
function ExitSheet({ walkthroughId, onResume, onMarkDone, onStartOver, dark }) {
  const savedStep = getWalkthroughStep(walkthroughId);
  const hasSaved  = savedStep !== null && savedStep >= 0;
  const bg        = dark ? '#1d1d22' : '#ffffff';
  const textColor = dark ? '#fff' : '#111';
  const subColor  = dark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.5)';

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: Z + 10, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '0 0 env(safe-area-inset-bottom)' }}>
      <div style={{ width: '100%', maxWidth: 480, borderRadius: '20px 20px 0 0', background: bg, padding: '20px 20px 28px', boxShadow: '0 -8px 40px rgba(0,0,0,0.4)', animation: 'tut-fadein 0.18s ease both' }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)', margin: '0 auto 18px' }} />
        <p style={{ fontSize: 17, fontWeight: 800, color: textColor, margin: '0 0 6px' }}>Exit walkthrough?</p>
        <p style={{ fontSize: 14, color: subColor, margin: '0 0 20px', lineHeight: 1.5 }}>
          {hasSaved ? 'Your progress is saved. You can resume from where you left off.' : 'You can start again any time from Settings → Help.'}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button onClick={onResume} style={{ height: 48, borderRadius: 14, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
            {hasSaved ? 'Resume walkthrough' : 'Continue walkthrough'}
          </button>
          {hasSaved && (
            <button onClick={onStartOver} style={{ height: 48, borderRadius: 14, border: `1px solid ${dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'}`, background: 'transparent', color: textColor, fontSize: 15, fontWeight: 600, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
              Start over
            </button>
          )}
          <button onClick={onMarkDone} style={{ height: 48, borderRadius: 14, border: `1px solid ${dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'}`, background: 'transparent', color: subColor, fontSize: 14, fontWeight: 500, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
            Mark as complete and exit
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Resume prompt ────────────────────────────────────────────────────────────
function ResumePrompt({ onResume, onStartOver, dark, accent }) {
  const bg   = dark ? '#1d1d22' : '#ffffff';
  const text = dark ? '#fff' : '#111';
  const sub  = dark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.5)';
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: Z, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 320, borderRadius: 24, background: bg, padding: '28px 24px 22px', boxShadow: '0 24px 64px rgba(0,0,0,0.5)', animation: 'tut-pop 0.4s cubic-bezier(0.34,1.56,0.64,1) both' }}>
        <div style={{ fontSize: 20, fontWeight: 900, color: text, marginBottom: 8 }}>Resume walkthrough?</div>
        <p style={{ fontSize: 14, color: sub, lineHeight: 1.55, margin: '0 0 22px' }}>
          You have progress saved. Pick up where you left off, or start from the beginning.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button onClick={onResume} style={{ height: 48, borderRadius: 14, border: 'none', background: accent, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent', boxShadow: `0 6px 20px ${accent}55` }}>
            Resume from step {/* step shown by caller */}
          </button>
          <button onClick={onStartOver} style={{ height: 44, borderRadius: 14, border: `1px solid ${dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'}`, background: 'transparent', color: text, fontSize: 14, fontWeight: 600, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
            Start over
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Modal overlay (intro / between-steps / success) ─────────────────────────
function WalkthroughModal({ step, stepNumber, total, onContinue, onSkip, canSkip, dark, accent, walkthroughId }) {
  const bg   = dark ? '#1d1d22' : '#ffffff';
  const text = dark ? '#fff' : '#111';
  const sub  = dark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.55)';

  const isSuccess = step.type === 'success';

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: Z, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      {isSuccess && <Confetti />}

      {/* Skip / step counter */}
      {!isSuccess && (
        <div style={{ position: 'absolute', top: 'max(12px, env(safe-area-inset-top))', left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', pointerEvents: 'none' }}>
          {canSkip ? (
            <button onClick={onSkip} style={{ pointerEvents: 'auto', background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', borderRadius: 20, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', WebkitTapHighlightColor: 'transparent', backdropFilter: 'blur(6px)' }}>Skip</button>
          ) : <span />}
          <span style={{ background: 'rgba(0,0,0,0.5)', color: '#fff', borderRadius: 20, padding: '7px 14px', fontSize: 13, fontWeight: 700, backdropFilter: 'blur(6px)' }}>
            Step {stepNumber} of {total}
          </span>
        </div>
      )}

      <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 320, textAlign: 'center', background: bg, borderRadius: 24, padding: '30px 24px 22px', boxShadow: '0 24px 64px rgba(0,0,0,0.6)', border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'}`, animation: 'tut-pop 0.4s cubic-bezier(0.34,1.56,0.64,1) both' }}>
        {isSuccess && (
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: accent, margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 10px 28px ${accent}66` }}>
            <svg width={32} height={32} viewBox="0 0 24 24" fill="none">
              <polyline points="5,12.5 10,17.5 19,7" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )}
        <div style={{ fontSize: isSuccess ? 21 : 19, fontWeight: 900, color: text, marginBottom: 8, lineHeight: 1.2 }}>{step.title}</div>
        <div style={{ fontSize: 14, lineHeight: 1.6, color: sub, marginBottom: 22, whiteSpace: 'pre-line' }}>{step.body}</div>
        <button
          onClick={onContinue}
          style={{ width: '100%', height: 48, borderRadius: 14, border: 'none', background: accent, color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent', boxShadow: `0 6px 20px ${accent}55` }}
        >
          {step.cta || 'Continue'}
        </button>
      </div>
    </div>,
    document.body
  );
}

// ── Spotlight step ───────────────────────────────────────────────────────────
function SpotlightStep({ step, stepNumber, total, onAdvance, onSkip, dark, accent }) {
  const { rect, missing } = useElementRect(step.selector, { active: !!step.selector });
  const advancedRef = useRef(false);

  const vw = typeof window !== 'undefined' ? window.innerWidth : 375;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 812;

  // ── Advance logic by step type ──────────────────────────────────────────
  useEffect(() => {
    advancedRef.current = false;

    function advance() {
      if (advancedRef.current) return;
      advancedRef.current = true;
      onAdvance();
    }

    if (step.type === 'tap' || step.type === 'skippable-tap') {
      if (!step.selector) return;
      function onClick(e) {
        if (e.target.closest?.(step.selector)) advance();
      }
      document.addEventListener('click', onClick, true);
      return () => document.removeEventListener('click', onClick, true);
    }

    if (step.type === 'input') {
      function checkInput() {
        const el = document.querySelector(step.selector);
        if (el && el.value.trim().length > 0) advance();
      }
      document.addEventListener('input', checkInput, true);
      return () => document.removeEventListener('input', checkInput, true);
    }

    if (step.type === 'change') {
      function checkChange(e) {
        if (!step.selector || e.target.matches?.(step.selector)) {
          if (e.target.value) advance();
        }
      }
      document.addEventListener('change', checkChange, true);
      return () => document.removeEventListener('change', checkChange, true);
    }

    if (step.type === 'event') {
      function onEvent() { advance(); }
      window.addEventListener(step.event, onEvent);
      return () => window.removeEventListener(step.event, onEvent);
    }
  }, [step.selector, step.type, step.event]); // eslint-disable-line react-hooks/exhaustive-deps

  const header = (
    <div style={{ fontSize: 15, fontWeight: 800, color: dark ? '#fff' : '#111', marginBottom: 6, lineHeight: 1.25 }}>
      {step.title}
    </div>
  );

  const footer = step.skipLabel ? (
    <div style={{ marginTop: 12, textAlign: 'center' }}>
      <button onClick={onSkip} style={{ background: 'none', border: 'none', color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)', fontSize: 13, cursor: 'pointer', padding: '4px 8px', WebkitTapHighlightColor: 'transparent' }}>
        {step.skipLabel}
      </button>
    </div>
  ) : null;

  return createPortal(
    <>
      {/* Dim panels */}
      {!rect ? (
        <Panel style={{ inset: 0 }} />
      ) : (
        <>
          <Panel style={{ left: 0, top: 0, width: '100%', height: Math.max(0, rect.top - PAD) }} />
          <Panel style={{ left: 0, top: rect.bottom + PAD, width: '100%', height: Math.max(0, vh - rect.bottom - PAD) }} />
          <Panel style={{ left: 0, top: Math.max(0, rect.top - PAD), width: Math.max(0, rect.left - PAD), height: rect.height + PAD * 2 }} />
          <Panel style={{ left: rect.right + PAD, top: Math.max(0, rect.top - PAD), width: Math.max(0, vw - rect.right - PAD), height: rect.height + PAD * 2 }} />
          {/* Glow ring */}
          <div aria-hidden style={{ position: 'fixed', left: rect.left - PAD, top: rect.top - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2, border: `2px solid ${accent}`, borderRadius: 12, zIndex: Z + 1, pointerEvents: 'none', '--tut-glow': `${accent}73`, animation: 'tut-pulse 1.6s ease-in-out infinite' }} />
        </>
      )}

      {/* Skip / counter bar */}
      <div style={{ position: 'fixed', top: 'max(12px, env(safe-area-inset-top))', left: 0, right: 0, zIndex: Z + 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', pointerEvents: 'none' }}>
        <button onClick={onSkip} style={{ pointerEvents: 'auto', background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', borderRadius: 20, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', WebkitTapHighlightColor: 'transparent', backdropFilter: 'blur(6px)' }}>
          Skip
        </button>
        <span style={{ background: 'rgba(0,0,0,0.5)', color: '#fff', borderRadius: 20, padding: '7px 14px', fontSize: 13, fontWeight: 700, backdropFilter: 'blur(6px)' }}>
          Step {stepNumber} of {total}
        </span>
      </div>

      {/* Missing-element nudge */}
      {missing && (
        <div style={{ position: 'fixed', bottom: 'max(32px, env(safe-area-inset-bottom))', left: '50%', transform: 'translateX(-50%)', zIndex: Z + 3, background: 'rgba(0,0,0,0.75)', color: '#fff', borderRadius: 14, padding: '10px 18px', fontSize: 13, textAlign: 'center', pointerEvents: 'none', backdropFilter: 'blur(6px)' }}>
          Navigate to the right screen to continue
        </div>
      )}

      <TutorialTooltip rect={rect} dark={dark} accent={accent} header={header} footer={footer} z={Z + 2}>
        {step.body}
      </TutorialTooltip>
    </>,
    document.body
  );
}

// ── Main walkthrough runner ──────────────────────────────────────────────────
export default function WalkthroughRunner({ walkthroughId, onClose }) {
  const { dark, accent } = useTheme();
  const steps    = WALKTHROUGHS[walkthroughId] || [];
  const total    = steps.length;

  // Resume or start from the beginning
  const [showResume, setShowResume] = useState(() => {
    const saved = getWalkthroughStep(walkthroughId);
    return saved !== null && saved >= 0;
  });
  const [stepIndex, setStepIndex] = useState(() => {
    if (isWalkthroughDone(walkthroughId)) return 0;
    const saved = getWalkthroughStep(walkthroughId);
    return saved !== null && saved >= 0 ? saved : 0;
  });
  const [showExitSheet, setShowExitSheet] = useState(false);

  // Suppress TipManager and marketplace broadcast while running
  useEffect(() => {
    setTutorialActive(true);
    return () => setTutorialActive(false);
  }, []);

  function advance() {
    const next = stepIndex + 1;
    if (next >= total) return; // safety — shouldn't happen; success step ends via its button
    setWalkthroughStep(walkthroughId, next);
    setStepIndex(next);
  }

  function handleContinue() {
    const step = steps[stepIndex];
    if (step.type === 'success') {
      setWalkthroughDone(walkthroughId);
      onClose();
      return;
    }
    advance();
  }

  function handleSkipStep() {
    // Skip a single optional step (e.g. notes, WhatsApp)
    advance();
  }

  function handleExitRequest() {
    setShowExitSheet(true);
  }

  // The Skip button in spotlight steps triggers the exit sheet (not skip-step)
  // UNLESS the step has a skipLabel in which case it's a skip-step action.
  function handleSpotlightSkip(step) {
    if (step.skipLabel) {
      handleSkipStep();
    } else {
      handleExitRequest();
    }
  }

  if (showResume) {
    return (
      <ResumePrompt
        dark={dark}
        accent={accent}
        onResume={() => setShowResume(false)}
        onStartOver={() => { clearWalkthroughStep(walkthroughId); setStepIndex(0); setShowResume(false); }}
      />
    );
  }

  if (showExitSheet) {
    return (
      <ExitSheet
        walkthroughId={walkthroughId}
        dark={dark}
        onResume={() => setShowExitSheet(false)}
        onMarkDone={() => { setWalkthroughDone(walkthroughId); onClose(); }}
        onStartOver={() => { clearWalkthroughStep(walkthroughId); setStepIndex(0); setShowExitSheet(false); }}
      />
    );
  }

  const step = steps[stepIndex];
  if (!step) return null;

  const isModal = step.type === 'modal' || step.type === 'success';
  // Step numbers shown to the user are 1-based and exclude success step
  const shownStep  = stepIndex + 1;
  const canSkipModal = stepIndex > 0 && step.type === 'modal' && step.type !== 'success';

  if (isModal) {
    return (
      <WalkthroughModal
        step={step}
        stepNumber={shownStep}
        total={total}
        onContinue={handleContinue}
        onSkip={handleExitRequest}
        canSkip={canSkipModal}
        dark={dark}
        accent={accent}
        walkthroughId={walkthroughId}
      />
    );
  }

  return (
    <SpotlightStep
      key={`${walkthroughId}-${stepIndex}`}
      step={step}
      stepNumber={shownStep}
      total={total}
      onAdvance={advance}
      onSkip={() => handleSpotlightSkip(step)}
      dark={dark}
      accent={accent}
    />
  );
}
