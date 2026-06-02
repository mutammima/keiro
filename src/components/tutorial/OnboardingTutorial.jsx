/**
 * OnboardingTutorial — 5-step first-time user onboarding with spotlight overlay.
 *
 * Step 1 uses dynamic sub-targets that follow the user through the invoice flow:
 *   • "New" tab button  → when the invoice form is not on-screen yet
 *   • Store name card   → when on the invoice tab and store name is empty
 *   • Add Item card     → when store name is filled
 *   • Generate button   → when at least one item has been added
 *
 * Screen lock
 *   – Scroll containers are frozen (overflowY: hidden) during the tutorial;
 *     the tutorial uses scrollIntoView to position the spotlight element.
 *     This prevents the spotlight hole from drifting off-screen.
 *   – A capture-phase click listener blocks navigation taps outside the
 *     spotlight + tooltip. Only `click` is blocked — touch events are NOT
 *     intercepted so the device's scroll/touch stack is never disturbed.
 *
 * Auto-fill
 *   – Every step shows a "Next →" button that fills sample data and performs
 *     the required action, so the user can tap through hands-free.
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
    instruction: 'Your product was saved automatically. Next time you invoice this store, InvoiceGo will autofill it.',
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
const DIM_COLOR = 'rgba(0,0,0,0.65)';
const OVERLAY_Z = 9100;
const TOOLTIP_Z = 9200;
const PAD       = 12; // spotlight padding around element

// ── Dynamic selector for Step 1 ───────────────────────────────────────────────

function getStep1State() {
  // Phase 0: invoice tab not visible yet (all tabs always mounted; check rect)
  const storeCard = document.querySelector('[data-tutorial="invoice-store-name"]');
  const cardRect  = storeCard?.getBoundingClientRect();
  const invoiceTabVisible = cardRect && cardRect.left > -(window.innerWidth * 0.5);

  if (!invoiceTabVisible) {
    return {
      selector: '[data-tutorial="tab-new"]',
      instruction: 'Tap "New" to start creating your first invoice.',
    };
  }

  // Phase 1: store name empty
  const storeInput = storeCard.querySelector('input');
  const hasStore   = storeInput?.value?.trim().length > 0;
  if (!hasStore) {
    return {
      selector: '[data-tutorial="invoice-store-name"]',
      instruction: 'Type the store name and customer name, then scroll down.',
    };
  }

  // Phase 2: check for items
  const previewCard = document.querySelector('.card-enter-4');
  const hasItems    = previewCard && previewCard.textContent.includes('$') && previewCard.textContent.length > 20;
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

// ── Auto-fill helper ──────────────────────────────────────────────────────────

function setNativeValue(el, value) {
  if (!el) return;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

// ── Spotlight ─────────────────────────────────────────────────────────────────
// 4 fixed panels leave a transparent "hole" over the target element.
// Panels block pointer events so taps outside the hole do nothing.
// A glowing ring is drawn using box-shadow on a transparent overlay div
// so the cutout is visually obvious.

function Spotlight({ rect }) {
  const panelStyle = {
    position: 'fixed',
    background: DIM_COLOR,
    zIndex: OVERLAY_Z,
    pointerEvents: 'all',
  };

  if (!rect) {
    return <div style={{ ...panelStyle, inset: 0, pointerEvents: 'all' }} />;
  }

  const top    = Math.max(0, rect.top    - PAD);
  const left   = Math.max(0, rect.left   - PAD);
  const right  = Math.min(window.innerWidth,  rect.right  + PAD);
  const bottom = Math.min(window.innerHeight, rect.bottom + PAD);
  const w      = right - left;
  const h      = bottom - top;

  const isOffScreen = bottom <= 0 || top >= window.innerHeight || w <= 0 || h <= 0;
  if (isOffScreen) {
    return <div style={{ ...panelStyle, inset: 0 }} />;
  }

  return (
    <>
      {/* Dim panels */}
      <div style={{ ...panelStyle, top: 0, left: 0, right: 0, height: top }} />
      <div style={{ ...panelStyle, top: bottom, left: 0, right: 0, bottom: 0 }} />
      <div style={{ ...panelStyle, top, left: 0, width: left, height: h }} />
      <div style={{ ...panelStyle, top, left: right, right: 0, height: h }} />

      {/* Glowing ring around the hole — makes the cutout unmistakably obvious */}
      <div style={{
        position: 'fixed',
        top, left, width: w, height: h,
        zIndex: OVERLAY_Z + 1,
        pointerEvents: 'none',
        borderRadius: 14,
        boxShadow: `0 0 0 3px ${ACCENT}, 0 0 0 6px rgba(74,123,247,0.35), 0 0 24px 8px rgba(74,123,247,0.25)`,
      }} />
    </>
  );
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

function Tooltip({ step, stepIndex, instruction, rect, dark, onSkip, onAutoFill }) {
  const vw       = window.innerWidth;
  const vh       = window.innerHeight;
  const tooltipW = Math.min(320, vw - 32);
  const TOOLTIP_H = 200;

  // Position tooltip on whichever side of the spotlight has more room.
  // If element is in the bottom half → show tooltip above; else below.
  const visTop    = rect ? Math.max(0,  Math.min(vh, rect.top))    : vh / 2;
  const visBottom = rect ? Math.max(0,  Math.min(vh, rect.bottom)) : vh / 2;
  const elementCenter = (visTop + visBottom) / 2;

  let tooltipTop;
  if (elementCenter > vh / 2) {
    // Element in lower half → put tooltip above
    tooltipTop = visTop - PAD - TOOLTIP_H - 12;
  } else {
    // Element in upper half → put tooltip below
    tooltipTop = visBottom + PAD + 12;
  }
  // Hard-clamp inside viewport
  tooltipTop = Math.max(8, Math.min(vh - TOOLTIP_H - 8, tooltipTop));

  const tooltipLeft = Math.max(16, (vw - tooltipW) / 2);

  return (
    <div
      data-tutorial-ui="tooltip"
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

      {/* Progress dots */}
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

      {/* Next / auto-fill button */}
      <button
        onClick={onAutoFill}
        style={{
          width: '100%', height: 40, border: 'none', borderRadius: 11,
          background: ACCENT, color: '#fff',
          fontSize: 14, fontWeight: 700, cursor: 'pointer',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        {stepIndex === TOTAL - 1 ? 'Finish 🎉' : 'Next →'}
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

  // ── Freeze scroll containers during tutorial ─────────────────────────────
  // overflowY: hidden blocks user scroll; scrollIntoView still works
  // programmatically (it sets scrollTop, ignoring overflow:hidden).
  useEffect(() => {
    const containers = Array.from(document.querySelectorAll('[data-scroll-container]'));
    const saved = containers.map(c => c.style.overflowY);
    containers.forEach(c => { c.style.overflowY = 'hidden'; });
    return () => {
      containers.forEach((c, i) => { c.style.overflowY = saved[i]; });
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
        if (selector !== state.selector) hasFocusedRef.current = false; // new sub-target
        selector    = state.selector;
        instruction = state.instruction;
        setDynamic(instruction);
      }

      const el = document.querySelector(selector);
      if (el) {
        // First time this element is found on this step: scroll it into view + focus
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

  // ── Screen lock: block click events outside spotlight + tooltip ──────────
  // Only `click` is blocked (NOT touchstart/touchmove) so native scroll and
  // the device's touch stack are never disturbed.
  useEffect(() => {
    function block(e) {
      if (e.target.closest?.('[data-tutorial-ui]')) return; // allow tooltip

      // Allow inside spotlight rect (use clientX/Y — works for both mouse & click)
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

  // ── Auto-fill: perform the current step's action with sample data ────────
  const autoFillStep = useCallback(() => {
    // Guard: don't auto-fill if the spotlight element isn't on screen
    if (!currentRectRef.current) return;

    const currentStep = STEPS[stepIndexRef.current];

    if (currentStep.dynamic) {
      const { selector: sel } = getStep1State();

      if (sel === '[data-tutorial="tab-new"]') {
        document.querySelector('[data-tutorial="tab-new"]')?.click();
        return;
      }
      if (sel === '[data-tutorial="invoice-store-name"]') {
        setNativeValue(document.querySelector('input[placeholder="Sunrise Deli"]'), 'Corner Store');
        setNativeValue(document.querySelector('input[placeholder="John Smith"]'),   'Mike Johnson');
        return;
      }
      if (sel === '[data-tutorial="invoice-add-item"]') {
        setNativeValue(document.querySelector('input[placeholder="GMan V Cut T-Shirt 6ct"]'), 'GMan V Cut T-Shirt 6ct');
        setNativeValue(document.querySelector('input[placeholder="1"]'),             '2');
        setNativeValue(document.querySelector('input[placeholder="0.00"]'),          '9.99');
        setTimeout(() => {
          Array.from(document.querySelectorAll('button'))
            .find(b => b.textContent.trim() === '+ Add Item')?.click();
        }, 60);
        return;
      }
      if (sel === '[data-tutorial="invoice-generate"]') {
        document.querySelector('[data-tutorial="invoice-generate"]')?.click();
        return;
      }
    }

    const sel = currentStep.selector;
    if (sel === '[data-tutorial="invoice-latest"]') {
      document.querySelector('[data-tutorial="status-badge-latest"]')?.click();
      return;
    }
    if (sel === '[data-tutorial="store-name-link"]') {
      document.querySelector('[data-tutorial="store-name-link"]')?.click();
      return;
    }
    if (sel === '[data-tutorial="products-list"]') {
      advance();
      return;
    }
    if (sel === '[data-tutorial="settings-biz-name"]') {
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
