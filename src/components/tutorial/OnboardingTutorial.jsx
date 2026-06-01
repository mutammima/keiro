/**
 * OnboardingTutorial — 5-step first-time user onboarding with spotlight overlay.
 *
 * Spotlight: 4 fixed divs (top/bottom/left/right) that dim everything except
 * the target element, found via data-tutorial attribute. No clip-path, no canvas.
 *
 * Steps advance only when the user completes the required action (custom events),
 * except Step 4 which uses a manual "Got it" button.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { LIGHT, DARK, ACCENT } from '../../theme';

// ── Step definitions ──────────────────────────────────────────────────────────

const STEPS = [
  {
    id: 1,
    page: 'invoice',
    selector: '[data-tutorial="invoice-form"]',
    title: 'Create your first invoice',
    instruction: 'Enter a store name, add at least one product (name, qty, price), then tap Generate Invoice.',
    advanceEvent: 'inv-onboarding-invoice-created',
    manualAdvance: false,
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
const TOOLTIP_Z = 9200;
const PADDING = 12; // spotlight padding around element

// ── Spotlight component ───────────────────────────────────────────────────────

function Spotlight({ rect }) {
  if (!rect) {
    // full-screen dim when no element found yet
    return (
      <div style={{
        position: 'fixed', inset: 0,
        background: DIM_COLOR,
        zIndex: OVERLAY_Z,
        pointerEvents: 'none',
      }} />
    );
  }

  const top    = Math.max(0, rect.top    - PADDING);
  const left   = Math.max(0, rect.left   - PADDING);
  const right  = rect.right  + PADDING;
  const bottom = rect.bottom + PADDING;
  const w      = window.innerWidth;
  const h      = window.innerHeight;

  return (
    <>
      {/* Top */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: top, background: DIM_COLOR, zIndex: OVERLAY_Z, pointerEvents: 'none' }} />
      {/* Bottom */}
      <div style={{ position: 'fixed', top: bottom, left: 0, right: 0, bottom: 0, background: DIM_COLOR, zIndex: OVERLAY_Z, pointerEvents: 'none' }} />
      {/* Left */}
      <div style={{ position: 'fixed', top: top, left: 0, width: left, height: bottom - top, background: DIM_COLOR, zIndex: OVERLAY_Z, pointerEvents: 'none' }} />
      {/* Right */}
      <div style={{ position: 'fixed', top: top, left: right, right: 0, height: bottom - top, background: DIM_COLOR, zIndex: OVERLAY_Z, pointerEvents: 'none' }} />
    </>
  );
}

// ── Tooltip card ──────────────────────────────────────────────────────────────

function Tooltip({ step, stepIndex, rect, dark, onSkip, onNext }) {
  const C = dark ? DARK : LIGHT;

  // Position tooltip below spotlight (or above if near bottom)
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const tooltipWidth = Math.min(340, vw - 32);

  let tooltipTop;
  let tooltipLeft = Math.max(16, (vw - tooltipWidth) / 2);

  if (rect) {
    const bottom = rect.bottom + PADDING;
    const spaceBelow = vh - bottom;
    // Approximate tooltip height ~180px
    if (spaceBelow >= 196) {
      tooltipTop = bottom + 12;
    } else {
      tooltipTop = Math.max(16, rect.top - PADDING - 192);
    }
  } else {
    tooltipTop = vh / 2 - 90;
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: tooltipTop,
        left: tooltipLeft,
        width: tooltipWidth,
        zIndex: TOOLTIP_Z,
        background: dark ? '#1a1a1e' : '#ffffff',
        borderRadius: 20,
        padding: '18px 20px 16px',
        boxShadow: '0 16px 56px rgba(0,0,0,0.5)',
        border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'}`,
      }}
    >
      {/* Step indicator + skip */}
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
          Skip
        </button>
      </div>

      {/* Progress bar — 5 segments */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
        {STEPS.map((_, i) => (
          <div
            key={i}
            style={{
              flex: 1, height: 3, borderRadius: 2,
              background: i < stepIndex
                ? ACCENT
                : i === stepIndex
                  ? ACCENT
                  : (dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'),
              opacity: i === stepIndex ? 1 : i < stepIndex ? 0.6 : 1,
            }}
          />
        ))}
      </div>

      {/* Title */}
      <div style={{ fontSize: 15, fontWeight: 700, color: dark ? '#fff' : '#111', marginBottom: 6 }}>
        {step.title}
      </div>

      {/* Instruction */}
      <div style={{ fontSize: 13, color: dark ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.55)', lineHeight: 1.55, marginBottom: step.manualAdvance ? 14 : 0 }}>
        {step.instruction}
      </div>

      {/* Manual advance button */}
      {step.manualAdvance && (
        <button
          onClick={onNext}
          style={{
            width: '100%', height: 42, border: 'none', borderRadius: 12,
            background: ACCENT, color: '#fff',
            fontSize: 14, fontWeight: 700, cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {stepIndex === TOTAL - 1 ? 'Finish' : 'Got it →'}
        </button>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OnboardingTutorial({ navigate, onComplete, onSkip }) {
  const { dark } = useTheme();
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect]           = useState(null);
  const rafRef                    = useRef(null);
  const step                      = STEPS[stepIndex];

  // Navigate to the correct page when step changes
  useEffect(() => {
    navigate(step.page);
  }, [stepIndex]); // eslint-disable-line

  // rAF loop to keep the spotlight rect up to date
  useEffect(() => {
    let running = true;

    function update() {
      if (!running) return;
      const el = document.querySelector(step.selector);
      if (el) {
        const r = el.getBoundingClientRect();
        setRect(prev => {
          // Only update if meaningfully different (avoids re-render storm)
          if (!prev || Math.abs(prev.top - r.top) > 1 || Math.abs(prev.left - r.left) > 1 ||
              Math.abs(prev.width - r.width) > 1 || Math.abs(prev.height - r.height) > 1) {
            return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
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
  }, [step.selector]);

  // Listen for the advance event
  const advance = useCallback(() => {
    if (stepIndex < TOTAL - 1) {
      setStepIndex(i => i + 1);
    } else {
      onComplete();
    }
  }, [stepIndex, onComplete]);

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
        rect={rect}
        dark={dark}
        onSkip={onSkip}
        onNext={advance}
      />
    </>
  );
}
