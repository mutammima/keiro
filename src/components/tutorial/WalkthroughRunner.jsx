/**
 * WalkthroughRunner — self-driving guided demos (Layer 4).
 *
 * Unlike the hands-on tutorials, these run themselves: an on-screen cursor
 * glides to each target, presses buttons, and types into fields while the
 * spotlight + narration follow along. The user just watches (and can Skip or
 * exit at any time).
 *
 * Each walkthrough is a sequence of steps. Every step is one of:
 *   intro     — centered overlay; user taps Begin to start the auto-demo
 *   modal     — centered overlay that auto-advances after a readable beat
 *   click     — cursor moves to the target and clicks it
 *   type       — cursor moves to an input and types `value` character by character
 *   pick      — cursor moves to a control and sets `value` (date pickers, selects)
 *   highlight — cursor rests on the target while the narration explains it
 *   success   — centered overlay with confetti; tapping Finish completes it
 *
 * The engine drives the REAL app UI (it navigates tabs, opens the real form,
 * types into real inputs, and presses real buttons), so the driver walkthrough
 * creates one real demo invoice and the store walkthrough creates one real demo
 * order — exactly what the hands-on version did, just automated. Marketplace
 * broadcast is suppressed while a walkthrough is active (isTutorialActive()).
 *
 * Portaled entirely to document.body (iOS safe-area / containing-block rule).
 * Step progress is persisted in localStorage (inv_wt_step_<id>) so the user can
 * exit and resume. Completion is stored as inv_wt_done_<id>.
 */

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../../context/ThemeContext';
import { useElementRect } from '../../hooks/useElementRect';
import TutorialTooltip from './TutorialTooltip';
import DimPanels from './DimPanels';
import Confetti from './Confetti';
import { STORAGE_KEYS, MS_PER_DAY, EVENTS } from '../../utils/constants';
import {
  getWalkthroughStep, setWalkthroughStep,
  clearWalkthroughStep, setWalkthroughDone, isWalkthroughDone,
} from '../../utils/tutorialProgress';
import { setTutorialActive } from '../../utils/tutorialState';
import { LIGHT, DARK } from '../../theme';
import { isGuest, canSaveGuestEntry } from '../../utils/guestMode';
import { deleteInvoice } from '../../utils/storage';
import { deleteOrder } from '../../utils/storeOwnerStorage';

// ── Guest demo cleanup ───────────────────────────────────────────────────────
// A guest already at the entry cap can still run the walkthrough: the cap is
// bypassed while it is active (isTutorialActive in the form save paths), and the
// demo record it creates is removed when the walkthrough ends, so it never
// counts against the 5-entry guest limit.
function readList(key) {
  try { const v = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(v) ? v : []; }
  catch { return []; }
}
function snapshotDemoIds(walkthroughId) {
  if (walkthroughId === 'so_request') return new Set(readList(STORAGE_KEYS.SO_ORDERS).map((o) => o.id));
  return new Set(readList(STORAGE_KEYS.LIST).map((i) => i.number ?? i.invoice_number));
}
function removeDemoRecords(walkthroughId, before) {
  if (walkthroughId === 'so_request') {
    readList(STORAGE_KEYS.SO_ORDERS).forEach((o) => { if (!before.has(o.id)) deleteOrder(o.id); });
  } else {
    readList(STORAGE_KEYS.LIST).forEach((i) => {
      const n = i.number ?? i.invoice_number;
      if (!before.has(n)) deleteInvoice(n);
    });
  }
}

// ── Layout / timing constants ───────────────────────────────────────────────
const Z   = 9200;
const DIM = 'rgba(0,0,0,0.68)';

const MOVE_MS    = 780;   // cursor glide duration (must match the CSS transition)
const PRESS_MS   = 230;   // press-down hold before the click registers
const PER_CHAR   = 85;    // delay between typed characters
const POST_TYPE  = 560;   // pause after a field is filled, before the Next gate
const POST_CLICK = 660;   // pause after a click with no explicit settle signal

// ── Demo data (kept obviously sample-like) ──────────────────────────────────
const futureDate = (days) => {
  const d = new Date(Date.now() + days * MS_PER_DAY);
  return d.toISOString().slice(0, 10);
};

// ── Step definitions ─────────────────────────────────────────────────────────

const DRIVER_INVOICE_STEPS = [
  {
    kind: 'intro',
    title: 'Create an invoice, automatically',
    body: 'Sit back and watch. This demo fills in a sample invoice for you, step by step, then marks it paid. It uses your real account, so a sample invoice will be saved that you can delete afterward.',
    cta: 'Play demo',
  },
  {
    kind: 'click',
    selector: '[data-qs-tab="route"]',
    title: 'This is where you work',
    body: 'Your invoices live in the Route tab. Opening it now.',
    settleSelector: '[data-qs="new-invoice"]',
  },
  {
    kind: 'click',
    selector: '[data-qs="new-invoice"]',
    title: 'Start a new invoice',
    body: 'Tapping + New opens the invoice form.',
    settleSelector: '[data-tutorial="invoice-store-name"] input',
  },
  {
    kind: 'type',
    selector: '[data-tutorial="invoice-store-name"] input',
    value: 'Corner Market',
    title: 'Enter the store name',
    body: 'This is the store you are delivering to. Stores you have visited before autofill as you type.',
  },
  {
    kind: 'type',
    selector: '[data-tutorial="invoice-store-name"] input[placeholder="John Smith"]',
    value: 'Mike Johnson',
    title: 'Add the customer name',
    body: 'The person receiving the delivery.',
  },
  {
    kind: 'type',
    selector: '[data-tip="product-name"] input',
    value: 'Monster Energy 24pk',
    title: 'Name a product',
    body: 'Your catalog suggests past products as you type. You can also tap the camera icon to scan a barcode.',
  },
  {
    kind: 'type',
    selector: 'input[placeholder="1"][type="number"]',
    value: '5',
    title: 'Set the quantity',
    body: 'How many units you are delivering.',
  },
  {
    kind: 'type',
    selector: 'input[placeholder="0.00"][type="number"]',
    value: '38.50',
    title: 'Set the price',
    body: 'Price per unit. The line total updates automatically.',
  },
  {
    kind: 'click',
    selector: '[data-tutorial="invoice-add-item-btn"]',
    title: 'Add the item',
    body: 'Add Item drops this product onto the invoice. You can add as many items as you need.',
  },
  {
    kind: 'click',
    selector: '[data-tutorial="invoice-generate"]',
    title: 'Generate the invoice',
    body: 'Generate saves the invoice to your account.',
    settleEvent: EVENTS.ONBOARDING_INVOICE_CREATED,
  },
  {
    kind: 'modal',
    title: 'Invoice created!',
    body: 'It is saved. Next, we head back to your history to mark it paid.',
    cta: 'Continue',
    confetti: true,
  },
  {
    kind: 'click',
    selector: '[data-tutorial="invoice-view-back"]',
    title: 'Back to your route',
    body: 'Returning to your invoice history.',
    settleSelector: '[data-tutorial="invoice-expand-latest"]',
  },
  {
    kind: 'click',
    selector: '[data-tutorial="invoice-expand-latest"]',
    title: 'Open your invoice',
    body: 'Your new invoice sits at the top. Tapping the card reveals its options.',
    settleMs: 520,
  },
  {
    kind: 'click',
    selector: '[data-tutorial="status-badge-latest"]',
    title: 'Mark it paid',
    body: 'Tapping the status badge cycles the payment status. One tap marks this invoice Paid.',
    settleEvent: EVENTS.ONBOARDING_INVOICE_PAID,
  },
  {
    kind: 'highlight',
    selector: '[data-tutorial="invoice-expand-latest"]',
    title: 'Share and follow up',
    body: 'From the ••• menu on any invoice you can share a PDF, duplicate it, or send a WhatsApp payment reminder when it is overdue.',
    holdMs: 2600,
  },
  {
    kind: 'success',
    title: 'That is your route.',
    body: 'You just saw a full invoice created, saved, and marked paid. These are the actions you will use every day on Keiro.',
    cta: 'Finish',
  },
];

const SO_REQUEST_STEPS = [
  {
    kind: 'intro',
    title: 'Place a delivery request, automatically',
    body: 'Sit back and watch. This demo fills in a sample delivery request for you, sends it, and shows you how to track it. It uses your real account, so a sample order will be saved that you can cancel afterward.',
    cta: 'Play demo',
  },
  {
    kind: 'click',
    selector: '[data-qs-tab="so-orders"]',
    title: 'This is where you order',
    body: 'Your delivery requests live in the Orders tab. Opening it now.',
    settleSelector: '[data-qs="new-request"]',
  },
  {
    kind: 'click',
    selector: '[data-qs="new-request"]',
    title: 'Start a new request',
    body: 'Tapping + New opens the delivery request form.',
    settleSelector: '[data-tutorial="so-request-product"]',
  },
  {
    kind: 'type',
    selector: '[data-tutorial="so-request-product"]',
    value: 'Monster Energy 24pk',
    title: 'What do you need?',
    body: 'The product you want delivered.',
  },
  {
    kind: 'type',
    selector: '[data-tutorial="so-request-qty"]',
    value: '10',
    title: 'How many units?',
    body: 'The quantity you need.',
  },
  {
    kind: 'pick',
    selector: '[data-tutorial="so-request-date"]',
    value: () => futureDate(3),
    title: 'When do you need it?',
    body: 'Pick a requested delivery date.',
  },
  {
    kind: 'modal',
    title: 'Notes are optional',
    body: 'The Notes field is where you would add instructions like "leave at the back entrance" or "call on arrival". We will skip it for this demo.',
    cta: 'Continue',
  },
  {
    kind: 'click',
    selector: '[data-tutorial="so-request-submit"]',
    title: 'Send the request',
    body: 'Send Request places your order. A connected driver sees it in their app within seconds.',
    settleSelector: '[data-tutorial="so-order-card"]',
    settleMs: 1200,
  },
  {
    kind: 'modal',
    title: 'Request sent!',
    body: 'Your driver accepts it and generates an invoice when they deliver. Next, how to track it.',
    cta: 'Continue',
    confetti: true,
  },
  {
    kind: 'click',
    selector: '[data-tutorial="so-order-card"]',
    title: 'Find your request',
    body: 'Your order appears here as Pending. Tapping it shows the details and your options.',
    settleMs: 520,
  },
  {
    kind: 'modal',
    title: 'Understanding order statuses',
    body: 'Pending — your driver has not accepted yet.\n\nAccepted — your driver is on the way.\n\nDelivered — it arrived and an invoice was generated.',
    cta: 'Got it',
  },
  {
    kind: 'highlight',
    selector: '[data-tutorial="so-order-card"]',
    title: 'Cancelling a pending order',
    body: 'While an order is still Pending, expand the card and tap Cancel Order if your plans change.',
    holdMs: 2600,
  },
  {
    kind: 'click',
    selector: '[data-qs-tab="so-invoices"]',
    title: 'Where your invoices land',
    body: 'When a driver delivers and generates an invoice, it shows up in the Invoices tab automatically. Opening it now.',
    settleMs: 900,
  },
  {
    kind: 'success',
    title: 'You are ready to order.',
    body: 'You just saw a delivery request placed and tracked, and you know where your invoices appear when deliveries arrive.',
    cta: 'Finish',
  },
];

// Steps the demo auto-advances through without a Next tap. The navigation into
// the form and the whole fill-and-create sequence flow as one grouped section,
// so the user is not tapping Next for every field — only to start, to dismiss
// the result modals, and through the post-create "how to manage it" steps.
[1, 2, 3, 4, 5, 6, 7, 8, 9, 11].forEach((i) => { if (DRIVER_INVOICE_STEPS[i]) DRIVER_INVOICE_STEPS[i].flow = true; });
[1, 2, 3, 4, 5, 7].forEach((i) => { if (SO_REQUEST_STEPS[i]) SO_REQUEST_STEPS[i].flow = true; });

const WALKTHROUGHS = {
  driver_invoice: DRIVER_INVOICE_STEPS,
  so_request:     SO_REQUEST_STEPS,
};

// ── DOM helpers ──────────────────────────────────────────────────────────────
function firstVisible(selector) {
  const els = document.querySelectorAll(selector);
  for (const el of els) {
    if (el.offsetParent !== null || el.getClientRects().length > 0) return el;
  }
  return els[0] || null;
}

function waitForEl(selector, isCancelled, timeout = 4500) {
  return new Promise((resolve) => {
    const start = Date.now();
    (function poll() {
      if (isCancelled()) return resolve(null);
      const el = firstVisible(selector);
      if (el) return resolve(el);
      if (Date.now() - start > timeout) return resolve(null);
      requestAnimationFrame(poll);
    })();
  });
}

function waitForEvent(name, isCancelled, timeout = 6000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (done) return; done = true; cleanup(); resolve(v); };
    const onEv = () => finish(true);
    const to = setTimeout(() => finish(false), timeout);
    const iv = setInterval(() => { if (isCancelled()) finish(false); }, 120);
    function cleanup() { window.removeEventListener(name, onEv); clearTimeout(to); clearInterval(iv); }
    window.addEventListener(name, onEv);
  });
}

// Set a React-controlled input/textarea value so React's onChange fires.
function setNativeValue(el, value, alsoChange = false) {
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  if (alsoChange) el.dispatchEvent(new Event('change', { bubbles: true }));
}

function scrollIntoViewIfNeeded(el) {
  const r = el.getBoundingClientRect();
  const vh = window.innerHeight;
  if (r.top < 90 || r.bottom > vh - 130) {
    try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    catch { el.scrollIntoView(); }
  }
}

// ── The on-screen demo cursor ────────────────────────────────────────────────
function DemoCursor({ x, y, down, pressKey, hidden, label, accent }) {
  return createPortal(
    <div
      aria-hidden
      style={{
        position: 'fixed', left: 0, top: 0, zIndex: Z + 6,
        transform: `translate(${x}px, ${y}px)`,
        transition: `transform ${MOVE_MS}ms cubic-bezier(0.5, 0.05, 0.25, 1), opacity 0.25s ease`,
        opacity: hidden ? 0 : 1,
        pointerEvents: 'none', willChange: 'transform',
      }}
    >
      {/* Click ripple — remounts on each press to replay the animation */}
      {pressKey > 0 && (
        <span
          key={pressKey}
          style={{
            position: 'absolute', left: 1, top: 1, width: 54, height: 54,
            marginLeft: -27, marginTop: -27, borderRadius: '50%',
            background: accent, animation: 'tut-ripple 0.5s ease-out forwards',
          }}
        />
      )}
      {/* Pointer arrow */}
      <svg
        width="30" height="30" viewBox="0 0 28 28"
        style={{
          display: 'block',
          transform: down ? 'scale(0.8)' : 'scale(1)',
          transformOrigin: '5px 3px',
          transition: 'transform 0.12s ease',
          filter: 'drop-shadow(0 2px 5px rgba(0,0,0,0.5))',
          animation: 'tut-cursor-in 0.25s ease both',
        }}
      >
        <path
          d="M5 3 L5 22 L10 17 L13.6 24.4 L16.7 22.9 L13.1 15.6 L20 15.6 Z"
          fill="#ffffff" stroke="#111111" strokeWidth="1.4" strokeLinejoin="round"
        />
      </svg>
      {/* Typing caption — shows the keystrokes as they land */}
      {label != null && (
        <span
          style={{
            position: 'absolute', left: 24, top: 26, whiteSpace: 'nowrap',
            background: '#111114', color: '#fff', fontSize: 13, fontWeight: 600,
            padding: '5px 10px', borderRadius: 9, boxShadow: '0 6px 18px rgba(0,0,0,0.4)',
            border: '1px solid rgba(255,255,255,0.12)',
          }}
        >
          {label}
          <span style={{ display: 'inline-block', width: 1.5, height: 14, marginLeft: 2, background: accent, verticalAlign: 'text-bottom', animation: 'tut-blink 1s step-end infinite' }} />
        </span>
      )}
    </div>,
    document.body
  );
}

// ── Boot splash — a brief branded loader while the demo gets ready ───────────
function WalkthroughBoot({ dark, accent }) {
  const C = dark ? DARK : LIGHT;
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: Z + 20, background: C.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, animation: 'tut-fadein 0.2s ease both' }}>
      <div style={{ width: 46, height: 46, borderRadius: '50%', border: `3px solid ${dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.1)'}`, borderTopColor: accent, animation: 'tut-spin 0.8s linear infinite' }} />
      <div style={{ color: C.text, fontSize: 17, fontWeight: 800, letterSpacing: '-0.01em' }}>Setting up your walkthrough</div>
      <div style={{ color: C.textMuted, fontSize: 13 }}>One moment…</div>
    </div>,
    document.body
  );
}

// ── Spotlight stage (panels + glow + narration; no advance listeners) ───────
function SpotlightStage({ step, stepNumber, total, onExit, onSkipStep, awaitingNext, onNext, stalled, dark, accent }) {
  const { rect } = useElementRect(step.selector, { active: !!step.selector });

  const vw = typeof window !== 'undefined' ? window.innerWidth : 375;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 812;

  const header = (
    <div style={{ fontSize: 15, fontWeight: 800, color: dark ? '#fff' : '#111', marginBottom: 6, lineHeight: 1.25 }}>
      {step.title}
    </div>
  );

  // Once the cursor has finished its action, the step waits on a Next tap.
  const footer = awaitingNext ? (
    <button
      onClick={onNext}
      style={{ marginTop: 12, width: '100%', height: 44, borderRadius: 12, border: 'none', background: accent, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent', boxShadow: `0 4px 14px ${accent}55` }}
    >
      {step.nextLabel || 'Next'}
    </button>
  ) : null;

  return createPortal(
    <>
      {/* Dim panels around the target (non-blocking — the engine drives the UI) */}
      <DimPanels rect={rect} vw={vw} vh={vh} dim={DIM} accent={accent} z={Z} />

      {/* While waiting on Next, swallow taps so the user can't poke the real
          UI behind the spotlight. Sits below the tooltip + Skip bar so both
          stay clickable. */}
      {awaitingNext && (
        <div onClick={(e) => e.stopPropagation()} style={{ position: 'fixed', inset: 0, zIndex: Z + 1, background: 'transparent' }} />
      )}

      {/* Exit / step counter bar — anchored to the bottom */}
      <div style={{ position: 'fixed', bottom: 'max(12px, env(safe-area-inset-bottom))', left: 0, right: 0, zIndex: Z + 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', pointerEvents: 'none' }}>
        <button onClick={onExit} style={{ pointerEvents: 'auto', background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', borderRadius: 20, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', WebkitTapHighlightColor: 'transparent', backdropFilter: 'blur(6px)' }}>
          Skip
        </button>
        <span style={{ background: 'rgba(0,0,0,0.5)', color: '#fff', borderRadius: 20, padding: '7px 14px', fontSize: 13, fontWeight: 700, backdropFilter: 'blur(6px)' }}>
          Step {stepNumber} of {total}
        </span>
      </div>

      {/* Stalled nudge — the target never appeared; sits above the bottom bar */}
      {stalled && (
        <div style={{ position: 'fixed', bottom: 'calc(max(12px, env(safe-area-inset-bottom)) + 56px)', left: '50%', transform: 'translateX(-50%)', zIndex: Z + 3, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <div style={{ background: 'rgba(0,0,0,0.8)', color: '#fff', borderRadius: 14, padding: '10px 18px', fontSize: 13, textAlign: 'center', backdropFilter: 'blur(6px)' }}>
            Could not find the next step on screen.
          </div>
          <button onClick={onSkipStep} style={{ background: accent, color: '#fff', border: 'none', borderRadius: 20, padding: '9px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
            Skip this step
          </button>
        </div>
      )}

      <TutorialTooltip rect={rect} dark={dark} accent={accent} header={header} footer={footer} z={Z + 2}>
        {step.body}
      </TutorialTooltip>
    </>,
    document.body
  );
}

// ── Centered modal (intro / between steps / success) ────────────────────────
function WalkthroughModal({ step, stepNumber, total, onContinue, onExit, canExit, dark, accent }) {
  const bg   = dark ? '#1d1d22' : '#ffffff';
  const text = dark ? '#fff' : '#111';
  const sub  = dark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.55)';

  const isSuccess = step.kind === 'success';

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: Z, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      {(isSuccess || step.confetti) && <Confetti />}

      {!isSuccess && (
        <div style={{ position: 'absolute', bottom: 'max(12px, env(safe-area-inset-bottom))', left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', pointerEvents: 'none' }}>
          {canExit ? (
            <button onClick={onExit} style={{ pointerEvents: 'auto', background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', borderRadius: 20, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', WebkitTapHighlightColor: 'transparent', backdropFilter: 'blur(6px)' }}>Skip</button>
          ) : <span />}
          <span style={{ background: 'rgba(0,0,0,0.5)', color: '#fff', borderRadius: 20, padding: '7px 14px', fontSize: 13, fontWeight: 700, backdropFilter: 'blur(6px)' }}>
            Step {stepNumber} of {total}
          </span>
        </div>
      )}

      <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 320, textAlign: 'center', background: bg, borderRadius: 24, padding: '30px 24px 22px', boxShadow: '0 24px 64px rgba(0,0,0,0.6)', border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'}`, animation: 'tut-pop 0.4s cubic-bezier(0.34,1.56,0.64,1) both', overflow: 'hidden' }}>
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
          {hasSaved ? 'Your progress is saved. You can resume from where you left off.' : 'You can start again any time from Settings or the ? button.'}
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
            Resume
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

// ── Main runner ──────────────────────────────────────────────────────────────
export default function WalkthroughRunner({ walkthroughId, onClose }) {
  const { dark, accent } = useTheme();
  const steps = WALKTHROUGHS[walkthroughId] || [];
  const total = steps.length;

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
  const [stalled, setStalled] = useState(false);
  // After an action step finishes its cursor work it waits here for the user
  // to tap Next, so they control the pace and can read each step.
  const [awaitingNext, setAwaitingNext] = useState(false);

  // Cursor state (driven by the engine, rendered persistently so it glides)
  const vw = typeof window !== 'undefined' ? window.innerWidth : 375;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 812;
  const [cx, setCx] = useState(vw / 2);
  const [cy, setCy] = useState(vh * 0.82);
  const [cdown, setCdown] = useState(false);
  const [chidden, setChidden] = useState(true);
  const [clabel, setClabel] = useState(null);
  const [pressKey, setPressKey] = useState(0);

  // A guest already at the entry cap: the demo record is created (cap bypassed
  // while the walkthrough is active) and removed again when it ends.
  const [cappedGuest] = useState(() => isGuest() && !canSaveGuestEntry());
  // A brief branded splash while we route to home and the demo gets ready.
  const [booting, setBooting] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setBooting(false), 1100);
    return () => clearTimeout(t);
  }, []);

  // Suppress TipManager + marketplace broadcast while running. For a capped
  // guest, snapshot existing records so the demo one can be removed on exit.
  useEffect(() => {
    setTutorialActive(true);
    const before = cappedGuest ? snapshotDemoIds(walkthroughId) : null;
    return () => {
      setTutorialActive(false);
      if (before) removeDemoRecords(walkthroughId, before);
    };
  }, []); // eslint-disable-line

  const advance = useCallback(() => {
    setStepIndex((i) => {
      const next = i + 1;
      if (next >= total) return i;
      setWalkthroughStep(walkthroughId, next);
      return next;
    });
  }, [total, walkthroughId]);

  const isPaused = showResume || showExitSheet;

  // ── The auto-driver engine ──────────────────────────────────────────────
  useEffect(() => {
    if (isPaused || booting) return;
    const step = steps[stepIndex];
    if (!step) return;
    setWalkthroughStep(walkthroughId, stepIndex);
    setStalled(false);
    setAwaitingNext(false);

    let cancelled = false;
    const timers = [];
    const isCancelled = () => cancelled;
    const wait = (ms) => new Promise((res) => { const t = setTimeout(res, ms); timers.push(t); });
    const moveCursor = (rect) => { setCx(rect.left + rect.width / 2); setCy(rect.top + rect.height / 2); };
    const press = () => { setCdown(true); setPressKey((k) => k + 1); };
    const release = () => setCdown(false);

    // Modal-style steps (user-gated or auto-advancing)
    if (step.kind === 'intro' || step.kind === 'success') {
      setChidden(true); setClabel(null);
      return () => { cancelled = true; timers.forEach(clearTimeout); };
    }
    if (step.kind === 'modal') {
      // Modals wait for the user to tap Continue — no auto-advance.
      setChidden(true); setClabel(null);
      return () => { cancelled = true; timers.forEach(clearTimeout); };
    }

    // Action steps: click / type / pick / highlight
    (async () => {
      setClabel(null);
      const el = await waitForEl(step.selector, isCancelled, step.timeout || 4500);
      if (cancelled) return;
      if (!el) { setStalled(true); return; }

      scrollIntoViewIfNeeded(el);
      await wait(360);
      if (cancelled) return;

      moveCursor(el.getBoundingClientRect());
      setChidden(false);
      await wait(MOVE_MS + 140);
      if (cancelled) return;
      moveCursor(el.getBoundingClientRect());

      if (step.kind === 'type') {
        try { el.focus({ preventScroll: true }); } catch { /* ignore */ }
        const text = typeof step.value === 'function' ? step.value() : String(step.value ?? '');
        for (let i = 1; i <= text.length; i++) {
          if (cancelled) return;
          setNativeValue(el, text.slice(0, i));
          setClabel(text.slice(0, i));
          await wait(PER_CHAR);
        }
        await wait(POST_TYPE);
        if (cancelled) return;
        setClabel(null);
      } else if (step.kind === 'pick') {
        press();
        await wait(PRESS_MS);
        if (cancelled) return;
        const val = typeof step.value === 'function' ? step.value() : String(step.value ?? '');
        setNativeValue(el, val, true);
        release();
        await wait(POST_TYPE);
      } else if (step.kind === 'click') {
        press();
        await wait(PRESS_MS);
        if (cancelled) return;
        try { el.click(); } catch { /* ignore */ }
        release();
        if (step.settleEvent) {
          await waitForEvent(step.settleEvent, isCancelled, step.settleTimeout || 6000);
          if (!cancelled && step.settleSelector) await waitForEl(step.settleSelector, isCancelled, 4000);
        } else if (step.settleSelector) {
          await waitForEl(step.settleSelector, isCancelled, step.settleTimeout || 5000);
          if (!cancelled) await wait(step.settleMs || 260);
        } else {
          await wait(step.settleMs || POST_CLICK);
        }
      } else if (step.kind === 'highlight') {
        await wait(420);
      }

      // Grouped form-fill/navigation steps flow on their own; standalone
      // teaching steps wait for a Next tap so the user can read them.
      if (!cancelled) { if (step.flow) advance(); else setAwaitingNext(true); }
    })();

    return () => { cancelled = true; timers.forEach(clearTimeout); };
  }, [stepIndex, isPaused, booting, steps, walkthroughId, advance]);

  function handleContinue() {
    const step = steps[stepIndex];
    if (step.kind === 'success') {
      setWalkthroughDone(walkthroughId);
      clearWalkthroughStep(walkthroughId);
      onClose();
      return;
    }
    advance();
  }

  function handleNext() {
    setAwaitingNext(false);
    advance();
  }

  // ── Boot splash, then overlays that pause the engine ────────────────────
  if (booting) return <WalkthroughBoot dark={dark} accent={accent} />;

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

  const isModal = step.kind === 'intro' || step.kind === 'modal' || step.kind === 'success';
  const shownStep = stepIndex + 1;

  // A capped guest's intro promises the demo will run without saving anything.
  const displayStep = (cappedGuest && step.kind === 'intro')
    ? { ...step, body: 'You have reached the 5-entry guest limit, so this demo runs without saving anything — nothing here counts against your limit. Create a free account to keep what you make. Tap Play demo to watch how it works.' }
    : step;

  return (
    <>
      {/* Persistent cursor — only visible during action steps */}
      <DemoCursor
        x={cx} y={cy} down={cdown} pressKey={pressKey}
        hidden={chidden || isModal} label={clabel} accent={accent}
      />

      {isModal ? (
        <WalkthroughModal
          step={displayStep}
          stepNumber={shownStep}
          total={total}
          onContinue={handleContinue}
          onExit={() => setShowExitSheet(true)}
          canExit={step.kind === 'modal'}
          dark={dark}
          accent={accent}
        />
      ) : (
        <SpotlightStage
          key={`${walkthroughId}-${stepIndex}`}
          step={step}
          stepNumber={shownStep}
          total={total}
          onExit={() => setShowExitSheet(true)}
          onSkipStep={advance}
          awaitingNext={awaitingNext}
          onNext={handleNext}
          stalled={stalled}
          dark={dark}
          accent={accent}
        />
      )}
    </>
  );
}
