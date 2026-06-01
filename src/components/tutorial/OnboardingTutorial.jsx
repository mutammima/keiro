/**
 * OnboardingTutorial — 5-step first-time user onboarding with spotlight overlay.
 *
 * Step 1 uses dynamic sub-targets that follow the user through the invoice form:
 *   • Store name card  → when store name is empty
 *   • Add Item card    → when store name is filled
 *   • Generate button  → when at least one item has been added
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
    page: 'invoice',
    // selector is computed dynamically for step 1 — see getStep1Selector()
    selector: '[data-tutorial="invoice-store-name"]',
    title: 'Create your first invoice',
    instruction: 'Type the store name and customer name here.',
    advanceEvent: 'inv-onboarding-invoice-created',
    manualAdvance: false,
    dynamic: true, // triggers sub-target logic
  },
  {
    id: 2,
    page: 'history',
    selector: '[data-tutorial="invoice-latest"]',
    title: 'Mark it as paid',
    instruction: 'This is your invoice. Tap the status badge and mark it as Paid.',
    advanceEvent: 'inv-onboarding-invoice-paid',
    manualAdvance: false,
  },
  {
    id: 3,
    page: 'history',
    selector: '[data-tutorial="store-name-link"]',
    title: 'See the store balance',
    instruction: 'Tap the store name to see the running balance view for this store.',
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
    instruction: 'Enter your business name and phone number — they appear on every invoice.',
    advanceEvent: 'inv-onboarding-settings-saved',
    manualAdvance: false,
  },
];

const TOTAL = STEPS.length;
const DIM_COLOR = 'rgba(0,0,0,0.72)';
const OVERLAY_Z = 9100;
const TOOLTIP_Z  = 9200;
const PAD = 10; // spotlight padding around element

// ── Dynamic selector for Step 1 ───────────────────────────────────────────────
// Returns the selector for whichever sub-section the user is currently on,
// and the matching instruction text.

function getStep1State() {
  // Check if store name has been filled
  const storeCard = document.querySelector('[data-tutorial="invoice-store-name"]');
  const storeInput = storeCard?.querySelector('input');
  const hasStore = storeInput?.value?.trim().length > 0;

  if (!hasStore) {
    return {
      selector: '[data-tutorial="invoice-store-name"]',
      instruction: 'Type the store name and customer name, then scroll down.',
    };
  }

  // Check if at least one item has been added (InvoicePreview shows item rows)
  // Items added show up in the preview card below the add-item card
  const previewRows = document.querySelectorAll('[data-tutorial="invoice-add-item"] ~ * [data-item-row], .invoice-item-row');
  // Fallback: look for a non-empty items list by checking if the generate button is accessible
  // We check by reading the items preview text content for any price/qty
  const addItemCard = document.querySelector('[data-tutorial="invoice-add-item"]');
  // Check for a filled product name input
  const productInput = addItemCard?.querySelector('input[placeholder="Marlboro Reds"]');
  const hasProductFilled = productInput?.value?.trim().length > 0;

  // Check if the invoice preview has any items (look for the preview card's content)
  // The InvoicePreview is inside card-enter-4; if it has items it'll have more than placeholder text
  const previewCard = document.querySelector('.card-enter-4');
  const hasItems = previewCard && previewCard.textContent.includes('$') && previewCard.textContent.length > 20;

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

// ── Spotlight (4-div hole approach) ──────────────────────────────────────────

function Spotlight({ rect }) {
  if (!rect) {
    return (
      <div style={{
        position: 'fixed', inset: 0,
        background: DIM_COLOR,
        zIndex: OVERLAY_Z,
        pointerEvents: 'none',
      }} />
    );
  }

  const top    = Math.max(0, rect.top    - PAD);
  const left   = Math.max(0, rect.left   - PAD);
  const right  = Math.min(window.innerWidth,  rect.right  + PAD);
  const bottom = Math.min(window.innerHeight, rect.bottom + PAD);

  // If element is fully off-screen, show full dim
  if (bottom <= 0 || top >= window.innerHeight) {
    return (
      <div style={{
        position: 'fixed', inset: 0,
        background: DIM_COLOR,
        zIndex: OVERLAY_Z,
        pointerEvents: 'none',
      }} />
    );
  }

  return (
    <>
      {/* Top strip */}
      <div style={{ position:'fixed', top:0, left:0, right:0, height: top,
        background: DIM_COLOR, zIndex: OVERLAY_Z, pointerEvents:'none' }} />
      {/* Bottom strip */}
      <div style={{ position:'fixed', top: bottom, left:0, right:0, bottom:0,
        background: DIM_COLOR, zIndex: OVERLAY_Z, pointerEvents:'none' }} />
      {/* Left strip */}
      <div style={{ position:'fixed', top, left:0, width: left, height: bottom - top,
        background: DIM_COLOR, zIndex: OVERLAY_Z, pointerEvents:'none' }} />
      {/* Right strip */}
      <div style={{ position:'fixed', top, left: right, right:0, height: bottom - top,
        background: DIM_COLOR, zIndex: OVERLAY_Z, pointerEvents:'none' }} />
    </>
  );
}

// ── Tooltip card ──────────────────────────────────────────────────────────────

function Tooltip({ step, stepIndex, instruction, rect, dark, onSkip, onNext }) {
  const C = dark ? DARK : LIGHT;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const tooltipW = Math.min(340, vw - 32);
  const TOOLTIP_H = 200; // approximate height

  // Clamp rect to visible viewport for positioning
  const visTop    = rect ? Math.max(0,  rect.top)    : vh / 2;
  const visBottom = rect ? Math.min(vh, rect.bottom) : vh / 2;

  // Place tooltip below visible portion if room, else above, else at bottom
  let tooltipTop;
  const spaceBelow = vh - visBottom - PAD;
  const spaceAbove = visTop - PAD;

  if (spaceBelow >= TOOLTIP_H + 12) {
    tooltipTop = visBottom + PAD + 8;
  } else if (spaceAbove >= TOOLTIP_H + 12) {
    tooltipTop = visTop - PAD - TOOLTIP_H - 8;
  } else {
    // Not enough room either side — anchor to bottom of screen
    tooltipTop = vh - TOOLTIP_H - 20;
  }

  // Clamp to viewport bounds
  tooltipTop = Math.max(8, Math.min(vh - TOOLTIP_H - 8, tooltipTop));

  const tooltipLeft = Math.max(16, (vw - tooltipW) / 2);

  return (
    <div style={{
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
    }}>
      {/* Step label + skip */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 10 }}>
        <span style={{ fontSize:11, fontWeight:700, color: ACCENT, letterSpacing:'0.06em', textTransform:'uppercase' }}>
          Step {step.id} of {TOTAL}
        </span>
        <button
          onClick={onSkip}
          style={{
            background:'none', border:'none', cursor:'pointer',
            fontSize:12, fontWeight:600,
            color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)',
            padding:'2px 6px', borderRadius:6,
            WebkitTapHighlightColor:'transparent',
          }}
        >
          Skip
        </button>
      </div>

      {/* Progress bar */}
      <div style={{ display:'flex', gap:4, marginBottom:14 }}>
        {STEPS.map((_, i) => (
          <div key={i} style={{
            flex:1, height:3, borderRadius:2,
            background: i <= stepIndex
              ? ACCENT
              : (dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'),
            opacity: i < stepIndex ? 0.5 : 1,
            transition: 'background 0.3s',
          }} />
        ))}
      </div>

      {/* Title */}
      <div style={{ fontSize:15, fontWeight:700, color: dark ? '#fff' : '#111', marginBottom:6 }}>
        {step.title}
      </div>

      {/* Instruction — dynamic for step 1 */}
      <div style={{
        fontSize:13,
        color: dark ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.55)',
        lineHeight:1.55,
        marginBottom: step.manualAdvance ? 14 : 0,
      }}>
        {instruction || step.instruction}
      </div>

      {/* Manual advance */}
      {step.manualAdvance && (
        <button
          onClick={onNext}
          style={{
            width:'100%', height:42, border:'none', borderRadius:12,
            background: ACCENT, color:'#fff',
            fontSize:14, fontWeight:700, cursor:'pointer',
            WebkitTapHighlightColor:'transparent',
            marginTop: 14,
          }}
        >
          {stepIndex === TOTAL - 1 ? 'Finish 🎉' : 'Got it →'}
        </button>
      )}

      {/* Waiting indicator */}
      {!step.manualAdvance && (
        <div style={{
          marginTop: 10,
          fontSize: 11,
          color: dark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)',
          textAlign: 'center',
        }}>
          Complete the action above to continue ↑
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OnboardingTutorial({ navigate, onComplete, onSkip }) {
  const { dark } = useTheme();
  const [stepIndex, setStepIndex]         = useState(0);
  const [rect, setRect]                   = useState(null);
  const [dynamicInstruction, setDynamic]  = useState(null);
  const rafRef                            = useRef(null);
  const stepIndexRef                      = useRef(stepIndex);
  const step                              = STEPS[stepIndex];

  useEffect(() => { stepIndexRef.current = stepIndex; }, [stepIndex]);

  // Navigate to the correct page when step changes
  useEffect(() => {
    navigate(step.page);
  }, [stepIndex]); // eslint-disable-line

  // rAF loop — tracks the element rect AND (for step 1) the dynamic sub-target
  useEffect(() => {
    let running = true;

    function update() {
      if (!running) return;

      const currentStep = STEPS[stepIndexRef.current];
      let selector = currentStep.selector;
      let instruction = null;

      // Step 1: dynamically follow the user through the form
      if (currentStep.dynamic) {
        const state = getStep1State();
        selector = state.selector;
        instruction = state.instruction;
        setDynamic(instruction);
      }

      const el = document.querySelector(selector);
      if (el) {
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

  // Advance to next step (or complete)
  const advance = useCallback(() => {
    const next = stepIndexRef.current + 1;
    if (next < TOTAL) {
      setStepIndex(next);
      setDynamic(null);
    } else {
      onComplete();
    }
  }, [onComplete]);

  // Listen for completion event
  useEffect(() => {
    if (!step.advanceEvent) return;
    const handler = () => advance();
    window.addEventListener(step.advanceEvent, handler);
    return () => window.removeEventListener(step.advanceEvent, handler);
  }, [step.advanceEvent, advance]);

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
        onNext={advance}
      />
    </>
  );
}
