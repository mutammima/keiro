/**
 * OnboardingTutorial — Welcome screen → Step-based autoplay with pauses.
 *
 * Flow:
 *   0. Welcome screen — "Want a quick tour?"  Yes → tutorial, No → skip
 *   1–5. Each step:
 *        a. Shows description text first → user presses Next to start demo
 *        b. Demo runs; pauses before each sub-action so user can read
 *        c. End-pause: "Again" replays whole step, "Next →" advances
 *
 * "Again" fix: uses a closure-local `cancelled` flag instead of a shared
 * ref, so the old async chain can't keep running after a new one starts.
 *
 * Steps:
 *   1. Set business name   (New Invoice page)
 *   2. Create an invoice   (store → customer → product → generate)
 *   3. Invoices page       (expand → status cycle → collapse)
 *   4. Store balance       (tap store → view balance → back)
 *   5. Products catalogue  (auto-saved + mention removal)
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
      position: 'fixed', left: pos.x - 11, top: pos.y - 11,
      width: 22, height: 22, borderRadius: '50%',
      background: pulse ? ACCENT : 'rgba(255,255,255,0.93)',
      border: `2.5px solid ${ACCENT}`,
      zIndex: CURSOR_Z, pointerEvents: 'none',
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

  if (bottom <= 0 || top >= window.innerHeight || w <= 0 || h <= 0)
    return <div style={{ ...base, inset: 0 }} onTouchMove={stopTouch} />;

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

// ── Tooltip card ──────────────────────────────────────────────────────────────
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
        position: 'fixed', top: tooltipTop,
        left: Math.max(16, (vw - tooltipW) / 2), width: tooltipW,
        zIndex: TOOLTIP_Z,
        background: dark ? '#1c1c20' : '#ffffff',
        borderRadius: 18, padding: '14px 16px 13px',
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
        <button data-tutorial-ui="skip-btn" onClick={onSkip} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 12, fontWeight: 600,
          color: dark ? 'rgba(255,255,255,0.32)' : 'rgba(0,0,0,0.28)',
          padding: '2px 6px', borderRadius: 6, WebkitTapHighlightColor: 'transparent',
        }}>Skip</button>
      </div>

      {/* Progress bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        {Array.from({ length: TOTAL }).map((_, i) => (
          <div key={i} style={{
            flex: 1, height: 3, borderRadius: 2,
            background: i < stepId ? ACCENT : (dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'),
            opacity: i < stepId - 1 ? 0.45 : 1, transition: 'background 0.3s',
          }} />
        ))}
      </div>

      {/* Title + desc */}
      <div style={{ fontSize: 13, fontWeight: 700, color: dark ? '#fff' : '#111', marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, color: dark ? 'rgba(255,255,255,0.56)' : 'rgba(0,0,0,0.5)', lineHeight: 1.55 }}>{desc}</div>

      {/* Buttons */}
      {phase !== 'playing' && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {phase === 'end-pause' && (
            <button data-tutorial-ui="see-again-btn" onClick={onSeeAgain} style={{
              flex: 1, height: 38, borderRadius: 12, border: 'none',
              background: dark ? '#2a2a30' : '#f0f0f3',
              color: dark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)',
              fontSize: 13, fontWeight: 600, cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
            }}>Again</button>
          )}
          <button data-tutorial-ui="next-btn" onClick={onNext} style={{
            flex: phase === 'end-pause' ? 2 : 1,
            height: 38, borderRadius: 12, border: 'none',
            background: ACCENT, color: '#fff',
            fontSize: 14, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
            boxShadow: '0 4px 14px rgba(74,123,247,0.4)',
          }}>
            {phase === 'end-pause' && isLast ? 'Start using the app' : 'Next →'}
          </button>
        </div>
      )}

      {/* Playing indicator */}
      {phase === 'playing' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
          <div style={{ width: 6, height: 6, borderRadius: 3, background: ACCENT, animation: 'tut-blink 1.1s ease-in-out infinite' }} />
          <span style={{ fontSize: 11, fontWeight: 500, color: dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.3)' }}>
            Watch the demo…
          </span>
        </div>
      )}
    </div>
  );
}

// ── Welcome screen ────────────────────────────────────────────────────────────

function WelcomeScreen({ dark, onStart, onSkip }) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  return (
    <div
      data-tutorial-ui="welcome"
      style={{
        position: 'fixed', inset: 0, zIndex: TOOLTIP_Z,
        background: dark ? 'rgba(0,0,0,0.82)' : 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div style={{
        width: '100%', maxWidth: 340,
        background: dark ? '#1c1c20' : '#ffffff',
        borderRadius: 24, padding: '32px 24px 24px',
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'}`,
        textAlign: 'center',
      }}>
        {/* Logo mark */}
        <div style={{
          width: 64, height: 64, borderRadius: 18,
          background: ACCENT, margin: '0 auto 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 12px 32px ${ACCENT}55`,
        }}>
          <svg width={34} height={34} viewBox="0 0 44 44" fill="none">
            <rect x="8" y="4" width="24" height="32" rx="4" fill="white" fillOpacity="0.22" />
            <rect x="8" y="4" width="24" height="32" rx="4" stroke="white" strokeWidth="2.2" />
            <line x1="14" y1="14" x2="26" y2="14" stroke="white" strokeWidth="2" strokeLinecap="round" />
            <line x1="14" y1="20" x2="26" y2="20" stroke="white" strokeWidth="2" strokeLinecap="round" />
            <line x1="14" y1="26" x2="20" y2="26" stroke="white" strokeWidth="2" strokeLinecap="round" />
            <circle cx="32" cy="34" r="7" fill={ACCENT} />
            <circle cx="32" cy="34" r="7" stroke="white" strokeWidth="1.5" />
            <polyline points="28.5,34 31,36.5 35.5,31.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
        </div>

        <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.5px', color: dark ? '#fff' : '#111', marginBottom: 8 }}>
          Welcome to <span style={{ color: ACCENT }}>InvoGo!</span>
        </div>
        <div style={{ fontSize: 14, color: dark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.5)', lineHeight: 1.6, marginBottom: 28 }}>
          Would you like a quick tour? We'll walk you through the app step by step — it only takes a minute.
        </div>

        <button data-tutorial-ui="welcome-start" onClick={onStart} style={{
          width: '100%', height: 48, borderRadius: 14, border: 'none',
          background: ACCENT, color: '#fff', fontSize: 15, fontWeight: 700,
          cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
          boxShadow: '0 6px 20px rgba(74,123,247,0.45)',
          marginBottom: 10,
        }}>
          Show me around
        </button>
        <button data-tutorial-ui="welcome-skip" onClick={onSkip} style={{
          width: '100%', height: 40, borderRadius: 12, border: 'none',
          background: 'none', color: dark ? 'rgba(255,255,255,0.38)' : 'rgba(0,0,0,0.35)',
          fontSize: 14, fontWeight: 500, cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
        }}>
          I'll explore myself
        </button>
      </div>
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

  const [welcomed,    setWelcomed]    = useState(false);
  const [cursorPos,   setCursorPos]   = useState({ x: -100, y: -100 });
  const [cursorPulse, setCursorPulse] = useState(false);
  const [rect,        setRect]        = useState(null);
  const [tooltip,     setTooltip]     = useState({ stepId: 1, title: '', desc: '' });
  const [stepIdx,     setStepIdx]     = useState(0);
  const [replayKey,   setReplayKey]   = useState(0);
  const [phase,       setPhase]       = useState('playing');

  // nextResolverRef: set while paused, called by handleNext
  const nextResolverRef = useRef(null);

  useEffect(() => { ensureKeyframes(); }, []);

  // ── Lock body + block user taps ───────────────────────────────────────────
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
    if (!welcomed) return; // don't run until user confirmed the tutorial

    // ── IMPORTANT: closure-local cancel flag ─────────────────────────────────
    // We intentionally use a closure variable (not a shared ref) so the old
    // async chain cannot keep running after a new effect starts, even if
    // React resets a shared ref before the old Promise microtask fires.
    let cancelled = false;

    setPhase('playing');
    setRect(null);
    setCursorPos({ x: -100, y: -100 });
    setCursorPulse(false);

    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const show  = (id, title, desc) => { if (!cancelled) setTooltip({ stepId: id, title, desc }); };

    /**
     * Pause and wait for the user to press Next.
     * isEnd=false → mid-pause (Next only)
     * isEnd=true  → end-pause (Again + Next)
     */
    async function waitForUser(isEnd = false) {
      if (cancelled) return;
      setPhase(isEnd ? 'end-pause' : 'mid-pause');
      await new Promise(resolve => { nextResolverRef.current = resolve; });
      nextResolverRef.current = null;
      if (!cancelled) setPhase('playing');
    }

    async function moveTo(elOrSelector) {
      if (cancelled) return null;
      const el = typeof elOrSelector === 'string'
        ? document.querySelector(elOrSelector) : elOrSelector;
      if (!el) return null;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await sleep(400);
      if (cancelled) return null;
      const r = el.getBoundingClientRect();
      setCursorPos({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
      setRect({ top: r.top, left: r.left, right: r.right, bottom: r.bottom });
      await sleep(460);
      return cancelled ? null : el;
    }

    async function tap(elOrSelector) {
      if (cancelled) return;
      const el = await moveTo(elOrSelector);
      if (!el) return;
      setCursorPulse(true);
      await sleep(160);
      el.click();
      await sleep(200);
      setCursorPulse(false);
      await sleep(300);
    }

    async function type(elOrSelector, text) {
      if (cancelled) return;
      const el = await moveTo(elOrSelector);
      if (!el) return;
      setNativeValue(el, '');
      await sleep(80);
      for (let i = 1; i <= text.length; i++) {
        if (cancelled) break;
        setNativeValue(el, text.slice(0, i));
        await sleep(50);
      }
      await sleep(240);
    }

    // ════════════════════════════════════════════════════════════════════════
    // STEP 1 — Business name
    // ════════════════════════════════════════════════════════════════════════
    async function step1_businessName() {
      navigate('invoice');
      await sleep(900);
      setRect(null);

      show(1, 'Set your business name', 'Your business name prints at the top of every invoice. Tap it to edit it right here on the invoice page.');
      await waitForUser(false);
      if (cancelled) return;

      await tap('[data-tutorial="invoice-biz-name-btn"]');
      await sleep(350);

      const inputEl = document.querySelector('[data-tutorial="invoice-biz-name-input"]');
      if (inputEl) {
        show(1, 'Type your business name', 'This appears on every PDF you send to customers.');
        await moveTo(inputEl);
        setNativeValue(inputEl, '');
        await sleep(80);
        const name = 'J&Y Distributions';
        for (let i = 1; i <= name.length; i++) {
          if (cancelled) break;
          setNativeValue(inputEl, name.slice(0, i));
          await sleep(52);
        }
        await sleep(450);
        inputEl.dispatchEvent(new Event('blur', { bubbles: true }));
        await sleep(550);
      }

      setRect(null);
      show(1, 'Business name saved!', 'Every invoice you generate will now show your business name at the top.');
      await waitForUser(true);
    }

    // ════════════════════════════════════════════════════════════════════════
    // STEP 2 — Create an invoice
    // ════════════════════════════════════════════════════════════════════════
    async function step2_createInvoice() {
      navigate('invoice');
      await sleep(900);
      setRect(null);

      // Intro — user reads before anything moves
      show(2, 'Create an invoice', 'Fill in who you\'re delivering to, add the products, then generate the invoice.');
      await waitForUser(false);
      if (cancelled) return;

      // Sub-part: store details
      await moveTo('[data-tutorial="invoice-store-name"]');
      show(2, 'Who are you delivering to?', 'Enter the store name and the contact person receiving the delivery.');
      await waitForUser(false);
      if (cancelled) return;
      await type('input[placeholder="Sunrise Deli"]', 'Corner Store');
      await type('input[placeholder="John Smith"]',   'Mike Johnson');
      await sleep(250);

      // Sub-part: add item
      await moveTo('[data-tutorial="invoice-add-item"]');
      show(2, 'Add your products', 'Enter the item name, quantity, and unit price — then tap + Add Item.');
      await waitForUser(false);
      if (cancelled) return;
      await type('input[placeholder="GMan V Cut T-Shirt"]', 'GMan V Cut T-Shirt');
      const qtyEl = document.querySelector('input[placeholder="1"]');
      if (qtyEl) {
        await moveTo(qtyEl);
        setNativeValue(qtyEl, '');
        await sleep(70);
        setNativeValue(qtyEl, '2');
        qtyEl.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(240);
      }
      await type('input[placeholder="0.00"]', '9.99');
      const addBtn = Array.from(document.querySelectorAll('button'))
        .find(b => b.textContent.trim() === '+ Add Item');
      if (addBtn) { await tap(addBtn); await sleep(450); }

      // Sub-part: generate
      await moveTo('[data-tutorial="invoice-generate"]');
      show(2, 'Generate the invoice', 'Tap Generate to save this invoice and produce a shareable PDF.');
      await waitForUser(false);
      if (cancelled) return;
      await tap('[data-tutorial="invoice-generate"]');
      await sleep(1300);

      setRect(null);
      show(2, 'Invoice created!', 'Download the PDF, share it via WhatsApp, or tap New Invoice to start another delivery.');
      await waitForUser(true);
    }

    // ════════════════════════════════════════════════════════════════════════
    // STEP 3 — Invoices page
    // ════════════════════════════════════════════════════════════════════════
    async function step3_invoicesPage() {
      navigate('history');
      await sleep(900);
      setRect(null);

      // Intro
      show(3, 'Your Invoices page', 'Every invoice you create shows up here, sorted by date. Tap any one to expand it.');
      await waitForUser(false);
      if (cancelled) return;

      // Sub-part: expand
      await moveTo('[data-tutorial="invoice-expand-latest"]');
      show(3, 'Tap to expand', 'Tapping the invoice row reveals the full item breakdown.');
      await waitForUser(false);
      if (cancelled) return;
      await tap('[data-tutorial="invoice-expand-latest"]');
      await sleep(800);

      // Sub-part: status badge
      await moveTo('[data-tutorial="status-badge-latest"]');
      show(3, 'Change the payment status', 'Tap the status badge to cycle between Unpaid, Paid, and Partial — update it whenever you collect payment.');
      await waitForUser(false);
      if (cancelled) return;
      await tap('[data-tutorial="status-badge-latest"]'); // → Paid
      await sleep(550);
      await tap('[data-tutorial="status-badge-latest"]'); // → Partial
      await sleep(550);
      await tap('[data-tutorial="status-badge-latest"]'); // → Unpaid
      await sleep(650);

      // Mid-pause: Next collapses the invoice
      setRect(null);
      show(3, 'Tap Next to collapse', 'Press Next to close the invoice back up.');
      await waitForUser(false);
      if (cancelled) return;

      await tap('[data-tutorial="invoice-expand-latest"]');
      await sleep(650);
      setRect(null);

      show(3, 'Invoices page done!', 'Expand any invoice at any time to review items or update the payment status.');
      await waitForUser(true);
    }

    // ════════════════════════════════════════════════════════════════════════
    // STEP 4 — Store balance
    // ════════════════════════════════════════════════════════════════════════
    async function step4_storeBalance() {
      navigate('history');
      await sleep(700);
      setRect(null);

      // Intro
      show(4, 'Track store balances', 'Tap any store name to see the full payment history and running balance for that store.');
      await waitForUser(false);
      if (cancelled) return;

      // Sub-part: tap store name
      await moveTo('[data-tutorial="store-name-link"]');
      show(4, 'Tap the store name', 'This opens a complete balance breakdown — every invoice and payment recorded.');
      await waitForUser(false);
      if (cancelled) return;
      await tap('[data-tutorial="store-name-link"]');
      await sleep(1700);

      // Mid-pause: user reads balance page
      show(4, 'Running balance', 'You can see exactly what each store owes you at a glance. Tap Next to go back.');
      await waitForUser(false);
      if (cancelled) return;

      const backBtn = Array.from(document.querySelectorAll('button'))
        .find(b => b.textContent.includes('Back') || b.textContent.includes('←'));
      if (backBtn) { await tap(backBtn); } else { navigate('history'); }
      await sleep(650);
      setRect(null);

      show(4, 'Store balances tracked!', 'Access any store\'s balance any time from the Invoices page.');
      await waitForUser(true);
    }

    // ════════════════════════════════════════════════════════════════════════
    // STEP 5 — Products
    // ════════════════════════════════════════════════════════════════════════
    async function step5_products() {
      navigate('products');
      await sleep(900);
      setRect(null);

      // Intro
      show(5, 'Products auto-save', 'Every item you sell is automatically saved here — no manual entry needed. InvoGo autofills names and prices next time.');
      await waitForUser(false);
      if (cancelled) return;

      // Sub-part: show the list
      await moveTo('[data-tutorial="products-list"]');
      show(5, 'Your product catalogue', 'Products grow as you create invoices. Swipe or long-press any product to remove it from the list.');
      await waitForUser(false);
      if (cancelled) return;
      await sleep(1200);

      setRect(null);
      show(5, "You're all set!", "That's everything. Tap below to start using InvoGo.");
      await waitForUser(true);
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
      if (!cancelled) {
        if (stepIdx >= TOTAL - 1) onComplete();
        else setStepIdx(s => s + 1);
      }
    }

    runStep();

    return () => {
      cancelled = true;
      // Unblock any pending waitForUser so the async chain exits cleanly
      if (nextResolverRef.current) {
        nextResolverRef.current();
        nextResolverRef.current = null;
      }
    };
  }, [stepIdx, replayKey, welcomed]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Button handlers ───────────────────────────────────────────────────────

  function handleNext() {
    if (nextResolverRef.current) {
      const r = nextResolverRef.current;
      nextResolverRef.current = null;
      r(); // resolve whatever pause is pending
    }
  }

  function handleSeeAgain() {
    // Incrementing replayKey triggers cleanup (cancels + unblocks) → step restarts
    setReplayKey(k => k + 1);
  }

  // ── Welcome screen ────────────────────────────────────────────────────────
  if (!welcomed) {
    return (
      <>
        <Spotlight rect={null} />
        <WelcomeScreen
          dark={dark}
          onStart={() => setWelcomed(true)}
          onSkip={onSkip}
        />
      </>
    );
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
