/**
 * OnboardingTutorial — Step-based autoplay demo with mid-step and end-step pauses.
 *
 * Each step:
 *   1. Shows an intro tooltip → user presses "Next →" to start the demo
 *   2. Autoplay animation runs (cursor moves, types, taps)
 *   3. Pauses at the end with "Again" + "Next →"
 *      – "Again" replays the whole step from scratch
 *      – "Next →" advances to the next step
 *
 * Some steps have additional mid-step pauses (e.g. expand then collapse
 * invoice requires two separate Next presses).
 *
 * Steps:
 *   1. Set business name   (New Invoice page — tap name at top, type)
 *   2. Create an invoice   (New tab — store, item, generate)
 *   3. Invoices page       (expand → status cycling → Next collapses → Next advances)
 *   4. Store balance       (tap store name → balance page → Next goes back)
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

// ── React-friendly input setter ───────────────────────────────────────────────

function setNativeValue(el, value) {
  if (!el) return;
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  ).set;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

// ── Visual cursor ─────────────────────────────────────────────────────────────

function VisualCursor({ pos, pulse }) {
  return (
    <div style={{
      position: 'fixed',
      left: pos.x - 11,
      top:  pos.y - 11,
      width: 22, height: 22, borderRadius: '50%',
      background: pulse ? ACCENT : 'rgba(255,255,255,0.93)',
      border: `2.5px solid ${ACCENT}`,
      zIndex: CURSOR_Z,
      pointerEvents: 'none',
      transition: [
        'left 0.42s cubic-bezier(0.4,0,0.2,1)',
        'top  0.42s cubic-bezier(0.4,0,0.2,1)',
        'background 0.14s', 'transform 0.14s', 'box-shadow 0.14s',
      ].join(', '),
      transform:  pulse ? 'scale(0.6)' : 'scale(1)',
      boxShadow: pulse
        ? '0 0 0 8px rgba(74,123,247,0.28), 0 0 0 16px rgba(74,123,247,0.1)'
        : '0 2px 10px rgba(0,0,0,0.4)',
    }} />
  );
}

// ── Spotlight ─────────────────────────────────────────────────────────────────

function Spotlight({ rect }) {
  const stopTouch = e => e.preventDefault();
  const base = {
    position: 'fixed', background: 'transparent',
    zIndex: OVERLAY_Z, pointerEvents: 'all',
    touchAction: 'none', WebkitUserSelect: 'none', userSelect: 'none',
  };

  if (!rect) return <div style={{ ...base, inset: 0 }} onTouchMove={stopTouch} />;

  const top    = Math.max(0, rect.top    - PAD);
  const left   = Math.max(0, rect.left   - PAD);
  const right  = Math.min(window.innerWidth,  rect.right  + PAD);
  const bottom = Math.min(window.innerHeight, rect.bottom + PAD);
  const w = right - left, h = bottom - top;

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
        zIndex: OVERLAY_Z + 1, pointerEvents: 'none', borderRadius: 10,
        boxShadow: `0 0 0 2.5px ${ACCENT}, 0 0 0 5px rgba(74,123,247,0.32), 0 0 22px 7px rgba(74,123,247,0.14)`,
      }} />
    </>
  );
}

// ── Tooltip ───────────────────────────────────────────────────────────────────
// phase: 'playing' | 'mid-pause' | 'end-pause'

function Tooltip({ stepId, title, desc, rect, dark, phase, isLast, onSkip, onNext, onSeeAgain }) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const tooltipW  = Math.min(320, vw - 32);
  const TOOLTIP_H = phase !== 'playing' ? 215 : 175;

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
        position: 'fixed',
        top:  tooltipTop,
        left: Math.max(16, (vw - tooltipW) / 2),
        width: tooltipW,
        zIndex: TOOLTIP_Z,
        background: dark ? '#1c1c20' : '#ffffff',
        borderRadius: 18,
        padding: '14px 16px 13px',
        boxShadow: '0 16px 48px rgba(0,0,0,0.52)',
        border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'}`,
        touchAction: 'none', WebkitUserSelect: 'none', userSelect: 'none',
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
        >Skip</button>
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

      {/* Buttons — mid-pause: Next only; end-pause: Again + Next */}
      {phase !== 'playing' && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {phase === 'end-pause' && (
            <button
              data-tutorial-ui="see-again-btn"
              onClick={onSeeAgain}
              style={{
                flex: 1, height: 38, borderRadius: 12, border: 'none',
                background: dark ? '#2a2a30' : '#f0f0f3',
                color: dark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)',
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
              }}
            >Again</button>
          )}
          <button
            data-tutorial-ui="next-btn"
            onClick={onNext}
            style={{
              flex: phase === 'end-pause' ? 2 : 1,
              height: 38, borderRadius: 12, border: 'none',
              background: ACCENT, color: '#fff',
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
              boxShadow: '0 4px 14px rgba(74,123,247,0.4)',
            }}
          >
            {phase === 'mid-pause'
              ? 'Next →'
              : isLast ? 'Start using the app' : 'Next →'}
          </button>
        </div>
      )}

      {/* Playing indicator */}
      {phase === 'playing' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
          <div style={{
            width: 6, height: 6, borderRadius: 3, background: ACCENT,
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

// ── Keyframes ─────────────────────────────────────────────────────────────────

function ensureKeyframes() {
  if (document.getElementById('tut-kf')) return;
  const el = document.createElement('style');
  el.id = 'tut-kf';
  el.textContent = `@keyframes tut-blink { 0%,100%{opacity:1} 50%{opacity:0.2} }`;
  document.head.appendChild(el);
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OnboardingTutorial({ navigate, onComplete, onSkip }) {
  const { dark } = useTheme();

  const [cursorPos,   setCursorPos]   = useState({ x: -100, y: -100 });
  const [cursorPulse, setCursorPulse] = useState(false);
  const [rect,        setRect]        = useState(null);
  const [tooltip,     setTooltip]     = useState({ stepId: 1, title: '', desc: '' });
  const [stepIdx,     setStepIdx]     = useState(0);
  const [replayKey,   setReplayKey]   = useState(0);
  const [phase,       setPhase]       = useState('playing');

  // Resolver for waitForUser() — set when paused, called when Next is pressed
  const nextResolverRef = useRef(null);
  const abortRef        = useRef(false);

  useEffect(() => { ensureKeyframes(); }, []);

  // ── Lock body scroll + block user taps ───────────────────────────────────
  useEffect(() => {
    const so = document.body.style.overflow;
    const sp = document.body.style.position;
    const ho = document.documentElement.style.overflow;
    const sy = window.scrollY;

    document.body.style.overflow            = 'hidden';
    document.body.style.position            = 'fixed';
    document.body.style.top                 = `-${sy}px`;
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
      document.body.style.overflow  = so;
      document.body.style.position  = sp;
      document.body.style.top       = '';
      document.body.style.width     = '';
      document.documentElement.style.overflow = ho;
      window.scrollTo(0, sy);
      document.removeEventListener('touchmove', stopTouch);
      document.removeEventListener('click', blockClicks, true);
    };
  }, []);

  // ── Run step when stepIdx or replayKey changes ────────────────────────────
  useEffect(() => {
    abortRef.current = false;
    setPhase('playing');
    setRect(null);
    setCursorPos({ x: -100, y: -100 });
    setCursorPulse(false);

    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const show  = (id, title, desc) => setTooltip({ stepId: id, title, desc });

    /**
     * Pause execution and wait for the user to press Next.
     * phase='mid-pause' → shows only Next (no Again).
     * phase='end-pause' → shows Again + Next (end of step).
     */
    async function waitForUser(isEnd = false) {
      if (abortRef.current) return;
      setPhase(isEnd ? 'end-pause' : 'mid-pause');
      await new Promise(resolve => { nextResolverRef.current = resolve; });
      if (!abortRef.current) setPhase('playing');
    }

    async function moveTo(elOrSelector) {
      if (abortRef.current) return null;
      const el = typeof elOrSelector === 'string'
        ? document.querySelector(elOrSelector) : elOrSelector;
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

    // ════════════════════════════════════════════════════════════════════════
    // STEP 1 — Business name
    // ════════════════════════════════════════════════════════════════════════
    async function step1_businessName() {
      navigate('invoice');
      await sleep(1000);
      setRect(null);

      // Intro pause — user reads before demo starts
      show(1, 'Set your business name', 'Your business name prints at the top of every invoice. Tap it to edit it right here on the New Invoice page.');
      await waitForUser(false);
      if (abortRef.current) return;

      // Demo: tap edit button → type name → blur to save
      await tap('[data-tutorial="invoice-biz-name-btn"]');
      await sleep(400);

      show(1, 'Type your business name', 'This appears on every PDF you send to customers.');
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
        await sleep(500);
        inputEl.dispatchEvent(new Event('blur', { bubbles: true }));
        await sleep(600);
      }

      setRect(null);
      show(1, 'Business name saved!', 'Every new invoice will now show your business name at the top.');
      await waitForUser(true); // end-pause: Again or Next
    }

    // ════════════════════════════════════════════════════════════════════════
    // STEP 2 — Create an invoice
    // ════════════════════════════════════════════════════════════════════════
    async function step2_createInvoice() {
      navigate('invoice');
      await sleep(900);
      setRect(null);

      // Intro pause
      show(2, 'Create an invoice', 'Fill in the store name, customer, and the products you delivered. Then hit Generate.');
      await waitForUser(false);
      if (abortRef.current) return;

      // Demo: fill store + customer
      await moveTo('[data-tutorial="invoice-store-name"]');
      show(2, 'Enter store details', 'Who are you delivering to?');
      await sleep(300);
      await type('input[placeholder="Sunrise Deli"]', 'Corner Store');
      await type('input[placeholder="John Smith"]',   'Mike Johnson');
      await sleep(300);

      // Demo: add item
      await moveTo('[data-tutorial="invoice-add-item"]');
      show(2, 'Add your products', 'Name, quantity, price — then tap + Add Item.');
      await sleep(400);
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
      if (addBtn) { await tap(addBtn); await sleep(500); }

      // Demo: generate
      await moveTo('[data-tutorial="invoice-generate"]');
      show(2, 'Generate the invoice', 'Tap Generate to save the invoice and get a shareable PDF.');
      await sleep(600);
      await tap('[data-tutorial="invoice-generate"]');
      await sleep(1400);

      setRect(null);
      show(2, 'Invoice created!', 'Your invoice is saved. You can download the PDF, share it via WhatsApp, or tap New Invoice to start another.');
      await waitForUser(true); // end-pause
    }

    // ════════════════════════════════════════════════════════════════════════
    // STEP 3 — Invoices page: expand, status badge, collapse
    // ════════════════════════════════════════════════════════════════════════
    async function step3_invoicesPage() {
      navigate('history');
      await sleep(900);
      setRect(null);

      // Intro pause
      show(3, 'Your Invoices page', 'Every invoice you create shows up here. Tap any invoice to expand it and see the full breakdown.');
      await waitForUser(false);
      if (abortRef.current) return;

      // Demo: expand the latest invoice
      await moveTo('[data-tutorial="invoice-expand-latest"]');
      show(3, 'Tap to expand', 'Tap the invoice row to see all the items inside.');
      await sleep(400);
      await tap('[data-tutorial="invoice-expand-latest"]'); // expands
      await sleep(900);

      // Demo: show status badge and cycle it
      await moveTo('[data-tutorial="status-badge-latest"]');
      show(3, 'Change payment status', 'Tap the status badge to cycle through Unpaid, Paid, and Partial — update it whenever you collect payment.');
      await sleep(800);
      await tap('[data-tutorial="status-badge-latest"]'); // → Paid
      await sleep(600);
      await tap('[data-tutorial="status-badge-latest"]'); // → Partial
      await sleep(600);
      await tap('[data-tutorial="status-badge-latest"]'); // → Unpaid
      await sleep(700);

      // Mid-pause: user presses Next to collapse
      setRect(null);
      show(3, 'Got it?', 'Tap Next to collapse the invoice.');
      await waitForUser(false); // mid-pause — Next collapses
      if (abortRef.current) return;

      // Collapse the invoice
      await tap('[data-tutorial="invoice-expand-latest"]');
      await sleep(700);
      setRect(null);

      // End-pause
      show(3, 'Invoices page done!', 'Expand any invoice anytime to review details or update its payment status.');
      await waitForUser(true); // end-pause — Again or Next
    }

    // ════════════════════════════════════════════════════════════════════════
    // STEP 4 — Store balance
    // ════════════════════════════════════════════════════════════════════════
    async function step4_storeBalance() {
      // Make sure we're on history
      navigate('history');
      await sleep(700);
      setRect(null);

      // Intro pause
      show(4, 'Track store balances', 'Tap any store name to see the full payment history and running balance for that store.');
      await waitForUser(false);
      if (abortRef.current) return;

      // Demo: tap store name → StoreBalance overlay
      await moveTo('[data-tutorial="store-name-link"]');
      show(4, 'Tap the store name', 'This opens a full balance breakdown for that store.');
      await sleep(500);
      await tap('[data-tutorial="store-name-link"]');
      await sleep(1800);

      // Mid-pause: user sees the balance page, presses Next to go back
      show(4, 'Running balance', 'See exactly what each store owes you. Tap Next to go back.');
      await waitForUser(false); // mid-pause
      if (abortRef.current) return;

      // Navigate back
      const backBtn = Array.from(document.querySelectorAll('button'))
        .find(b => b.textContent.includes('Back') || b.textContent.includes('←'));
      if (backBtn) { await tap(backBtn); } else { navigate('history'); }
      await sleep(700);
      setRect(null);

      show(4, 'Store balances tracked!', 'You can access every store\'s balance any time from the Invoices page.');
      await waitForUser(true); // end-pause
    }

    // ════════════════════════════════════════════════════════════════════════
    // STEP 5 — Products
    // ════════════════════════════════════════════════════════════════════════
    async function step5_products() {
      navigate('products');
      await sleep(900);
      setRect(null);

      // Intro pause
      show(5, 'Products auto-save', 'Every item you sell is saved here automatically — no manual entry needed. InvoGo autofills product names and prices next time you invoice.');
      await waitForUser(false);
      if (abortRef.current) return;

      // Demo: spotlight the list
      await moveTo('[data-tutorial="products-list"]');
      show(5, 'Your product catalogue', 'Products grow automatically as you invoice. You can also swipe or long-press any product to remove it from the list.');
      await sleep(2200);

      setRect(null);
      show(5, "You're ready to go!", 'That covers everything. Tap below to start using InvoGo.');
      await waitForUser(true); // end-pause (shows "Start using the app")
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
      // Step function ended naturally (not aborted) — advance to next step
      if (!abortRef.current) {
        if (stepIdx >= TOTAL - 1) {
          onComplete();
        } else {
          setStepIdx(s => s + 1);
        }
      }
    }

    runStep();

    return () => {
      abortRef.current = true;
      // Unblock any pending waitForUser so the async chain can unwind
      if (nextResolverRef.current) {
        nextResolverRef.current();
        nextResolverRef.current = null;
      }
    };
  }, [stepIdx, replayKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Button handlers ───────────────────────────────────────────────────────

  function handleNext() {
    // Always resolve the current pause — whether mid or end.
    // If it's an end-pause, the step function returns and runStep advances.
    if (nextResolverRef.current) {
      const r = nextResolverRef.current;
      nextResolverRef.current = null;
      r();
    }
  }

  function handleSeeAgain() {
    // Increment replayKey → triggers cleanup (abort + unblock) + re-runs step
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
