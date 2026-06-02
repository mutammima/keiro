/**
 * OnboardingTutorial — Welcome → autoplay demo with step-based pauses.
 *
 * Props:
 *   navigate(page)  — app navigation
 *   onComplete()    — called when user finishes
 *   onSkip()        — called when user skips
 *   skipWelcome     — skip the welcome card (used by "How it Works" in sidebar)
 *
 * UX notes:
 *   • Tooltip stays at the bottom of the screen by default; only shifts to
 *     the top when the spotlit element is in the lower 50% of the viewport.
 *     This keeps the card stable — it only repositions when it would actually
 *     cover the content being shown.
 *   • Back button on all steps after step 1 (mid-pause + end-pause only).
 *   • "Again" replays the whole step from the very beginning.
 *   • Spotlight clears immediately on page navigate to avoid highlighting
 *     unrelated elements during the page transition.
 *   • All copy is short (≤ 10 words per line).
 */

import { useState, useEffect, useRef } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { ACCENT } from '../../theme';

const TOTAL     = 5;
const OVERLAY_Z = 9100;
const TOOLTIP_Z = 9200;
const CURSOR_Z  = 9300;
const PAD       = 6;

// ─── helpers ──────────────────────────────────────────────────────────────────

function setNativeValue(el, value) {
  if (!el) return;
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  ).set;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

// ─── Visual cursor ─────────────────────────────────────────────────────────────

function VisualCursor({ pos, pulse }) {
  return (
    <div style={{
      position: 'fixed', left: pos.x - 11, top: pos.y - 11,
      width: 22, height: 22, borderRadius: '50%',
      background: pulse ? ACCENT : 'rgba(255,255,255,0.93)',
      border: `2.5px solid ${ACCENT}`,
      zIndex: CURSOR_Z, pointerEvents: 'none',
      transition: 'left 0.40s cubic-bezier(0.4,0,0.2,1), top 0.40s cubic-bezier(0.4,0,0.2,1), background 0.13s, transform 0.13s, box-shadow 0.13s',
      transform:  pulse ? 'scale(0.6)' : 'scale(1)',
      boxShadow: pulse
        ? '0 0 0 8px rgba(74,123,247,0.28), 0 0 0 16px rgba(74,123,247,0.1)'
        : '0 2px 10px rgba(0,0,0,0.4)',
    }} />
  );
}

// ─── Spotlight ─────────────────────────────────────────────────────────────────

const SLIDE = 'top 0.36s cubic-bezier(0.4,0,0.2,1), left 0.36s cubic-bezier(0.4,0,0.2,1), right 0.36s cubic-bezier(0.4,0,0.2,1), bottom 0.36s cubic-bezier(0.4,0,0.2,1), width 0.36s cubic-bezier(0.4,0,0.2,1), height 0.36s cubic-bezier(0.4,0,0.2,1)';

function Spotlight({ rect, animate }) {
  const stopTouch = e => e.preventDefault();
  const base = {
    position: 'fixed', background: 'transparent',
    zIndex: OVERLAY_Z, pointerEvents: 'all',
    touchAction: 'none', WebkitUserSelect: 'none', userSelect: 'none',
    transition: animate ? SLIDE : 'none',
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
        transition: animate ? SLIDE : 'none',
      }} />
    </>
  );
}

// ─── Tooltip ───────────────────────────────────────────────────────────────────
//
// Positioning strategy:
//   • Anchored to the BOTTOM of the screen by default (bottom: 16px).
//   • Only flips to TOP when the spotlit element's bottom exceeds 52% of the
//     viewport height — so the card doesn't cover the highlighted content.
//   • This keeps the card in one place most of the time.

function Tooltip({
  stepId, title, desc, contentKey,
  rect, dark, phase, stepIdx, totalSteps,
  onSkip, onNext, onBack, onSeeAgain,
}) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const tooltipW = Math.min(320, vw - 32);

  // Flip to top only if element is in the lower half of the screen
  const elementBottom = rect ? Math.min(vh, rect.bottom) : 0;
  const flipToTop     = rect && elementBottom > vh * 0.52;
  const TOOLTIP_H     = 215;

  const posStyle = flipToTop
    ? { top:    Math.max(8, (rect.top - PAD) - TOOLTIP_H - 12) }
    : { bottom: 16 };

  const showBack = stepIdx > 0 && phase !== 'playing';
  const isLast   = stepIdx === TOTAL - 1;

  return (
    <div
      data-tutorial-ui="tooltip"
      style={{
        position: 'fixed',
        left: Math.max(16, (vw - tooltipW) / 2),
        width: tooltipW,
        ...posStyle,
        zIndex: TOOLTIP_Z,
        background: dark ? '#1c1c20' : '#ffffff',
        borderRadius: 18,
        padding: '13px 15px 12px',
        boxShadow: '0 16px 48px rgba(0,0,0,0.55)',
        border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'}`,
        touchAction: 'none', WebkitUserSelect: 'none', userSelect: 'none',
        // Only transition when flipping between top/bottom (not on every rect change)
        transition: 'bottom 0.3s cubic-bezier(0.4,0,0.2,1), top 0.3s cubic-bezier(0.4,0,0.2,1)',
      }}
    >
      {/* Step label + Skip */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: ACCENT, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
          Step {stepId} of {TOTAL}
        </span>
        <button data-tutorial-ui="skip-btn" onClick={onSkip} style={{
          background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
          color: dark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.25)',
          padding: '2px 6px', borderRadius: 6, WebkitTapHighlightColor: 'transparent',
        }}>Skip</button>
      </div>

      {/* Progress */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 9 }}>
        {Array.from({ length: TOTAL }).map((_, i) => (
          <div key={i} style={{
            flex: 1, height: 3, borderRadius: 2,
            background: i < stepId ? ACCENT : (dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.10)'),
            opacity: i < stepId - 1 ? 0.42 : 1, transition: 'background 0.3s',
          }} />
        ))}
      </div>

      {/* Text — keyed for fade-in on each change */}
      <div key={contentKey} style={{ animation: 'tut-fadein 0.2s ease both' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: dark ? '#fff' : '#111', marginBottom: 3 }}>{title}</div>
        <div style={{ fontSize: 12, color: dark ? 'rgba(255,255,255,0.54)' : 'rgba(0,0,0,0.48)', lineHeight: 1.52 }}>{desc}</div>
      </div>

      {/* Buttons (only during pauses) */}
      {phase !== 'playing' && (
        <div style={{ display: 'flex', gap: 7, marginTop: 11 }}>
          {/* Back */}
          {showBack && (
            <button data-tutorial-ui="back-btn" onClick={onBack} style={{
              flex: 1, height: 37, borderRadius: 11, border: 'none',
              background: dark ? '#2a2a30' : '#f0f0f3',
              color: dark ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.55)',
              fontSize: 13, fontWeight: 600, cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
            }}>← Back</button>
          )}

          {/* Again (end-pause only) */}
          {phase === 'end-pause' && (
            <button data-tutorial-ui="see-again-btn" onClick={onSeeAgain} style={{
              flex: 1, height: 37, borderRadius: 11, border: 'none',
              background: dark ? '#2a2a30' : '#f0f0f3',
              color: dark ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.55)',
              fontSize: 13, fontWeight: 600, cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
            }}>Again</button>
          )}

          {/* Next / Finish */}
          <button data-tutorial-ui="next-btn" onClick={onNext} style={{
            flex: 2, height: 37, borderRadius: 11, border: 'none',
            background: ACCENT, color: '#fff',
            fontSize: 14, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
            boxShadow: '0 4px 14px rgba(74,123,247,0.38)',
          }}>
            {phase === 'end-pause' && isLast ? 'Start using the app' : 'Next →'}
          </button>
        </div>
      )}

      {/* Playing indicator */}
      {phase === 'playing' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 9 }}>
          <div style={{ width: 6, height: 6, borderRadius: 3, background: ACCENT, animation: 'tut-blink 1.1s ease-in-out infinite' }} />
          <span style={{ fontSize: 11, fontWeight: 500, color: dark ? 'rgba(255,255,255,0.33)' : 'rgba(0,0,0,0.28)' }}>Watch…</span>
        </div>
      )}
    </div>
  );
}

// ─── Welcome screen ────────────────────────────────────────────────────────────

function WelcomeScreen({ dark, onStart, onSkip }) {
  return (
    <div data-tutorial-ui="welcome" style={{
      position: 'fixed', inset: 0, zIndex: TOOLTIP_Z,
      background: dark ? 'rgba(0,0,0,0.82)' : 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{
        width: '100%', maxWidth: 340,
        background: dark ? '#1c1c20' : '#ffffff',
        borderRadius: 24, padding: '30px 22px 22px',
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'}`,
        textAlign: 'center', animation: 'tut-fadein 0.3s ease both',
      }}>
        <div style={{
          width: 60, height: 60, borderRadius: 16, background: ACCENT,
          margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 10px 28px ${ACCENT}55`,
        }}>
          <svg width={32} height={32} viewBox="0 0 44 44" fill="none">
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
        <div style={{ fontSize: 21, fontWeight: 900, letterSpacing: '-0.4px', color: dark ? '#fff' : '#111', marginBottom: 8 }}>
          Welcome to <span style={{ color: ACCENT }}>InvoGo!</span>
        </div>
        <div style={{ fontSize: 13, color: dark ? 'rgba(255,255,255,0.52)' : 'rgba(0,0,0,0.48)', lineHeight: 1.6, marginBottom: 24 }}>
          Want a quick tour? We'll show you how everything works in about a minute.
        </div>
        <button data-tutorial-ui="welcome-start" onClick={onStart} style={{
          width: '100%', height: 46, borderRadius: 13, border: 'none',
          background: ACCENT, color: '#fff', fontSize: 15, fontWeight: 700,
          cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
          boxShadow: '0 6px 20px rgba(74,123,247,0.42)', marginBottom: 9,
        }}>Show me around</button>
        <button data-tutorial-ui="welcome-skip" onClick={onSkip} style={{
          width: '100%', height: 38, borderRadius: 11, border: 'none',
          background: 'none', color: dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.32)',
          fontSize: 13, fontWeight: 500, cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
        }}>I'll explore myself</button>
      </div>
    </div>
  );
}

// ─── Keyframes ─────────────────────────────────────────────────────────────────

function ensureKeyframes() {
  if (document.getElementById('tut-kf')) return;
  const s = document.createElement('style');
  s.id = 'tut-kf';
  s.textContent = `
    @keyframes tut-blink  { 0%,100%{opacity:1} 50%{opacity:0.18} }
    @keyframes tut-fadein { from{opacity:0;transform:translateY(3px)} to{opacity:1;transform:translateY(0)} }
  `;
  document.head.appendChild(s);
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function OnboardingTutorial({ navigate, onComplete, onSkip, skipWelcome = false }) {
  const { dark } = useTheme();

  const [welcomed,    setWelcomed]    = useState(skipWelcome);
  const [cursorPos,   setCursorPos]   = useState({ x: -100, y: -100 });
  const [cursorPulse, setCursorPulse] = useState(false);
  const [rect,        setRect]        = useState(null);
  const [animateSpot, setAnimateSpot] = useState(false);
  const [tooltip,     setTooltip]     = useState({ stepId: 1, title: '', desc: '' });
  const [contentKey,  setContentKey]  = useState(0);
  const [stepIdx,     setStepIdx]     = useState(0);
  const [replayKey,   setReplayKey]   = useState(0);
  const [phase,       setPhase]       = useState('playing');

  const nextResolverRef = useRef(null);

  useEffect(() => { ensureKeyframes(); }, []);

  // ── Lock body + block taps ────────────────────────────────────────────────
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
      e.stopPropagation(); e.preventDefault();
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

  // ── Step runner ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!welcomed) return;

    let cancelled = false;   // closure-local; immune to ref-reset race

    setPhase('playing');
    setRect(null);
    setAnimateSpot(false);
    setCursorPos({ x: -100, y: -100 });
    setCursorPulse(false);

    const sleep = ms => new Promise(r => setTimeout(r, ms));

    let ckSeq = 0;
    function show(id, title, desc) {
      if (cancelled) return;
      ckSeq++;
      setTooltip({ stepId: id, title, desc });
      setContentKey(ckSeq);
    }

    // Clears spotlight immediately (call before navigating to a new page)
    function clearSpot() {
      setRect(null);
      setAnimateSpot(false);
      setCursorPos({ x: -100, y: -100 });
    }

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
      await sleep(380);
      if (cancelled) return null;
      const r = el.getBoundingClientRect();
      setCursorPos({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
      setRect({ top: r.top, left: r.left, right: r.right, bottom: r.bottom });
      setAnimateSpot(true);
      await sleep(440);
      return cancelled ? null : el;
    }

    async function tap(elOrSelector) {
      if (cancelled) return;
      const el = await moveTo(elOrSelector);
      if (!el) return;
      setCursorPulse(true);
      await sleep(155);
      el.click();
      await sleep(195);
      setCursorPulse(false);
      await sleep(280);
    }

    async function type(elOrSelector, text) {
      if (cancelled) return;
      const el = await moveTo(elOrSelector);
      if (!el) return;
      setNativeValue(el, '');
      await sleep(70);
      for (let i = 1; i <= text.length; i++) {
        if (cancelled) break;
        setNativeValue(el, text.slice(0, i));
        await sleep(48);
      }
      await sleep(200);
    }

    // ══ STEP 1 — Business name & phone ══════════════════════════════════════
    async function step1() {
      navigate('invoice');
      await sleep(900);
      clearSpot();

      show(1, 'Business name & phone', 'These show at the top of every invoice. Tap to edit.');
      await waitForUser(false);
      if (cancelled) return;

      // Business name
      await tap('[data-tutorial="invoice-biz-name-btn"]');
      await sleep(280);
      const nameInput = document.querySelector('[data-tutorial="invoice-biz-name-input"]');
      if (nameInput) {
        show(1, 'Type your business name', 'This prints on every invoice PDF.');
        await moveTo(nameInput);
        setNativeValue(nameInput, '');
        await sleep(65);
        const name = 'J&Y Distributions';
        for (let i = 1; i <= name.length; i++) {
          if (cancelled) break;
          setNativeValue(nameInput, name.slice(0, i));
          await sleep(50);
        }
        await sleep(380);
        nameInput.dispatchEvent(new Event('blur', { bubbles: true }));
        await sleep(480);
      }

      // Phone number
      await tap('[data-tutorial="invoice-biz-phone-btn"]');
      await sleep(280);
      const phoneInput = document.querySelector('[data-tutorial="invoice-biz-phone-input"]');
      if (phoneInput) {
        show(1, 'Add a phone number', 'Optional — also appears on the invoice.');
        await moveTo(phoneInput);
        setNativeValue(phoneInput, '');
        await sleep(65);
        const phone = '(555) 123-4567';
        for (let i = 1; i <= phone.length; i++) {
          if (cancelled) break;
          setNativeValue(phoneInput, phone.slice(0, i));
          await sleep(55);
        }
        await sleep(380);
        phoneInput.dispatchEvent(new Event('blur', { bubbles: true }));
        await sleep(480);
      }

      clearSpot();
      show(1, 'Saved!', 'Both will appear at the top of every invoice.');
      await waitForUser(true);
    }

    // ══ STEP 2 — Create an invoice ══════════════════════════════════════════
    async function step2() {
      navigate('invoice');
      await sleep(900);
      clearSpot();

      show(2, 'Create an invoice', 'Enter the store, add your items, then generate.');
      await waitForUser(false);
      if (cancelled) return;

      await moveTo('[data-tutorial="invoice-store-name"]');
      show(2, 'Who are you delivering to?', 'Store name and contact person.');
      await waitForUser(false);
      if (cancelled) return;
      await type('input[placeholder="Sunrise Deli"]', 'Corner Store');
      await type('input[placeholder="John Smith"]',   'Mike Johnson');
      await sleep(200);

      await moveTo('[data-tutorial="invoice-add-item"]');
      show(2, 'Add items', 'Name, qty, price — then tap + Add Item.');
      await waitForUser(false);
      if (cancelled) return;
      await type('input[placeholder="GMan V Cut T-Shirt"]', 'GMan V Cut T-Shirt');
      const qtyEl = document.querySelector('input[placeholder="1"]');
      if (qtyEl) {
        await moveTo(qtyEl);
        setNativeValue(qtyEl, '');
        await sleep(60);
        setNativeValue(qtyEl, '2');
        qtyEl.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(200);
      }
      await type('input[placeholder="0.00"]', '9.99');
      const addBtn = Array.from(document.querySelectorAll('button'))
        .find(b => b.textContent.trim() === '+ Add Item');
      if (addBtn) { await tap(addBtn); await sleep(400); }

      await moveTo('[data-tutorial="invoice-generate"]');
      show(2, 'Generate', 'Saves the invoice and creates the PDF.');
      await waitForUser(false);
      if (cancelled) return;
      await tap('[data-tutorial="invoice-generate"]');
      await sleep(1200);

      clearSpot();
      show(2, 'Invoice created!', 'Download, share via WhatsApp, or start a new one.');
      await waitForUser(true);
    }

    // ══ STEP 3 — Invoices page ══════════════════════════════════════════════
    async function step3() {
      navigate('history');
      await sleep(900);
      clearSpot();

      show(3, 'Invoices', 'All your invoices are here. Tap one to expand it.');
      await waitForUser(false);
      if (cancelled) return;

      await moveTo('[data-tutorial="invoice-expand-latest"]');
      show(3, 'Tap to expand', 'See all items inside the invoice.');
      await waitForUser(false);
      if (cancelled) return;
      await tap('[data-tutorial="invoice-expand-latest"]');
      await sleep(750);

      await moveTo('[data-tutorial="status-badge-latest"]');
      show(3, 'Payment status', 'Tap to switch: Unpaid → Paid → Partial.');
      await waitForUser(false);
      if (cancelled) return;
      await tap('[data-tutorial="status-badge-latest"]'); // → Paid
      await sleep(480);
      await tap('[data-tutorial="status-badge-latest"]'); // → Partial
      await sleep(480);
      await tap('[data-tutorial="status-badge-latest"]'); // → Unpaid
      await sleep(560);

      clearSpot();
      show(3, 'Collapse it', 'Tap Next to close the invoice back up.');
      await waitForUser(false);
      if (cancelled) return;
      await tap('[data-tutorial="invoice-expand-latest"]');
      await sleep(580);
      clearSpot();

      show(3, 'Got it!', 'Open any invoice to review or update its status.');
      await waitForUser(true);
    }

    // ══ STEP 4 — Store balance ══════════════════════════════════════════════
    async function step4() {
      navigate('history');
      await sleep(700);
      clearSpot();

      show(4, 'Store balances', 'Tap a store name to see what they owe you.');
      await waitForUser(false);
      if (cancelled) return;

      await moveTo('[data-tutorial="store-name-link"]');
      show(4, 'Tap the store', 'Opens a full invoice history for that store.');
      await waitForUser(false);
      if (cancelled) return;

      // Clear spotlight BEFORE navigating so it doesn't highlight random elements
      clearSpot();
      await tap('[data-tutorial="store-name-link"]');
      await sleep(1500);

      show(4, 'Balance view', 'See what this store owes. Tap Next to go back.');
      await waitForUser(false);
      if (cancelled) return;

      const backBtn = Array.from(document.querySelectorAll('button'))
        .find(b => b.textContent.includes('Back') || b.textContent.includes('←'));
      if (backBtn) { await tap(backBtn); } else { navigate('history'); }
      await sleep(600);
      clearSpot();

      show(4, 'Done!', 'Access store balances anytime from Invoices.');
      await waitForUser(true);
    }

    // ══ STEP 5 — Products ═══════════════════════════════════════════════════
    async function step5() {
      navigate('products');
      await sleep(900);
      clearSpot();

      show(5, 'Products auto-save', 'Items you sell are saved here automatically.');
      await waitForUser(false);
      if (cancelled) return;

      await moveTo('[data-tutorial="products-list"]');
      show(5, 'Your catalogue', 'Grows as you invoice. Swipe to remove a product.');
      await waitForUser(false);
      if (cancelled) return;
      await sleep(800);

      clearSpot();
      show(5, "You're ready!", 'Tap below to start using InvoGo.');
      await waitForUser(true);
    }

    const steps = [step1, step2, step3, step4, step5];

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
      if (nextResolverRef.current) {
        nextResolverRef.current();
        nextResolverRef.current = null;
      }
    };
  }, [stepIdx, replayKey, welcomed]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleNext() {
    if (nextResolverRef.current) {
      const r = nextResolverRef.current;
      nextResolverRef.current = null;
      r();
    }
  }

  function handleBack() {
    if (stepIdx > 0) setStepIdx(s => s - 1);
  }

  function handleSeeAgain() {
    setReplayKey(k => k + 1);
  }

  // ── Welcome screen ────────────────────────────────────────────────────────
  if (!welcomed) {
    return (
      <>
        <Spotlight rect={null} animate={false} />
        <WelcomeScreen dark={dark} onStart={() => setWelcomed(true)} onSkip={onSkip} />
      </>
    );
  }

  return (
    <>
      <Spotlight rect={rect} animate={animateSpot} />
      <VisualCursor pos={cursorPos} pulse={cursorPulse} />
      <Tooltip
        stepId={tooltip.stepId}
        title={tooltip.title}
        desc={tooltip.desc}
        contentKey={contentKey}
        rect={rect}
        dark={dark}
        phase={phase}
        stepIdx={stepIdx}
        onSkip={onSkip}
        onNext={handleNext}
        onBack={handleBack}
        onSeeAgain={handleSeeAgain}
      />
    </>
  );
}
