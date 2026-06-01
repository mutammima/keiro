/**
 * InteractiveTutorial — "How it Works" walkthrough triggered from the NavDrawer.
 *
 * Improvements over the old version:
 *  • Beacon tracks actual DOM elements via data-tutorial selectors + rAF loop,
 *    so it stays on the right element even when the page has scrolled.
 *  • "Skip step →" navigates to the required page before advancing.
 *  • "Next →" auto-fills the relevant field(s) if the user hasn't done so yet,
 *    then moves focus to the next field before advancing the tutorial step.
 *  • Scroll containers are frozen during the tutorial (same approach as
 *    OnboardingTutorial) so the beacon doesn't drift off-screen.
 *  • A capture-phase click blocker prevents accidentally navigating away
 *    (only `click` is blocked, never touch events).
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { LIGHT, DARK, ACCENT } from '../../theme';

// ── helpers ───────────────────────────────────────────────────────────────────

function setNativeValue(el, value) {
  if (!el) return;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function focusSelector(sel) {
  const el = document.querySelector(sel);
  if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus(); }
}

// ── Step definitions ──────────────────────────────────────────────────────────
// selector   – data-tutorial / CSS selector for the beacon target
// navPage    – navigate() call when this step becomes active (and on skip)
// autoFill   – called when "Next →" is pressed; fills/clicks, returns false if
//              the step should NOT auto-advance (user must do something first)

const STEPS = [
  {
    title: 'Welcome to InvoiceGo 👋',
    instruction: "Let's walk through the app together. Tap Next → to go hands-free, or do each action yourself.",
    selector: null,
    navPage: null,
    autoFill: null,
    autoAdvanceOn: null,
  },
  {
    title: 'Step 1 — Open New Invoice',
    instruction: 'Tap the "New" button to open the invoice form.',
    selector: '[data-tutorial="tab-new"]',
    navPage: null,
    autoFill: () => {
      document.querySelector('[data-tutorial="tab-new"]')?.click();
    },
    autoAdvanceOn: 'invoice',
  },
  {
    title: 'Step 2 — Enter Store Name',
    instruction: "Type the name of the store you're delivering to.",
    selector: 'input[placeholder="Sunrise Deli"]',
    navPage: 'invoice',
    autoFill: () => {
      const el = document.querySelector('input[placeholder="Sunrise Deli"]');
      if (!el?.value?.trim()) setNativeValue(el, 'Corner Store');
      // Move focus to customer name
      setTimeout(() => focusSelector('input[placeholder="John Smith"]'), 80);
    },
    autoAdvanceOn: null,
  },
  {
    title: 'Step 3 — Enter Customer Name',
    instruction: 'Type the name of the customer receiving the delivery.',
    selector: 'input[placeholder="John Smith"]',
    navPage: 'invoice',
    autoFill: () => {
      const el = document.querySelector('input[placeholder="John Smith"]');
      if (!el?.value?.trim()) setNativeValue(el, 'Mike Johnson');
      setTimeout(() => focusSelector('input[placeholder="Marlboro Reds"]'), 80);
    },
    autoAdvanceOn: null,
  },
  {
    title: 'Step 4 — Add a Product',
    instruction: 'Enter a product name, quantity, and price, then tap + Add Item.',
    selector: '[data-tutorial="invoice-add-item"]',
    navPage: 'invoice',
    autoFill: () => {
      const prod  = document.querySelector('input[placeholder="Marlboro Reds"]');
      const qty   = document.querySelector('input[placeholder="1"]');
      const price = document.querySelector('input[placeholder="0.00"]');
      if (!prod?.value?.trim())  setNativeValue(prod,  'Marlboro Reds');
      if (!qty?.value?.trim())   setNativeValue(qty,   '2');
      if (!price?.value?.trim()) setNativeValue(price, '9.99');
      setTimeout(() => {
        Array.from(document.querySelectorAll('button'))
          .find(b => b.textContent.trim() === '+ Add Item')?.click();
      }, 250);
    },
    autoAdvanceOn: null,
  },
  {
    title: 'Step 5 — Generate the Invoice',
    instruction: 'Tap "Generate Invoice" to create a shareable PDF invoice.',
    selector: '[data-tutorial="invoice-generate"]',
    navPage: 'invoice',
    autoFill: () => {
      document.querySelector('[data-tutorial="invoice-generate"]')?.click();
    },
    autoAdvanceOn: 'invoice-view',
  },
  {
    title: 'Step 6 — Download or Share',
    instruction: 'Your invoice is ready! Tap "Download PDF" to save it, or "Share" to send it directly.',
    selector: null,
    navPage: null,
    autoFill: null,
    autoAdvanceOn: null,
  },
  {
    title: 'Step 7 — Invoice History',
    instruction: 'Tap "Invoices" to see all your past invoices. Tap any one to expand it.',
    selector: '[data-tutorial="tab-history"]',
    navPage: 'history',
    autoFill: () => {
      document.querySelector('[data-tutorial="tab-history"]')?.click();
    },
    autoAdvanceOn: null,
  },
  {
    title: 'Step 8 — Products Catalog',
    instruction: 'Tap "Products" to see your saved products. They auto-save every time you create an invoice.',
    selector: '[data-tutorial="tab-products"]',
    navPage: 'products',
    autoFill: () => {
      document.querySelector('[data-tutorial="tab-products"]')?.click();
    },
    autoAdvanceOn: null,
  },
  {
    title: 'Step 9 — Sidebar & Settings',
    instruction: 'Tap ☰ to access Reports, Store Info, Notes, and Settings.',
    selector: null, // hamburger is always accessible; no spotlight needed
    navPage: null,
    autoFill: null,
    autoAdvanceOn: null,
  },
  {
    title: "You're all set! 🎉",
    instruction: 'You now know how to use InvoiceGo. Your data syncs to the cloud automatically.',
    selector: null,
    navPage: null,
    autoFill: null,
    autoAdvanceOn: null,
  },
];

const TOTAL = STEPS.length;
const BEACON_Z = 5001;
const CARD_Z   = 5002;
const DIM_Z    = 5000;

// ── CSS keyframes injected once ───────────────────────────────────────────────

function ensureKeyframes() {
  if (document.getElementById('itut-kf')) return;
  const el = document.createElement('style');
  el.id = 'itut-kf';
  el.textContent = `
    @keyframes itut-pulse {
      0%   { transform:translate(-50%,-50%) scale(1);   opacity:0.85; }
      60%  { transform:translate(-50%,-50%) scale(2.2); opacity:0;    }
      100% { transform:translate(-50%,-50%) scale(2.2); opacity:0;    }
    }
    @keyframes itut-core {
      0%,100% { transform:translate(-50%,-50%) scale(1);    }
      50%      { transform:translate(-50%,-50%) scale(1.15); }
    }
  `;
  document.head.appendChild(el);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function InteractiveTutorial({ currentPage, navigate, onClose }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;
  const [stepIdx, setStepIdx] = useState(0);
  const [beaconPos, setBeaconPos] = useState(null); // { x, y } in px
  const stepIdxRef    = useRef(stepIdx);
  const currentRectRef = useRef(null);
  const rafRef        = useRef(null);

  useEffect(() => { stepIdxRef.current = stepIdx; }, [stepIdx]);
  useEffect(() => { ensureKeyframes(); }, []);

  const current = STEPS[stepIdx];
  const isFirst = stepIdx === 0;
  const isLast  = stepIdx === TOTAL - 1;

  // ── Navigate to step's page when step changes ────────────────────────────
  useEffect(() => {
    if (current.navPage && navigate) navigate(current.navPage);
  }, [stepIdx]); // eslint-disable-line

  // ── Freeze scroll during tutorial ────────────────────────────────────────
  useEffect(() => {
    const containers = Array.from(document.querySelectorAll('[data-scroll-container]'));
    const saved = containers.map(c => c.style.overflowY);
    containers.forEach(c => { c.style.overflowY = 'hidden'; });
    return () => containers.forEach((c, i) => { c.style.overflowY = saved[i]; });
  }, []);

  // ── Click blocker ────────────────────────────────────────────────────────
  useEffect(() => {
    function block(e) {
      // Allow programmatic clicks from autoFill (e.g. element.click())
      if (!e.isTrusted) return;
      if (e.target.closest?.('[data-itut-ui]')) return;
      const r = currentRectRef.current;
      if (r) {
        const pad = 16;
        if (e.clientX >= r.left - pad && e.clientX <= r.right  + pad &&
            e.clientY >= r.top  - pad && e.clientY <= r.bottom + pad) return;
      }
      e.stopPropagation();
      e.preventDefault();
    }
    document.addEventListener('click', block, true);
    return () => document.removeEventListener('click', block, true);
  }, []);

  // ── rAF: track beacon element rect ──────────────────────────────────────
  useEffect(() => {
    let running = true;

    function update() {
      if (!running) return;
      const sel = STEPS[stepIdxRef.current].selector;
      if (sel) {
        const el = document.querySelector(sel);
        if (el) {
          const r = el.getBoundingClientRect();
          currentRectRef.current = r;
          const cx = (r.left + r.right)  / 2;
          const cy = (r.top  + r.bottom) / 2;
          setBeaconPos(prev => {
            if (!prev || Math.abs(prev.x - cx) > 0.5 || Math.abs(prev.y - cy) > 0.5)
              return { x: cx, y: cy };
            return prev;
          });
        } else {
          currentRectRef.current = null;
          setBeaconPos(null);
        }
      } else {
        currentRectRef.current = null;
        setBeaconPos(null);
      }
      rafRef.current = requestAnimationFrame(update);
    }

    rafRef.current = requestAnimationFrame(update);
    return () => {
      running = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [stepIdx]);

  // ── Auto-advance when user navigates to expected page ────────────────────
  useEffect(() => {
    if (current.autoAdvanceOn && currentPage === current.autoAdvanceOn) {
      const t = setTimeout(() => setStepIdx(s => Math.min(s + 1, TOTAL - 1)), 700);
      return () => clearTimeout(t);
    }
  }, [currentPage, stepIdx]); // eslint-disable-line

  // ── Scroll into view when step changes ───────────────────────────────────
  useEffect(() => {
    const sel = current.selector;
    if (!sel) return;
    const t = setTimeout(() => {
      const el = document.querySelector(sel);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 400);
    return () => clearTimeout(t);
  }, [stepIdx, current.selector]);

  // ── Actions ──────────────────────────────────────────────────────────────

  const goNext = useCallback(() => {
    const s = STEPS[stepIdxRef.current];
    // Auto-fill the current step's field(s) if defined
    if (s.autoFill) s.autoFill();
    // For steps where fill triggers autoAdvanceOn, don't manually advance —
    // the autoAdvanceOn useEffect will pick it up. Otherwise advance now.
    if (!s.autoAdvanceOn) {
      setTimeout(() => setStepIdx(i => Math.min(i + 1, TOTAL - 1)), s.autoFill ? 150 : 0);
    }
    if (stepIdxRef.current === TOTAL - 1) onClose();
  }, [onClose]);

  const goBack = useCallback(() => {
    setStepIdx(i => Math.max(i - 1, 0));
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      {/* Semi-transparent backdrop */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: DIM_Z,
        background: 'rgba(0,0,0,0.40)',
        pointerEvents: 'none',
      }} />

      {/* Beacon — follows DOM element */}
      {beaconPos && (
        <div style={{
          position: 'fixed',
          left: beaconPos.x,
          top:  beaconPos.y,
          zIndex: BEACON_Z,
          pointerEvents: 'none',
        }}>
          <div style={{
            position: 'absolute',
            width: 52, height: 52, borderRadius: 26,
            background: ACCENT,
            transform: 'translate(-50%,-50%)',
            animation: 'itut-pulse 1.8s ease-out infinite',
          }} />
          <div style={{
            position: 'absolute',
            width: 20, height: 20, borderRadius: 10,
            background: ACCENT,
            border: '2.5px solid #fff',
            transform: 'translate(-50%,-50%)',
            animation: 'itut-core 1.8s ease-in-out infinite',
            boxShadow: '0 2px 14px rgba(74,123,247,0.7)',
          }} />
        </div>
      )}

      {/* Instruction card */}
      <div
        data-itut-ui="card"
        style={{
          position: 'fixed',
          bottom: 'max(16px, env(safe-area-inset-bottom))',
          left: 12, right: 12,
          zIndex: CARD_Z,
          background: dark ? '#141418' : '#ffffff',
          borderRadius: 20,
          padding: '16px 18px 14px',
          boxShadow: '0 8px 40px rgba(0,0,0,0.55)',
          border: `1px solid ${dark ? '#2a2a2a' : '#e4e4e7'}`,
        }}
      >
        {/* Progress bar */}
        <div style={{ display: 'flex', gap: 3, marginBottom: 12 }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{
              flex: 1, height: 3, borderRadius: 2,
              background: i <= stepIdx ? ACCENT : (dark ? '#2a2a2a' : '#e4e4e7'),
              transition: 'background 0.3s',
            }} />
          ))}
        </div>

        {/* Title */}
        <p style={{ color: C.text, fontSize: 15, fontWeight: 800, margin: '0 0 5px', lineHeight: 1.3 }}>
          {current.title}
        </p>

        {/* Instruction */}
        <p style={{ color: C.textMuted, fontSize: 13, margin: '0 0 12px', lineHeight: 1.55 }}>
          {current.instruction}
        </p>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {!isFirst && (
            <button onClick={goBack} style={{
              background: dark ? '#1e1e1e' : '#f4f4f5',
              border: 'none', borderRadius: 12,
              color: C.textMuted, fontSize: 14, fontWeight: 600,
              padding: '10px 16px', cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
            }}>← Back</button>
          )}

          <button onClick={onClose} style={{
            background: 'none', border: 'none',
            color: C.textLight || C.textMuted, fontSize: 13, fontWeight: 500,
            cursor: 'pointer', padding: '10px 8px',
            WebkitTapHighlightColor: 'transparent',
            marginLeft: isFirst ? 0 : 'auto',
          }}>
            {isFirst ? 'Skip tutorial' : 'Exit'}
          </button>

          {isFirst && <div style={{ flex: 1 }} />}

          <button onClick={goNext} style={{
            flex: isFirst ? undefined : 1,
            background: ACCENT, border: 'none', borderRadius: 12,
            color: '#fff', fontSize: 15, fontWeight: 700,
            padding: '11px 20px', cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
            boxShadow: '0 4px 14px rgba(74,123,247,0.4)',
          }}>
            {isLast ? 'Start using the app ✓' : 'Next →'}
          </button>
        </div>
      </div>
    </>
  );
}
