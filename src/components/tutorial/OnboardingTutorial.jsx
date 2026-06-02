/**
 * OnboardingTutorial — Step-based autoplay demo.
 *
 * Each step plays its animation automatically, then PAUSES and waits for the
 * user to press "Next →" or "↩ See it again" (which replays the same step).
 *
 * Steps:
 *   1. Set business name   (New Invoice page — tap the name at top, type)
 *   2. Create an invoice   (New tab — store, item, generate)
 *   3. Invoices page       (expand invoice + cycle status badge)
 *   4. Store balance       (tap store name → back)
 *   5. Products            (auto-saved products + mention removal)
 */

import { useState, useEffect, useRef } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { ACCENT } from '../../theme';

// ── Constants ─────────────────────────────────────────────────────────────────

const TOTAL     = 5;
const OVERLAY_Z = 9100;
const TOOLTIP_Z = 9200;
const CURSOR_Z  = 9300;
const PAD       = 5;

// ── React-friendly input value setter ────────────────────────────────────────

function setNativeValue(el, value) {
  if (!el) return;
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  ).set;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

// ── Visual cursor dot ─────────────────────────────────────────────────────────

function VisualCursor({ pos, pulse }) {
  return (
    <div
      style={{
        position:   'fixed',
        left:       pos.x - 11,
        top:        pos.y - 11,
        width:      22,
        height:     22,
        borderRadius: '50%',
        background: pulse ? ACCENT : 'rgba(255,255,255,0.93)',
        border:     `2.5px solid ${ACCENT}`,
        zIndex:     CURSOR_Z,
        pointerEvents: 'none',
        transition: [
          'left 0.42s cubic-bezier(0.4,0,0.2,1)',
          'top  0.42s cubic-bezier(0.4,0,0.2,1)',
          'background 0.14s',
          'transform  0.14s',
          'box-shadow 0.14s',
        ].join(', '),
        transform:  pulse ? 'scale(0.6)' : 'scale(1)',
        boxShadow:  pulse
          ? `0 0 0 8px rgba(74,123,247,0.28), 0 0 0 16px rgba(74,123,247,0.1)`
          : '0 2px 10px rgba(0,0,0,0.4)',
      }}
    />
  );
}

// ── Spotlight (4 opaque panels + glow ring) ───────────────────────────────────

function Spotlight({ rect }) {
  const stopTouch = e => e.preventDefault();

  const base = {
    position:    'fixed',
    background:  'transparent',
    zIndex:      OVERLAY_Z,
    pointerEvents: 'all',
    touchAction: 'none',
    WebkitUserSelect: 'none',
    userSelect:  'none',
  };

  if (!rect) {
    return <div style={{ ...base, inset: 0 }} onTouchMove={stopTouch} />;
  }

  const top    = Math.max(0, rect.top    - PAD);
  const left   = Math.max(0, rect.left   - PAD);
  const right  = Math.min(window.innerWidth,  rect.right  + PAD);
  const bottom = Math.min(window.innerHeight, rect.bottom + PAD);
  const w = right - left;
  const h = bottom - top;

  if (bottom <= 0 || top >= window.innerHeight || w <= 0 || h <= 0) {
    return <div style={{ ...base, inset: 0 }} onTouchMove={stopTouch} />;
  }

  const pp = { onTouchMove: stopTouch };

  return (
    <>
      <div style={{ ...base, top: 0,      left: 0,     right: 0,    height: top    }} {...pp} />
      <div style={{ ...base, top: bottom, left: 0,     right: 0,    bottom: 0      }} {...pp} />
      <div style={{ ...base, top,         left: 0,     width: left, height: h      }} {...pp} />
      <div style={{ ...base, top,         left: right, right: 0,    height: h      }} {...pp} />
      <div style={{
        position: 'fixed', top, left, width: w, height: h,
        zIndex:   OVERLAY_Z + 1,
        pointerEvents: 'none',
        borderRadius: 10,
        boxShadow: `0 0 0 2.5px ${ACCENT}, 0 0 0 5px rgba(74,123,247,0.32), 0 0 22px 7px rgba(74,123,247,0.14)`,
      }} />
    </>
  );
}

// ── Tooltip card ──────────────────────────────────────────────────────────────

function Tooltip({ stepId, title, desc, rect, dark, phase, isLast, onSkip, onNext, onSeeAgain }) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const tooltipW  = Math.min(320, vw - 32);
  const TOOLTIP_H = phase === 'waiting' ? 210 : 170;

  const visTop    = rect ? Math.max(0, Math.min(vh, rect.top))    : vh * 0.6;
  const visBottom = rect ? Math.max(0, Math.min(vh, rect.bottom)) : vh * 0.6;
  const elementCenter = (visTop + visBottom) / 2;

  let tooltipTop = elementCenter > vh / 2
    ? visTop  - PAD - TOOLTIP_H - 14
    : visBottom + PAD + 14;
  tooltipTop = Math.max(8, Math.min(vh - TOOLTIP_H - 8, tooltipTop));

  return (
    <div
      data-tutorial-ui="tooltip"
      style={{
        position:   'fixed',
        top:        tooltipTop,
        left:       Math.max(16, (vw - tooltipW) / 2),
        width:      tooltipW,
        zIndex:     TOOLTIP_Z,
        background: dark ? '#1c1c20' : '#ffffff',
        borderRadius: 18,
        padding:    '14px 16px 13px',
        boxShadow:  '0 16px 48px rgba(0,0,0,0.52)',
        border:     `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'}`,
        touchAction: 'none',
        WebkitUserSelect: 'none',
        userSelect: 'none',
      }}
    >
      {/* Step label + Skip */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: ACCENT, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Step {stepId} of {TOTAL}
        </span>
        <button
          data-tutorial-ui="skip-btn"
          onClick={onSkip}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 12, fontWeight: 600,
            color: dark ? 'rgba(255,255,255,0.32)' : 'rgba(0,0,0,0.28)',
            padding: '2px 6px', borderRadius: 6,
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          Skip
        </button>
      </div>

      {/* Progress bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        {Array.from({ length: TOTAL }).map((_, i) => (
          <div key={i} style={{
            flex: 1, height: 3, borderRadius: 2,
            background: i < stepId
              ? ACCENT
              : (dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'),
            opacity: i < stepId - 1 ? 0.45 : 1,
            transition: 'background 0.3s',
          }} />
        ))}
      </div>

      {/* Title */}
      <div style={{ fontSize: 13, fontWeight: 700, color: dark ? '#fff' : '#111', marginBottom: 4 }}>
        {title}
      </div>

      {/* Description */}
      <div style={{ fontSize: 12, color: dark ? 'rgba(255,255,255,0.56)' : 'rgba(0,0,0,0.5)', lineHeight: 1.55 }}>
        {desc}
      </div>

      {/* Action buttons — shown only when step animation is done */}
      {phase === 'waiting' && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button
            data-tutorial-ui="see-again-btn"
            onClick={onSeeAgain}
            style={{
              flex: 1,
              height: 38, borderRadius: 12, border: 'none',
              background: dark ? '#2a2a30' : '#f0f0f3',
              color: dark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            ↩ Again
          </button>
          <button
            data-tutorial-ui="next-btn"
            onClick={onNext}
            style={{
              flex: 2,
              height: 38, borderRadius: 12, border: 'none',
              background: ACCENT,
              color: '#fff',
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
              boxShadow: '0 4px 14px rgba(74,123,247,0.4)',
            }}
          >
            {isLast ? 'Start using the app ✓' : 'Next →'}
          </button>
        </div>
      )}

      {/* Playing indicator */}
      {phase === 'playing' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
          <div style={{
            width: 6, height: 6, borderRadius: 3,
            background: ACCENT,
            animation: 'tut-blink 1.1s ease-in-out infinite',
          }} />
          <span style={{ fontSize: 11, color: dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.3)', fontWeight: 500 }}>
            Watch the demo…
          </span>
        </div>
      )}
    </div>
  );
}

// ── Blink keyframe (injected once) ────────────────────────────────────────────

function ensureKeyframes() {
  if (document.getElementById('tut-kf')) return;
  const el = document.createElement('style');
  el.id = 'tut-kf';
  el.textContent = `
    @keyframes tut-blink {
      0%,100% { opacity: 1; }
      50%      { opacity: 0.2; }
    }
  `;
  document.head.appendChild(el);
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OnboardingTutorial({ navigate, onComplete, onSkip }) {
  const { dark } = useTheme();

  const [cursorPos,   setCursorPos]   = useState({ x: -100, y: -100 });
  const [cursorPulse, setCursorPulse] = useState(false);
  const [rect,        setRect]        = useState(null);
  const [tooltip,     setTooltip]     = useState({ stepId: 1, title: 'Welcome to InvoGo!', desc: '' });
  const [stepIdx,     setStepIdx]     = useState(0);   // 0-based
  const [replayKey,   setReplayKey]   = useState(0);   // increment to replay current step
  const [phase,       setPhase]       = useState('playing'); // 'playing' | 'waiting'

  const abortRef = useRef(false);

  useEffect(() => { ensureKeyframes(); }, []);

  // ── Touch + click lock ────────────────────────────────────────────────────
  useEffect(() => {
    const savedBodyOverflow = document.body.style.overflow;
    const savedBodyPosition = document.body.style.position;
    const savedHtmlOverflow = document.documentElement.style.overflow;
    const savedScrollY      = window.scrollY;

    document.body.style.overflow            = 'hidden';
    document.body.style.position            = 'fixed';
    document.body.style.top                 = `-${savedScrollY}px`;
    document.body.style.width               = '100%';
    document.documentElement.style.overflow = 'hidden';

    const stopTouch = e => e.preventDefault();
    document.addEventListener('touchmove', stopTouch, { passive: false });

    function blockClicks(e) {
      if (!e.isTrusted) return;
      if (e.target.closest?.('[data-tutorial-ui]')) return;
      e.stopPropagation();
      e.preventDefault();
    }
    document.addEventListener('click', blockClicks, true);

    return () => {
      document.body.style.overflow  = savedBodyOverflow;
      document.body.style.position  = savedBodyPosition;
      document.body.style.top       = '';
      document.body.style.width     = '';
      document.documentElement.style.overflow = savedHtmlOverflow;
      window.scrollTo(0, savedScrollY);
      document.removeEventListener('touchmove', stopTouch);
      document.removeEventListener('click', blockClicks, true);
    };
  }, []);

  // ── Run step sequence when stepIdx or replayKey changes ──────────────────
  useEffect(() => {
    abortRef.current = false;
    setPhase('playing');
    setRect(null);
    setCursorPos({ x: -100, y: -100 });

    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const show  = (stepId, title, desc) => setTooltip({ stepId, title, desc });

    async function moveTo(elOrSelector) {
      if (abortRef.current) return null;
      const el = typeof elOrSelector === 'string'
        ? document.querySelector(elOrSelector)
        : elOrSelector;
      if (!el) return null;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await sleep(420);
      if (abortRef.current) return null;
      const r = el.getBoundingClientRect();
      setCursorPos({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
      setRect({ top: r.top, left: r.left, right: r.right, bottom: r.bottom });
      await sleep(480);
      return el;
    }

    async function tap(elOrSelector) {
      if (abortRef.current) return;
      const el = await moveTo(elOrSelector);
      if (!el) return;
      setCursorPulse(true);
      await sleep(170);
      el.click();
      await sleep(210);
      setCursorPulse(false);
      await sleep(320);
    }

    async function type(elOrSelector, text) {
      if (abortRef.current) return;
      const el = await moveTo(elOrSelector);
      if (!el) return;
      setNativeValue(el, '');
      await sleep(90);
      for (let i = 1; i <= text.length; i++) {
        if (abortRef.current) break;
        setNativeValue(el, text.slice(0, i));
        await sleep(52);
      }
      await sleep(260);
    }

    // ── Step sequences ────────────────────────────────────────────────────

    async function step1_businessName() {
      navigate('invoice');
      await sleep(1000);
      setRect(null);
      show(1, 'Set your business name', 'Tap your business name at the top of the invoice — it prints on every invoice you generate.');
      await sleep(1600);

      // Tap the business name button to enter edit mode
      await tap('[data-tutorial="invoice-biz-name-btn"]');
      await sleep(400);

      // Type new name into the input
      show(1, 'Type your business name', 'This appears at the top of every PDF invoice.');
      const inputEl = document.querySelector('[data-tutorial="invoice-biz-name-input"]');
      if (inputEl) {
        await moveTo(inputEl);
        setNativeValue(inputEl, '');
        await sleep(90);
        const name = 'J&Y Distributions';
        for (let i = 1; i <= name.length; i++) {
          if (abortRef.current) break;
          setNativeValue(inputEl, name.slice(0, i));
          await sleep(55);
        }
        await sleep(400);
        // Blur to save
        inputEl.dispatchEvent(new Event('blur', { bubbles: true }));
        await sleep(500);
      }

      show(1, 'Business name saved!', 'Every invoice you create will now show your business name.');
      await sleep(1200);
    }

    async function step2_createInvoice() {
      navigate('invoice');
      await sleep(900);
      setRect(null);
      show(2, 'Create an invoice', 'Fill in the store details, add the products you delivered, then generate the invoice.');
      await sleep(1700);

      await moveTo('[data-tutorial="invoice-store-name"]');
      show(2, 'Enter store details', 'Type the store name and contact person.');
      await sleep(350);
      await type('input[placeholder="Sunrise Deli"]', 'Corner Store');
      await type('input[placeholder="John Smith"]',   'Mike Johnson');
      await sleep(300);

      await moveTo('[data-tutorial="invoice-add-item"]');
      show(2, 'Add a product', 'Enter the item name, quantity and price, then tap + Add Item.');
      await sleep(550);
      await type('input[placeholder="GMan V Cut T-Shirt"]', 'GMan V Cut T-Shirt');

      const qtyEl = document.querySelector('input[placeholder="1"]');
      if (qtyEl) {
        await moveTo(qtyEl);
        setNativeValue(qtyEl, '');
        await sleep(80);
        setNativeValue(qtyEl, '2');
        qtyEl.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(260);
      }

      await type('input[placeholder="0.00"]', '9.99');

      const addBtn = Array.from(document.querySelectorAll('button'))
        .find(b => b.textContent.trim() === '+ Add Item');
      if (addBtn) {
        await tap(addBtn);
        await sleep(500);
      }

      await moveTo('[data-tutorial="invoice-generate"]');
      show(2, 'Generate the invoice', 'Tap Generate to save and record this invoice.');
      await sleep(550);
      await tap('[data-tutorial="invoice-generate"]');
      await sleep(1300);
    }

    async function step3_invoicesPage() {
      navigate('history');
      await sleep(900);
      setRect(null);
      show(3, 'Your Invoices page', 'Every invoice you create appears here. Tap an invoice to expand it and see all the details.');
      await sleep(1800);

      // Expand the latest invoice
      await moveTo('[data-tutorial="invoice-expand-latest"]');
      show(3, 'Tap to expand', 'Tap an invoice row to see the itemised breakdown.');
      await sleep(500);
      await tap('[data-tutorial="invoice-expand-latest"]');
      await sleep(900);

      // Cycle the status badge
      await moveTo('[data-tutorial="status-badge-latest"]');
      show(3, 'Mark as Paid, Unpaid or Partial', 'Tap the status badge to cycle through payment states. Tap again to change it.');
      await sleep(600);
      await tap('[data-tutorial="status-badge-latest"]');  // Unpaid → Paid
      await sleep(700);
      await tap('[data-tutorial="status-badge-latest"]');  // Paid → Partial
      await sleep(700);
      await tap('[data-tutorial="status-badge-latest"]');  // Partial → Unpaid
      await sleep(800);
    }

    async function step4_storeBalance() {
      show(4, 'Track store balances', 'Tap a store name to see the full payment history and running balance for that store.');
      await moveTo('[data-tutorial="store-name-link"]');
      await sleep(550);
      await tap('[data-tutorial="store-name-link"]');
      await sleep(1800);

      const backBtn = Array.from(document.querySelectorAll('button'))
        .find(b => b.textContent.includes('Back') || b.textContent.includes('←'));
      if (backBtn) {
        await tap(backBtn);
      } else {
        navigate('history');
      }
      await sleep(700);
      setRect(null);
      show(4, 'Running balance', 'You can always come back here to see how much a store owes you.');
      await sleep(1200);
    }

    async function step5_products() {
      navigate('products');
      await sleep(900);
      setRect(null);
      show(5, 'Products auto-save', 'Every item you sell is saved here automatically — no manual entry needed. Next time, InvoGo auto-fills product details for you.');
      await moveTo('[data-tutorial="products-list"]');
      await sleep(1200);
      show(5, 'Remove products anytime', 'You can swipe or long-press any product to remove it from the list whenever you need to.');
      await sleep(2000);
    }

    const steps = [
      step1_businessName,
      step2_createInvoice,
      step3_invoicesPage,
      step4_storeBalance,
      step5_products,
    ];

    async function runStep() {
      const fn = steps[stepIdx];
      if (fn) await fn();
      if (!abortRef.current) setPhase('waiting');
    }

    runStep();
    return () => { abortRef.current = true; };
  }, [stepIdx, replayKey]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleNext() {
    if (stepIdx >= TOTAL - 1) {
      onComplete();
    } else {
      setStepIdx(s => s + 1);
    }
  }

  function handleSeeAgain() {
    setReplayKey(k => k + 1);
  }

  return (
    <>
      <Spotlight rect={rect} />
      <VisualCursor pos={cursorPos} pulse={cursorPulse} />
      <Tooltip
        stepId={tooltip.stepId}
        title={tooltip.title}
        desc={tooltip.desc}
        rect={rect}
        dark={dark}
        phase={phase}
        isLast={stepIdx === TOTAL - 1}
        onSkip={onSkip}
        onNext={handleNext}
        onSeeAgain={handleSeeAgain}
      />
    </>
  );
}
