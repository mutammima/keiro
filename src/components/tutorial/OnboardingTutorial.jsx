/**
 * OnboardingTutorial — 5-step first-time user onboarding with spotlight overlay.
 *
 * Step 1 uses dynamic sub-targets that follow the user through the invoice flow:
 *   • "New" tab button  → when the invoice form is not on-screen yet
 *   • Store name card   → when on the invoice tab and store name is empty
 *   • Add Item card     → when store name is filled
 *   • Generate button   → when at least one item has been added
 *
 * Screen lock: while the tutorial is active, taps/clicks outside the
 * spotlighted area and outside the tooltip are blocked.
 *
 * Auto-fill: every step has a "Next →" button that fills the current
 * field(s) with sample data and performs the required action automatically.
 *
 * All other steps target a single element.
 * Tooltip is always clamped to the visible viewport — never scrolls off screen.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { LIGHT, DARK, ACCENT } from '../../theme';

// ── Step definitions ──────────────────────────────────────────────────────────

const STEPS = [
  {
    id: 1,
    page: 'history',           // navigate to history first so user isn't already on the form
    // selector is computed dynamically for step 1 — see getStep1State()
    selector: '[data-tutorial="tab-new"]',
    title: 'Create your first invoice',
    instruction: 'Tap "New" to start creating your first invoice.',
    advanceEvent: 'inv-onboarding-invoice-created',
    manualAdvance: false,
    dynamic: true, // triggers sub-target logic
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
const DIM_COLOR = 'rgba(0,0,0,0.72)';
const OVERLAY_Z = 9100;
const TOOLTIP_Z = 9200;
const PAD       = 10; // spotlight padding around element

// ── Dynamic selector for Step 1 ───────────────────────────────────────────────
// Returns the selector + instruction for whichever sub-phase the user is on.

function getStep1State() {
  // ── Phase 0: invoice form is not on-screen yet ─────────────────────────────
  // All tabs stay mounted in the DOM, so we check the element's bounding rect.
  // When the invoice tab is not active its card is off-screen to the left (~-vw).
  const storeCard = document.querySelector('[data-tutorial="invoice-store-name"]');
  const cardRect  = storeCard?.getBoundingClientRect();
  const invoiceTabVisible = cardRect && cardRect.left > -(window.innerWidth * 0.5);

  if (!invoiceTabVisible) {
    return {
      selector: '[data-tutorial="tab-new"]',
      instruction: 'Tap "New" to start creating your first invoice.',
    };
  }

  // ── Phase 1: on invoice tab, store name not yet filled ────────────────────
  const storeInput = storeCard.querySelector('input');
  const hasStore   = storeInput?.value?.trim().length > 0;

  if (!hasStore) {
    return {
      selector: '[data-tutorial="invoice-store-name"]',
      instruction: 'Type the store name and customer name, then scroll down.',
    };
  }

  // ── Phase 2: store name filled — guide to add an item ─────────────────────
  const previewCard = document.querySelector('.card-enter-4');
  const hasItems    = previewCard && previewCard.textContent.includes('$') && previewCard.textContent.length > 20;

  if (hasItems) {
    // ── Phase 3: item added — guide to generate ──────────────────────────────
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

// ── Auto-fill helpers ─────────────────────────────────────────────────────────

/**
 * Programmatically set a React-controlled input's value.
 * Uses the native HTMLInputElement setter so React's onChange fires.
 */
function setNativeValue(el, value) {
  if (!el) return;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

// ── Spotlight (4-div hole approach) ──────────────────────────────────────────
// Overlay divs use pointerEvents:'all' to block clicks outside the spotlight.
// The spotlight hole itself has no div — taps pass through naturally.

function Spotlight({ rect }) {
  const base = {
    position: 'fixed',
    background: DIM_COLOR,
    zIndex: OVERLAY_Z,
    pointerEvents: 'all', // block taps on the dimmed area
  };

  if (!rect) {
    return <div style={{ ...base, inset: 0 }} />;
  }

  const top    = Math.max(0, rect.top    - PAD);
  const left   = Math.max(0, rect.left   - PAD);
  const right  = Math.min(window.innerWidth,  rect.right  + PAD);
  const bottom = Math.min(window.innerHeight, rect.bottom + PAD);

  if (bottom <= 0 || top >= window.innerHeight) {
    return <div style={{ ...base, inset: 0 }} />;
  }

  return (
    <>
      <div style={{ ...base, top: 0, left: 0, right: 0, height: top }} />
      <div style={{ ...base, top: bottom, left: 0, right: 0, bottom: 0 }} />
      <div style={{ ...base, top, left: 0, width: left, height: bottom - top }} />
      <div style={{ ...base, top, left: right, right: 0, height: bottom - top }} />
    </>
  );
}

// ── Tooltip card ──────────────────────────────────────────────────────────────

function Tooltip({ step, stepIndex, instruction, rect, dark, onSkip, onNext, onAutoFill }) {
  const vw       = window.innerWidth;
  const vh       = window.innerHeight;
  const tooltipW = Math.min(340, vw - 32);
  const TOOLTIP_H = 210;

  const visTop    = rect ? Math.max(0,  rect.top)    : vh / 2;
  const visBottom = rect ? Math.min(vh, rect.bottom) : vh / 2;

  let tooltipTop;
  const spaceBelow = vh - visBottom - PAD;
  const spaceAbove = visTop - PAD;

  if (spaceBelow >= TOOLTIP_H + 12) {
    tooltipTop = visBottom + PAD + 8;
  } else if (spaceAbove >= TOOLTIP_H + 12) {
    tooltipTop = visTop - PAD - TOOLTIP_H - 8;
  } else {
    tooltipTop = vh - TOOLTIP_H - 20;
  }
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
        background: dark ? '#1a1a1e' : '#ffffff',
        borderRadius: 20,
        padding: '18px 20px 16px',
        boxShadow: '0 16px 56px rgba(0,0,0,0.5)',
        border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'}`,
      }}
    >
      {/* Step label + skip */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
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
      <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
        {STEPS.map((_, i) => (
          <div key={i} style={{
            flex: 1, height: 3, borderRadius: 2,
            background: i <= stepIndex
              ? ACCENT
              : (dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'),
            opacity: i < stepIndex ? 0.5 : 1,
            transition: 'background 0.3s',
          }} />
        ))}
      </div>

      {/* Title */}
      <div style={{ fontSize: 15, fontWeight: 700, color: dark ? '#fff' : '#111', marginBottom: 6 }}>
        {step.title}
      </div>

      {/* Instruction */}
      <div style={{ fontSize: 13, color: dark ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.55)', lineHeight: 1.55, marginBottom: 14 }}>
        {instruction || step.instruction}
      </div>

      {/* Next / auto-fill button — shown for every step */}
      <button
        onClick={onAutoFill}
        style={{
          width: '100%', height: 42, border: 'none', borderRadius: 12,
          background: ACCENT, color: '#fff',
          fontSize: 14, fontWeight: 700, cursor: 'pointer',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        {stepIndex === TOTAL - 1 ? 'Finish 🎉' : 'Next →'}
      </button>

      {/* Hint: user can also do the action themselves */}
      {!step.manualAdvance && (
        <div style={{
          marginTop: 8,
          fontSize: 11,
          color: dark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.28)',
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
  const currentRectRef                   = useRef(null); // live rect for screen lock
  const step                             = STEPS[stepIndex];

  useEffect(() => { stepIndexRef.current = stepIndex; }, [stepIndex]);
  useEffect(() => { currentRectRef.current = rect; }, [rect]);

  // Navigate to the correct page when step changes, reset focus flag
  useEffect(() => {
    navigate(step.page);
    hasFocusedRef.current = false;
  }, [stepIndex]); // eslint-disable-line

  // ── Screen lock ─────────────────────────────────────────────────────────────
  // Capture-phase listener blocks any click/touch outside the spotlight + tooltip.
  // Scrolling (touchmove) is intentionally NOT blocked so the user can scroll.
  useEffect(() => {
    function block(e) {
      // Always allow anything inside the tooltip (data-tutorial-ui attribute)
      if (e.target.closest?.('[data-tutorial-ui]')) return;

      // Allow interactions inside the padded spotlight rect
      const r = currentRectRef.current;
      if (r) {
        const pad = PAD + 8;
        if (
          e.clientX >= r.left  - pad && e.clientX <= r.right  + pad &&
          e.clientY >= r.top   - pad && e.clientY <= r.bottom + pad
        ) return;
      }

      e.stopPropagation();
      e.preventDefault();
    }

    document.addEventListener('click',      block, true);
    document.addEventListener('touchstart', block, { capture: true, passive: false });

    return () => {
      document.removeEventListener('click',      block, true);
      document.removeEventListener('touchstart', block, { capture: true, passive: false });
    };
  }, []); // once — accesses rect via ref

  // ── rAF loop — tracks rect + step 1 dynamic sub-target ───────────────────
  useEffect(() => {
    let running = true;

    function update() {
      if (!running) return;

      const currentStep = STEPS[stepIndexRef.current];
      let selector   = currentStep.selector;
      let instruction = null;

      if (currentStep.dynamic) {
        const state = getStep1State();
        // Selector changed → new sub-target, reset focus
        if (selector !== state.selector) hasFocusedRef.current = false;
        selector    = state.selector;
        instruction = state.instruction;
        setDynamic(instruction);
      }

      const el = document.querySelector(selector);
      if (el) {
        // First time this element appears on the current step: scroll + focus
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
          if (
            !prev ||
            Math.abs(prev.top    - r.top)    > 0.5 ||
            Math.abs(prev.left   - r.left)   > 0.5 ||
            Math.abs(prev.right  - r.right)  > 0.5 ||
            Math.abs(prev.bottom - r.bottom) > 0.5
          ) {
            return { top: r.top, left: r.left, right: r.right, bottom: r.bottom };
          }
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

  // ── Advance to next step (or complete) ────────────────────────────────────
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

  // ── Auto-fill: perform the current step's action with sample data ─────────
  const autoFillStep = useCallback(() => {
    const currentStep = STEPS[stepIndexRef.current];

    // ── Step 1: dynamic sub-targets ──────────────────────────────────────────
    if (currentStep.dynamic) {
      const { selector: sel } = getStep1State();

      if (sel === '[data-tutorial="tab-new"]') {
        document.querySelector('[data-tutorial="tab-new"]')?.click();
        return; // spotlight switches to store-name when tab becomes visible
      }

      if (sel === '[data-tutorial="invoice-store-name"]') {
        setNativeValue(document.querySelector('input[placeholder="Sunrise Deli"]'), 'Corner Store');
        setNativeValue(document.querySelector('input[placeholder="John Smith"]'), 'Mike Johnson');
        return; // hasFocusedRef resets when selector switches to add-item
      }

      if (sel === '[data-tutorial="invoice-add-item"]') {
        setNativeValue(document.querySelector('input[placeholder="Marlboro Reds"]'), 'Marlboro Reds');
        setNativeValue(document.querySelector('input[placeholder="1"]'), '2');
        setNativeValue(document.querySelector('input[placeholder="0.00"]'), '9.99');
        setTimeout(() => {
          Array.from(document.querySelectorAll('button'))
            .find(b => b.textContent.trim() === '+ Add Item')?.click();
        }, 60);
        return;
      }

      if (sel === '[data-tutorial="invoice-generate"]') {
        document.querySelector('[data-tutorial="invoice-generate"]')?.click();
        return; // advance fires via inv-onboarding-invoice-created event
      }
    }

    // ── Static steps ──────────────────────────────────────────────────────────
    const sel = currentStep.selector;

    if (sel === '[data-tutorial="invoice-latest"]') {
      // Click the status badge — cycles status to Paid, which fires the advance event
      document.querySelector('[data-tutorial="status-badge-latest"]')?.click();
      return;
    }

    if (sel === '[data-tutorial="store-name-link"]') {
      document.querySelector('[data-tutorial="store-name-link"]')?.click();
      return;
    }

    if (sel === '[data-tutorial="products-list"]') {
      advance(); // manual step — just advance
      return;
    }

    if (sel === '[data-tutorial="settings-biz-name"]') {
      setNativeValue(
        document.querySelector('[data-tutorial="settings-biz-name"]'),
        'J&Y Distributions'
      );
      setTimeout(() => {
        document.querySelector('[data-tutorial="settings-save-btn"]')?.click();
      }, 60);
      return;
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
