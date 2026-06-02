/**
 * OnboardingTutorial — 5-step first-time user onboarding with spotlight overlay.
 *
 * Bugs fixed vs previous version:
 *   1. Programmatic .click() calls from autoFillStep were blocked by the click
 *      blocker because synthetic events have clientX/Y=0 and isTrusted=false.
 *      Fix: block() now skips non-trusted events (only blocks real user taps).
 *   2. Page could still be scrolled during tutorial via touchmove.
 *      Fix: body overflow+touchAction locked; touchmove blocked in capture phase.
 *   3. Tooltip and spotlight panels could drift on scroll.
 *      Fix: body/html scroll position locked to 0 throughout.
 *
 * Step 1 dynamic sub-targets:
 *   tab-new → invoice-store-name → invoice-add-item → invoice-generate
 *   Pressing Next at any sub-target auto-completes it AND all remaining
 *   sub-targets in a single chained sequence.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { ACCENT } from '../../theme';

// ── Step definitions ──────────────────────────────────────────────────────────

const STEPS = [
  {
    id: 1,
    page: 'history',
    selector: '[data-tutorial="tab-new"]',
    title: 'Create your first invoice',
    instruction: 'Tap "New" to start creating your first invoice.',
    advanceEvent: 'inv-onboarding-invoice-created',
    manualAdvance: false,
    dynamic: true,
  },
  {
    id: 2,
    page: 'history',
    selector: '[data-tutorial="invoice-latest"]',
    title: 'Mark it as paid',
    instruction: 'Tap the status badge and mark this invoice as Paid.',
    advanceEvent: 'inv-onboarding-invoice-paid',
    manualAdvance: false,
  },
  {
    id: 3,
    page: 'history',
    selector: '[data-tutorial="store-name-link"]',
    title: 'See the store balance',
    instruction: 'Tap the store name to see the running balance for this store.',
    advanceEvent: 'inv-onboarding-store-viewed',
    manualAdvance: false,
  },
  {
    id: 4,
    page: 'products',
    selector: '[data-tutorial="products-list"]',
    title: 'Products auto-save',
    instruction: 'Your product was saved automatically. Next time you invoice this store, InvoGo will autofill it.',
    advanceEvent: null,
    manualAdvance: true,
  },
  {
    id: 5,
    page: 'settings',
    selector: '[data-tutorial="settings-biz-name"]',
    title: 'Set your business name',
    instruction: 'Enter your business name — it appears on every invoice.',
    advanceEvent: 'inv-onboarding-settings-saved',
    manualAdvance: false,
  },
];

const TOTAL     = STEPS.length;
const DIM_COLOR = 'transparent';
const OVERLAY_Z = 9100;
const TOOLTIP_Z = 9200;
const PAD       = 12;

// ── Dynamic selector for Step 1 ───────────────────────────────────────────────

function getStep1State() {
  const storeCard = document.querySelector('[data-tutorial="invoice-store-name"]');
  const cardRect  = storeCard?.getBoundingClientRect();
  const invoiceTabVisible = cardRect && cardRect.left > -(window.innerWidth * 0.5);

  if (!invoiceTabVisible) {
    return {
      selector: '[data-tutorial="tab-new"]',
      instruction: 'Tap "New" to start creating your first invoice.',
    };
  }

  const storeInput = storeCard.querySelector('input');
  const hasStore   = storeInput?.value?.trim().length > 0;
  if (!hasStore) {
    return {
      selector: '[data-tutorial="invoice-store-name"]',
      instruction: 'Type the store name and customer name, then scroll down.',
    };
  }

  const hasItems = !!document.querySelector('[data-tutorial="invoice-generate"]');
  if (hasItems) {
    return {
      selector: '[data-tutorial="invoice-generate"]',
      instruction: "Great! You've added an item. Now tap Generate Invoice.",
    };
  }

  return {
    selector: '[data-tutorial="invoice-add-item"]',
    instruction: 'Add a product — enter name, qty and price, then tap + Add Item.',
  };
}

// ── React-friendly input setter ───────────────────────────────────────────────

function setNativeValue(el, value) {
  if (!el) return;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

// ── Spotlight ─────────────────────────────────────────────────────────────────

function Spotlight({ rect }) {
  const stopTouch = e => e.preventDefault();

  const panelStyle = {
    position: 'fixed',
    background: DIM_COLOR,
    zIndex: OVERLAY_Z,
    pointerEvents: 'all',
    touchAction: 'none',   // prevent scroll-through on iOS
    WebkitUserSelect: 'none',
    userSelect: 'none',
  };

  if (!rect) {
    return <div style={{ ...panelStyle, inset: 0 }} onTouchMove={stopTouch} />;
  }

  const top    = Math.max(0, rect.top    - PAD);
  const left   = Math.max(0, rect.left   - PAD);
  const right  = Math.min(window.innerWidth,  rect.right  + PAD);
  const bottom = Math.min(window.innerHeight, rect.bottom + PAD);
  const w      = right - left;
  const h      = bottom - top;

  const isOffScreen = bottom <= 0 || top >= window.innerHeight || w <= 0 || h <= 0;
  if (isOffScreen) {
    return <div style={{ ...panelStyle, inset: 0 }} onTouchMove={stopTouch} />;
  }

  const panelProps = { onTouchMove: stopTouch };

  return (
    <>
      <div style={{ ...panelStyle, top: 0,      left: 0,     right: 0,    height: top    }} {...panelProps} />
      <div style={{ ...panelStyle, top: bottom, left: 0,     right: 0,    bottom: 0      }} {...panelProps} />
      <div style={{ ...panelStyle, top,         left: 0,     width: left, height: h      }} {...panelProps} />
      <div style={{ ...panelStyle, top,         left: right, right: 0,    height: h      }} {...panelProps} />

      {/* Glowing accent ring */}
      <div style={{
        position: 'fixed',
        top, left, width: w, height: h,
        zIndex: OVERLAY_Z + 1,
        pointerEvents: 'none',
        borderRadius: 14,
        boxShadow: `0 0 0 3px ${ACCENT}, 0 0 0 6px rgba(74,123,247,0.35), 0 0 24px 8px rgba(74,123,247,0.2)`,
      }} />
    </>
  );
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

function Tooltip({ step, stepIndex, instruction, rect, dark, onSkip, onAutoFill }) {
  const vw       = window.innerWidth;
  const vh       = window.innerHeight;
  const tooltipW = Math.min(320, vw - 32);
  const TOOLTIP_H = 210;

  const visTop    = rect ? Math.max(0,  Math.min(vh, rect.top))    : vh / 2;
  const visBottom = rect ? Math.max(0,  Math.min(vh, rect.bottom)) : vh / 2;
  const elementCenter = (visTop + visBottom) / 2;

  let tooltipTop = elementCenter > vh / 2
    ? visTop  - PAD - TOOLTIP_H - 12
    : visBottom + PAD + 12;
  tooltipTop = Math.max(8, Math.min(vh - TOOLTIP_H - 8, tooltipTop));

  const tooltipLeft = Math.max(16, (vw - tooltipW) / 2);

  return (
    <div
      data-tutorial-ui="tooltip"
      onTouchMove={e => e.stopPropagation()} // don't let touches bleed through
      style={{
        position: 'fixed',
        top: tooltipTop,
        left: tooltipLeft,
        width: tooltipW,
        zIndex: TOOLTIP_Z,
        background: dark ? '#1c1c20' : '#ffffff',
        borderRadius: 20,
        padding: '16px 18px 14px',
        boxShadow: '0 16px 56px rgba(0,0,0,0.55)',
        border: `1px solid ${dark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.08)'}`,
        touchAction: 'none',
        WebkitUserSelect: 'none',
        userSelect: 'none',
      }}
    >
      {/* Row: step label + exit */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: ACCENT, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Step {step.id} of {TOTAL}
        </span>
        <button
          onClick={onSkip}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 12, fontWeight: 600,
            color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)',
            padding: '2px 6px', borderRadius: 6,
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          Exit
        </button>
      </div>

      {/* Progress bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
        {STEPS.map((_, i) => (
          <div key={i} style={{
            flex: 1, height: 3, borderRadius: 2,
            background: i <= stepIndex ? ACCENT : (dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'),
            opacity: i < stepIndex ? 0.45 : 1,
            transition: 'background 0.3s',
          }} />
        ))}
      </div>

      {/* Title */}
      <div style={{ fontSize: 14, fontWeight: 700, color: dark ? '#fff' : '#111', marginBottom: 5 }}>
        {step.title}
      </div>

      {/* Instruction */}
      <div style={{ fontSize: 12, color: dark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)', lineHeight: 1.55, marginBottom: 12 }}>
        {instruction || step.instruction}
      </div>

      {/* Next / Finish button */}
      <button
        onClick={onAutoFill}
        style={{
          width: '100%', height: 40, border: 'none', borderRadius: 11,
          background: ACCENT, color: '#fff',
          fontSize: 14, fontWeight: 700, cursor: 'pointer',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        {stepIndex === TOTAL - 1 ? 'Finish' : 'Next →'}
      </button>

      {!step.manualAdvance && (
        <div style={{
          marginTop: 7, fontSize: 10,
          color: dark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)',
          textAlign: 'center',
        }}>
          or do it yourself above ↑
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OnboardingTutorial({ navigate, onComplete, onSkip }) {
  const { dark } = useTheme();
  const [stepIndex, setStepIndex]        = useState(0);
  const [rect, setRect]                  = useState(null);
  const [dynamicInstruction, setDynamic] = useState(null);
  const rafRef                           = useRef(null);
  const stepIndexRef                     = useRef(stepIndex);
  const hasFocusedRef                    = useRef(false);
  const currentRectRef                   = useRef(null);
  const step                             = STEPS[stepIndex];

  useEffect(() => { stepIndexRef.current = stepIndex; }, [stepIndex]);
  useEffect(() => { currentRectRef.current = rect; },   [rect]);

  // ── Full page lock: no scrolling anywhere during tutorial ────────────────
  useEffect(() => {
    // 1. Lock overflow on known scroll containers
    const containers = Array.from(document.querySelectorAll('[data-scroll-container]'));
    const savedOverflows = containers.map(c => c.style.overflowY);
    containers.forEach(c => { c.style.overflowY = 'hidden'; });

    // 2. Lock body/html so the page itself cannot scroll
    const savedBodyOverflow   = document.body.style.overflow;
    const savedBodyPosition   = document.body.style.position;
    const savedHtmlOverflow   = document.documentElement.style.overflow;
    const savedScrollY        = window.scrollY;

    document.body.style.overflow         = 'hidden';
    document.body.style.position         = 'fixed';
    document.body.style.top              = `-${savedScrollY}px`;
    document.body.style.width            = '100%';
    document.documentElement.style.overflow = 'hidden';

    // 3. Block touchmove on document to prevent iOS rubber-band scroll
    const stopScroll = e => e.preventDefault();
    document.addEventListener('touchmove', stopScroll, { passive: false });

    return () => {
      containers.forEach((c, i) => { c.style.overflowY = savedOverflows[i]; });
      document.body.style.overflow   = savedBodyOverflow;
      document.body.style.position   = savedBodyPosition;
      document.body.style.top        = '';
      document.body.style.width      = '';
      document.documentElement.style.overflow = savedHtmlOverflow;
      window.scrollTo(0, savedScrollY);
      document.removeEventListener('touchmove', stopScroll);
    };
  }, []);

  // ── Navigate to the correct page + reset focus state ────────────────────
  useEffect(() => {
    navigate(step.page);
    hasFocusedRef.current = false;
  }, [stepIndex]); // eslint-disable-line

  // ── rAF loop: track element rect + step-1 dynamic sub-target ────────────
  useEffect(() => {
    let running = true;

    function update() {
      if (!running) return;

      const currentStep = STEPS[stepIndexRef.current];
      let selector    = currentStep.selector;
      let instruction = null;

      if (currentStep.dynamic) {
        const state = getStep1State();
        if (selector !== state.selector) hasFocusedRef.current = false;
        selector    = state.selector;
        instruction = state.instruction;
        setDynamic(instruction);
      }

      const el = document.querySelector(selector);
      if (el) {
        if (!hasFocusedRef.current) {
          hasFocusedRef.current = true;
          setTimeout(() => {
            const fresh = document.querySelector(selector);
            if (!fresh) return;
            fresh.scrollIntoView({ behavior: 'smooth', block: 'center' });
            const tag = fresh.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA') fresh.focus();
          }, 350);
        }

        const r = el.getBoundingClientRect();
        setRect(prev => {
          if (!prev ||
            Math.abs(prev.top    - r.top)    > 0.5 ||
            Math.abs(prev.left   - r.left)   > 0.5 ||
            Math.abs(prev.right  - r.right)  > 0.5 ||
            Math.abs(prev.bottom - r.bottom) > 0.5
          ) return { top: r.top, left: r.left, right: r.right, bottom: r.bottom };
          return prev;
        });
      } else {
        setRect(null);
      }

      rafRef.current = requestAnimationFrame(update);
    }

    rafRef.current = requestAnimationFrame(update);
    return () => {
      running = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [stepIndex]);

  // ── Screen lock: block REAL user clicks outside spotlight + tooltip ──────
  // KEY FIX: only block isTrusted events (real taps). Programmatic .click()
  // calls from autoFillStep have isTrusted=false and must pass through.
  useEffect(() => {
    function block(e) {
      // Always allow programmatic clicks (from autoFillStep)
      if (!e.isTrusted) return;

      // Always allow taps on tutorial UI (tooltip buttons)
      if (e.target.closest?.('[data-tutorial-ui]')) return;

      // Allow taps inside the spotlight rect
      const r = currentRectRef.current;
      if (r) {
        const pad = PAD + 8;
        if (e.clientX >= r.left - pad && e.clientX <= r.right  + pad &&
            e.clientY >= r.top  - pad && e.clientY <= r.bottom + pad) return;
      }

      e.stopPropagation();
      e.preventDefault();
    }

    document.addEventListener('click', block, true);
    return () => document.removeEventListener('click', block, true);
  }, []);

  // ── Advance step ─────────────────────────────────────────────────────────
  const advance = useCallback(() => {
    const next = stepIndexRef.current + 1;
    if (next < TOTAL) {
      setStepIndex(next);
      setDynamic(null);
    } else {
      onComplete();
    }
  }, [onComplete]);

  // ── Listen for step completion events ────────────────────────────────────
  useEffect(() => {
    if (!step.advanceEvent) return;
    const handler = () => advance();
    window.addEventListener(step.advanceEvent, handler);
    return () => window.removeEventListener(step.advanceEvent, handler);
  }, [step.advanceEvent, advance]);

  // ── Auto-fill: perform the current step's action ─────────────────────────
  const autoFillStep = useCallback(() => {
    const currentStep = STEPS[stepIndexRef.current];

    if (currentStep.dynamic) {
      const { selector: sel } = getStep1State();

      // Phase: New tab — just click it (click blocker allows isTrusted=false now)
      if (sel === '[data-tutorial="tab-new"]') {
        document.querySelector('[data-tutorial="tab-new"]')?.click();
        return;
      }

      // Phase: store name — fill store + customer only, then stop
      if (sel === '[data-tutorial="invoice-store-name"]') {
        setNativeValue(document.querySelector('input[placeholder="Sunrise Deli"]'), 'Corner Store');
        setNativeValue(document.querySelector('input[placeholder="John Smith"]'),   'Mike Johnson');
        return;
      }

      // Phase: add item — fill item fields + click "+ Add Item", then stop
      if (sel === '[data-tutorial="invoice-add-item"]') {
        setNativeValue(document.querySelector('input[placeholder="GMan V Cut T-Shirt"]'), 'GMan V Cut T-Shirt');
        setNativeValue(document.querySelector('input[placeholder="1"]'),    '2');
        setNativeValue(document.querySelector('input[placeholder="0.00"]'), '9.99');
        setTimeout(() => {
          Array.from(document.querySelectorAll('button'))
            .find(b => b.textContent.trim() === '+ Add Item')?.click();
        }, 150);
        return;
      }

      // Phase: generate — click Generate Invoice
      if (sel === '[data-tutorial="invoice-generate"]') {
        document.querySelector('[data-tutorial="invoice-generate"]')?.click();
        return;
      }
    }

    // Step 2: cycle status badge to paid
    if (currentStep.selector === '[data-tutorial="invoice-latest"]') {
      document.querySelector('[data-tutorial="status-badge-latest"]')?.click();
      return;
    }

    // Step 3: view store balance
    if (currentStep.selector === '[data-tutorial="store-name-link"]') {
      document.querySelector('[data-tutorial="store-name-link"]')?.click();
      return;
    }

    // Step 4: products page — manual advance
    if (currentStep.selector === '[data-tutorial="products-list"]') {
      advance();
      return;
    }

    // Step 5: fill business name + save
    if (currentStep.selector === '[data-tutorial="settings-biz-name"]') {
      setNativeValue(document.querySelector('[data-tutorial="settings-biz-name"]'), 'J&Y Distributions');
      setTimeout(() => {
        document.querySelector('[data-tutorial="settings-save-btn"]')?.click();
      }, 60);
    }
  }, [advance]);

  return (
    <>
      <Spotlight rect={rect} />
      <Tooltip
        step={step}
        stepIndex={stepIndex}
        instruction={step.dynamic ? dynamicInstruction : null}
        rect={rect}
        dark={dark}
        onSkip={onSkip}
        onAutoFill={autoFillStep}
      />
    </>
  );
}
