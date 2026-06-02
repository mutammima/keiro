/**
 * OnboardingTutorial — 5-step first-time user onboarding with spotlight overlay.
 *
 * Step 1 dynamic sub-targets (tracked via explicit subStepRef — NOT DOM inspection):
 *   0: tab-new  →  1: invoice-store-name  →  2: invoice-add-item  →  3: invoice-generate
 *
 * Each sub-step requires an explicit Next tap. The rAF loop only auto-advances
 * subStep 0→1 when the invoice form becomes visible (user tapped New themselves).
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

// ── Step-1 sub-step config ────────────────────────────────────────────────────
// Indexed 0..3. State is tracked in subStepRef (never derived from DOM).

const SUB_STEPS = [
  { selector: '[data-tutorial="tab-new"]',         instruction: 'Tap "New" to start creating your first invoice.' },
  { selector: '[data-tutorial="invoice-store-name"]', instruction: 'Enter the store name and customer name, then tap Next →' },
  { selector: '[data-tutorial="invoice-add-item"]',   instruction: 'Add a product — enter name, qty and price, then tap + Add Item.' },
  { selector: '[data-tutorial="invoice-generate"]',   instruction: "Great! You've added an item. Now tap Generate Invoice." },
];

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
    touchAction: 'none',
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

function Tooltip({ step, stepIndex, instruction, rect, dark, onSkip, onAutoFill, cooldown }) {
  const vw        = window.innerWidth;
  const vh        = window.innerHeight;
  const tooltipW  = Math.min(320, vw - 32);
  const TOOLTIP_H = 240; // generous estimate to avoid cut-off

  // Position tooltip above the element if it's in the lower half, else below
  const visTop    = rect ? Math.max(0,  Math.min(vh, rect.top))    : vh / 2;
  const visBottom = rect ? Math.max(0,  Math.min(vh, rect.bottom)) : vh / 2;
  const elementCenter = (visTop + visBottom) / 2;

  let tooltipTop;
  if (elementCenter > vh / 2) {
    // Element in lower half → tooltip goes above
    tooltipTop = visTop - PAD - TOOLTIP_H - 16;
  } else {
    // Element in upper half → tooltip goes below
    tooltipTop = visBottom + PAD + 16;
  }
  // Hard-clamp so tooltip is never off-screen
  tooltipTop = Math.max(8, Math.min(vh - TOOLTIP_H - 8, tooltipTop));

  const tooltipLeft = Math.max(16, (vw - tooltipW) / 2);

  return (
    <div
      data-tutorial-ui="tooltip"
      onTouchMove={e => e.stopPropagation()}
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
        data-tutorial-ui="next-btn"
        onClick={onAutoFill}
        disabled={cooldown}
        style={{
          width: '100%', height: 40, border: 'none', borderRadius: 11,
          background: cooldown ? (dark ? '#333' : '#ccc') : ACCENT,
          color: cooldown ? (dark ? '#666' : '#999') : '#fff',
          fontSize: 14, fontWeight: 700, cursor: cooldown ? 'default' : 'pointer',
          WebkitTapHighlightColor: 'transparent',
          transition: 'background 0.2s, color 0.2s',
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
  const [cooldown, setCooldown]          = useState(false);
  const rafRef                           = useRef(null);
  const stepIndexRef                     = useRef(stepIndex);
  const subStepRef                       = useRef(0); // step-1 sub-phase 0..3
  const hasFocusedRef                    = useRef(false);
  const currentRectRef                   = useRef(null);
  const step                             = STEPS[stepIndex];

  useEffect(() => { stepIndexRef.current = stepIndex; }, [stepIndex]);
  useEffect(() => { currentRectRef.current = rect; },   [rect]);

  // ── Full page lock ────────────────────────────────────────────────────────
  useEffect(() => {
    const containers = Array.from(document.querySelectorAll('[data-scroll-container]'));
    const savedOverflows = containers.map(c => c.style.overflowY);
    containers.forEach(c => { c.style.overflowY = 'hidden'; });

    const savedBodyOverflow = document.body.style.overflow;
    const savedBodyPosition = document.body.style.position;
    const savedHtmlOverflow = document.documentElement.style.overflow;
    const savedScrollY      = window.scrollY;

    document.body.style.overflow              = 'hidden';
    document.body.style.position              = 'fixed';
    document.body.style.top                   = `-${savedScrollY}px`;
    document.body.style.width                 = '100%';
    document.documentElement.style.overflow   = 'hidden';

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

  // ── Navigate to correct page on step change ───────────────────────────────
  useEffect(() => {
    navigate(step.page);
    hasFocusedRef.current = false;
    if (stepIndex === 0) subStepRef.current = 0; // reset sub-step on re-entry
  }, [stepIndex]); // eslint-disable-line

  // ── rAF loop: track element rect ─────────────────────────────────────────
  useEffect(() => {
    let running = true;

    function update() {
      if (!running) return;

      const currentStep = STEPS[stepIndexRef.current];
      let selector    = currentStep.selector;
      let instruction = null;

      if (currentStep.dynamic) {
        const sub = subStepRef.current;
        const subDef = SUB_STEPS[sub] || SUB_STEPS[0];
        selector    = subDef.selector;
        instruction = subDef.instruction;

        // Auto-advance subStep 0→1 when invoice form becomes visible
        if (sub === 0) {
          const storeCard = document.querySelector('[data-tutorial="invoice-store-name"]');
          const cardRect  = storeCard?.getBoundingClientRect();
          const formVisible = cardRect && cardRect.left > -(window.innerWidth * 0.5);
          if (formVisible) {
            subStepRef.current = 1;
            hasFocusedRef.current = false;
          }
        }

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

  // ── Screen lock: block real user taps outside spotlight ───────────────────
  useEffect(() => {
    function block(e) {
      if (!e.isTrusted) return; // allow programmatic clicks
      if (e.target.closest?.('[data-tutorial-ui]')) return; // allow tooltip

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

  // ── Advance overall step ──────────────────────────────────────────────────
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

  // ── Trigger brief cooldown after any Next tap ─────────────────────────────
  const triggerCooldown = useCallback(() => {
    setCooldown(true);
    setTimeout(() => setCooldown(false), 700);
  }, []);

  // ── Auto-fill: perform the current step's action ──────────────────────────
  const autoFillStep = useCallback(() => {
    if (cooldown) return;
    triggerCooldown();

    const currentStep = STEPS[stepIndexRef.current];

    if (currentStep.dynamic) {
      const sub = subStepRef.current;

      // Sub-step 0: click "New" tab
      if (sub === 0) {
        document.querySelector('[data-tutorial="tab-new"]')?.click();
        // subStep auto-advances to 1 in rAF when form becomes visible
        return;
      }

      // Sub-step 1: fill store + customer, advance to sub-step 2
      if (sub === 1) {
        setNativeValue(document.querySelector('input[placeholder="Sunrise Deli"]'), 'Corner Store');
        setNativeValue(document.querySelector('input[placeholder="John Smith"]'),   'Mike Johnson');
        setTimeout(() => {
          subStepRef.current = 2;
          hasFocusedRef.current = false;
        }, 300);
        return;
      }

      // Sub-step 2: fill item fields + click + Add Item, advance to sub-step 3
      if (sub === 2) {
        setNativeValue(document.querySelector('input[placeholder="GMan V Cut T-Shirt"]'), 'GMan V Cut T-Shirt');
        setNativeValue(document.querySelector('input[placeholder="1"]'),    '2');
        setNativeValue(document.querySelector('input[placeholder="0.00"]'), '9.99');
        setTimeout(() => {
          Array.from(document.querySelectorAll('button'))
            .find(b => b.textContent.trim() === '+ Add Item')?.click();
          setTimeout(() => {
            subStepRef.current = 3;
            hasFocusedRef.current = false;
          }, 300);
        }, 200);
        return;
      }

      // Sub-step 3: click Generate Invoice
      if (sub === 3) {
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
  }, [advance, cooldown, triggerCooldown]);

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
        cooldown={cooldown}
      />
    </>
  );
}
