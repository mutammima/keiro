/**
 * OnboardingTutorial — Welcome → autoplay demo with step-based pauses.
 *
 * Props:
 *   navigate(page)  — app navigation
 *   onComplete()    — called when user finishes
 *   onSkip()        — called when user skips
 *   skipWelcome     — skip the welcome card (used by "How it Works" in sidebar)
 *
 * Design decisions:
 *   • Tooltip always uses `top` (never `bottom`) so CSS transition is always
 *     smooth — no teleporting when switching anchor sides.
 *   • Tooltip positioned ADJACENT to the spotlit element (below if space,
 *     above if near screen bottom). Falls to 80% vh when rect is null.
 *   • Tutorial accent colour is auto-picked as the palette entry with the
 *     greatest RGB distance from the current app accent — never the same hue.
 *   • Every step shows its opening text IMMEDIATELY (before any sleep) so
 *     the dialogue updates the instant the user hits Next.
 *   • clearSpot() is called before every navigate() to prevent phantom
 *     spotlight on unrelated elements during page transitions.
 *   • Back button on steps 2-5 during any pause.
 *   • Final button says "Let's go!"
 */

import { useState, useEffect, useRef } from 'react';
import { useTheme } from '../../context/ThemeContext';

const TOTAL     = 5;
const OVERLAY_Z = 9100;
const TOOLTIP_Z = 9200;
const CURSOR_Z  = 9300;
const PAD       = 6;

// ─── Tutorial accent — always different from current app accent ───────────────

const TUT_PALETTE = [
  '#4A7BF7', // blue
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#10b981', // emerald
];

function hexToRgb(hex) {
  const h = (hex || '#000000').replace('#', '');
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}

function getTutAccent(appAccent) {
  const [ar, ag, ab] = hexToRgb(appAccent);
  let best = TUT_PALETTE[0], bestDist = -1;
  for (const c of TUT_PALETTE) {
    const [r, g, b] = hexToRgb(c);
    const d = (r-ar)**2 + (g-ag)**2 + (b-ab)**2;
    if (d > bestDist) { bestDist = d; best = c; }
  }
  return best;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setNativeValue(el, value) {
  if (!el) return;
  const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  s.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

// ─── Visual cursor ─────────────────────────────────────────────────────────────

function VisualCursor({ pos, pulse, accent }) {
  return (
    <div style={{
      position: 'fixed', left: pos.x - 11, top: pos.y - 11,
      width: 22, height: 22, borderRadius: '50%',
      background: pulse ? accent : 'rgba(255,255,255,0.93)',
      border: `2.5px solid ${accent}`,
      zIndex: CURSOR_Z, pointerEvents: 'none',
      transition: 'left 0.40s cubic-bezier(0.4,0,0.2,1), top 0.40s cubic-bezier(0.4,0,0.2,1), background 0.13s, transform 0.13s, box-shadow 0.13s',
      transform: pulse ? 'scale(0.6)' : 'scale(1)',
      boxShadow: pulse ? `0 0 0 8px ${accent}45, 0 0 0 16px ${accent}20` : '0 2px 10px rgba(0,0,0,0.4)',
    }} />
  );
}

// ─── Spotlight ─────────────────────────────────────────────────────────────────

const SLIDE = 'top 0.36s cubic-bezier(0.4,0,0.2,1), left 0.36s cubic-bezier(0.4,0,0.2,1), right 0.36s cubic-bezier(0.4,0,0.2,1), bottom 0.36s cubic-bezier(0.4,0,0.2,1), width 0.36s cubic-bezier(0.4,0,0.2,1), height 0.36s cubic-bezier(0.4,0,0.2,1)';

function Spotlight({ rect, animate, accent }) {
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
        boxShadow: `0 0 0 2.5px ${accent}, 0 0 0 5px ${accent}50, 0 0 22px 7px ${accent}25`,
        transition: animate ? SLIDE : 'none',
      }} />
    </>
  );
}

// ─── Tooltip ───────────────────────────────────────────────────────────────────
//
// Always uses `top` for CSS positioning (never `bottom`) so transitions are
// always smooth. Positioned adjacent to the spotlit element — below it when
// space permits, above it when the element is near the bottom. Falls to
// 80% vh when no element is highlighted (between steps).

function Tooltip({ stepId, title, desc, contentKey, rect, dark, phase, stepIdx, accent, onSkip, onNext, onBack, onSeeAgain }) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const tooltipW  = Math.min(320, vw - 32);
  const TOOLTIP_H = 220;
  const MARGIN    = 14;

  let tooltipTop;
  if (!rect) {
    // No element highlighted — sit near the bottom (80% down)
    tooltipTop = vh * 0.80 - TOOLTIP_H / 2;
  } else {
    const spaceBelow = vh - (rect.bottom + PAD + MARGIN);
    const spaceAbove = (rect.top  - PAD - MARGIN);
    if (spaceBelow >= TOOLTIP_H) {
      tooltipTop = rect.bottom + PAD + MARGIN;
    } else if (spaceAbove >= TOOLTIP_H) {
      tooltipTop = rect.top - PAD - MARGIN - TOOLTIP_H;
    } else {
      // Neither side has enough room — prefer whichever has more space
      tooltipTop = spaceBelow >= spaceAbove
        ? rect.bottom + PAD + MARGIN
        : rect.top - PAD - MARGIN - TOOLTIP_H;
    }
  }
  tooltipTop = Math.max(8, Math.min(vh - TOOLTIP_H - 8, tooltipTop));

  const showBack = stepIdx > 0 && phase !== 'playing';
  const isLast   = stepIdx === TOTAL - 1;

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
        padding: '13px 15px 12px',
        boxShadow: '0 16px 48px rgba(0,0,0,0.55)',
        border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'}`,
        touchAction: 'none', WebkitUserSelect: 'none', userSelect: 'none',
        // Always transitioning top — smooth movement in all cases
        transition: 'top 0.36s cubic-bezier(0.4,0,0.2,1)',
      }}
    >
      {/* Step label + Skip */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: accent, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
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
            background: i < stepId ? accent : (dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.10)'),
            opacity: i < stepId - 1 ? 0.42 : 1, transition: 'background 0.3s',
          }} />
        ))}
      </div>

      {/* Text — keyed so it fades in on every show() */}
      <div key={contentKey} style={{ animation: 'tut-fadein 0.18s ease both' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: dark ? '#fff' : '#111', marginBottom: 3 }}>{title}</div>
        <div style={{ fontSize: 12, color: dark ? 'rgba(255,255,255,0.54)' : 'rgba(0,0,0,0.48)', lineHeight: 1.52 }}>{desc}</div>
      </div>

      {/* Buttons */}
      {phase !== 'playing' && (
        <div style={{ display: 'flex', gap: 7, marginTop: 11 }}>
          {showBack && (
            <button data-tutorial-ui="back-btn" onClick={onBack} style={{
              flex: 1, height: 37, borderRadius: 11, border: 'none',
              background: dark ? '#2a2a30' : '#f0f0f3',
              color: dark ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.55)',
              fontSize: 13, fontWeight: 600, cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
            }}>← Back</button>
          )}
          {phase === 'end-pause' && (
            <button data-tutorial-ui="see-again-btn" onClick={onSeeAgain} style={{
              flex: 1, height: 37, borderRadius: 11, border: 'none',
              background: dark ? '#2a2a30' : '#f0f0f3',
              color: dark ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.55)',
              fontSize: 13, fontWeight: 600, cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
            }}>Again</button>
          )}
          <button data-tutorial-ui="next-btn" onClick={onNext} style={{
            flex: 2, height: 37, borderRadius: 11, border: 'none',
            background: accent, color: '#fff',
            fontSize: 14, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
            boxShadow: `0 4px 14px ${accent}60`,
          }}>
            {phase === 'end-pause' && isLast ? "Let's go!" : 'Next →'}
          </button>
        </div>
      )}

      {/* Playing indicator */}
      {phase === 'playing' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 9 }}>
          <div style={{ width: 6, height: 6, borderRadius: 3, background: accent, animation: 'tut-blink 1.1s ease-in-out infinite' }} />
          <span style={{ fontSize: 11, fontWeight: 500, color: dark ? 'rgba(255,255,255,0.33)' : 'rgba(0,0,0,0.28)' }}>Watch…</span>
        </div>
      )}
    </div>
  );
}

// ─── Welcome screen ────────────────────────────────────────────────────────────

function WelcomeScreen({ dark, accent, onStart, onSkip }) {
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
          width: 60, height: 60, borderRadius: 16, background: accent,
          margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 10px 28px ${accent}55`,
        }}>
          <svg width={32} height={32} viewBox="0 0 44 44" fill="none">
            <rect x="8" y="4" width="24" height="32" rx="4" fill="white" fillOpacity="0.22" />
            <rect x="8" y="4" width="24" height="32" rx="4" stroke="white" strokeWidth="2.2" />
            <line x1="14" y1="14" x2="26" y2="14" stroke="white" strokeWidth="2" strokeLinecap="round" />
            <line x1="14" y1="20" x2="26" y2="20" stroke="white" strokeWidth="2" strokeLinecap="round" />
            <line x1="14" y1="26" x2="20" y2="26" stroke="white" strokeWidth="2" strokeLinecap="round" />
            <circle cx="32" cy="34" r="7" fill={accent} />
            <circle cx="32" cy="34" r="7" stroke="white" strokeWidth="1.5" />
            <polyline points="28.5,34 31,36.5 35.5,31.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
        </div>
        <div style={{ fontSize: 21, fontWeight: 900, letterSpacing: '-0.4px', color: dark ? '#fff' : '#111', marginBottom: 8 }}>
          Welcome to <span style={{ color: accent }}>InvoGo!</span>
        </div>
        <div style={{ fontSize: 13, color: dark ? 'rgba(255,255,255,0.52)' : 'rgba(0,0,0,0.48)', lineHeight: 1.6, marginBottom: 24 }}>
          Want a quick tour? We'll show you how everything works in about a minute.
        </div>
        <button data-tutorial-ui="welcome-start" onClick={onStart} style={{
          width: '100%', height: 46, borderRadius: 13, border: 'none',
          background: accent, color: '#fff', fontSize: 15, fontWeight: 700,
          cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
          boxShadow: `0 6px 20px ${accent}55`, marginBottom: 9,
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
  const { dark, accent: appAccent } = useTheme();
  const accent = getTutAccent(appAccent); // tutorial accent ≠ app accent

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
    const so = document.body.style.overflow, sp = document.body.style.position;
    const ho = document.documentElement.style.overflow, sy = window.scrollY;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${sy}px`;
    document.body.style.width = '100%';
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
      document.body.style.overflow = so; document.body.style.position = sp;
      document.body.style.top = ''; document.body.style.width = '';
      document.documentElement.style.overflow = ho;
      window.scrollTo(0, sy);
      document.removeEventListener('touchmove', stopTouch);
      document.removeEventListener('click', blockClicks, true);
    };
  }, []);

  // ── Step runner ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!welcomed) return;

    let cancelled = false; // closure-local; never affected by another effect

    setPhase('playing');
    setRect(null);
    setAnimateSpot(false);
    setCursorPos({ x: -100, y: -100 });
    setCursorPulse(false);

    const sleep = ms => new Promise(r => setTimeout(r, ms));

    let ckSeq = 0;
    // show() updates tooltip text immediately — call it as the FIRST thing
    // in each step so the UI updates the moment the user hits Next.
    function show(id, title, desc) {
      if (cancelled) return;
      ckSeq++;
      setTooltip({ stepId: id, title, desc });
      setContentKey(ckSeq);
    }

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
      await sleep(360);
      if (cancelled) return null;
      const r = el.getBoundingClientRect();
      setCursorPos({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
      setRect({ top: r.top, left: r.left, right: r.right, bottom: r.bottom });
      setAnimateSpot(true);
      await sleep(420);
      return cancelled ? null : el;
    }

    async function tap(elOrSelector) {
      if (cancelled) return;
      const el = await moveTo(elOrSelector);
      if (!el) return;
      setCursorPulse(true);
      await sleep(150);
      el.click();
      await sleep(190);
      setCursorPulse(false);
      await sleep(260);
    }

    async function type(elOrSelector, text) {
      if (cancelled) return;
      const el = await moveTo(elOrSelector);
      if (!el) return;
      setNativeValue(el, '');
      await sleep(65);
      for (let i = 1; i <= text.length; i++) {
        if (cancelled) break;
        setNativeValue(el, text.slice(0, i));
        await sleep(46);
      }
      await sleep(190);
    }

    // ══ STEP 1 ═══════════════════════════════════════════════════════════════
    async function step1() {
      // Show text IMMEDIATELY so UI updates the instant this step starts
      show(1, 'Business name & phone', 'These show at the top of every invoice. Tap to edit.');
      navigate('invoice');
      clearSpot();
      await sleep(750);
      await waitForUser(false);
      if (cancelled) return;

      // Business name
      await tap('[data-tutorial="invoice-biz-name-btn"]');
      await sleep(250);
      const nameInput = document.querySelector('[data-tutorial="invoice-biz-name-input"]');
      if (nameInput) {
        show(1, 'Type your business name', 'Prints on every invoice PDF.');
        await moveTo(nameInput);
        setNativeValue(nameInput, '');
        await sleep(60);
        const name = 'J&Y Distributions';
        for (let i = 1; i <= name.length; i++) {
          if (cancelled) break;
          setNativeValue(nameInput, name.slice(0, i));
          await sleep(48);
        }
        await sleep(360);
        nameInput.dispatchEvent(new Event('blur', { bubbles: true }));
        await sleep(420);
      }

      // Phone
      await tap('[data-tutorial="invoice-biz-phone-btn"]');
      await sleep(250);
      const phoneInput = document.querySelector('[data-tutorial="invoice-biz-phone-input"]');
      if (phoneInput) {
        show(1, 'Add a phone number', 'Optional — also appears on the invoice.');
        await moveTo(phoneInput);
        setNativeValue(phoneInput, '');
        await sleep(60);
        const phone = '(555) 123-4567';
        for (let i = 1; i <= phone.length; i++) {
          if (cancelled) break;
          setNativeValue(phoneInput, phone.slice(0, i));
          await sleep(52);
        }
        await sleep(360);
        phoneInput.dispatchEvent(new Event('blur', { bubbles: true }));
        await sleep(420);
      }

      clearSpot();
      show(1, 'Saved!', 'Both appear at the top of every invoice.');
      await waitForUser(true);
    }

    // ══ STEP 2 ═══════════════════════════════════════════════════════════════
    async function step2() {
      show(2, 'Create an invoice', 'Enter the store, add your items, then generate.');
      navigate('invoice');
      clearSpot();
      await sleep(750);
      await waitForUser(false);
      if (cancelled) return;

      await moveTo('[data-tutorial="invoice-store-name"]');
      show(2, 'Who are you delivering to?', 'Store name and contact person.');
      await waitForUser(false);
      if (cancelled) return;
      await type('input[placeholder="Sunrise Deli"]', 'Corner Store');
      await type('input[placeholder="John Smith"]',   'Mike Johnson');
      await sleep(180);

      await moveTo('[data-tutorial="invoice-add-item"]');
      show(2, 'Add items', 'Name, qty, price — then tap + Add Item.');
      await waitForUser(false);
      if (cancelled) return;
      await type('input[placeholder="GMan V Cut T-Shirt"]', 'GMan V Cut T-Shirt');
      const qtyEl = document.querySelector('input[placeholder="1"]');
      if (qtyEl) {
        await moveTo(qtyEl);
        setNativeValue(qtyEl, '');
        await sleep(55);
        setNativeValue(qtyEl, '2');
        qtyEl.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(190);
      }
      await type('input[placeholder="0.00"]', '9.99');
      const addBtn = Array.from(document.querySelectorAll('button'))
        .find(b => b.textContent.trim() === '+ Add Item');
      if (addBtn) { await tap(addBtn); await sleep(380); }

      await moveTo('[data-tutorial="invoice-generate"]');
      show(2, 'Generate', 'Saves the invoice and creates the PDF.');
      await waitForUser(false);
      if (cancelled) return;
      await tap('[data-tutorial="invoice-generate"]');
      await sleep(1100);

      clearSpot();
      show(2, 'Invoice created!', 'Download, share via WhatsApp, or start a new one.');
      await waitForUser(true);
    }

    // ══ STEP 3 ═══════════════════════════════════════════════════════════════
    async function step3() {
      show(3, 'Invoices', 'All your invoices are here. Tap one to expand it.');
      navigate('history');
      clearSpot();
      await sleep(750);
      await waitForUser(false);
      if (cancelled) return;

      await moveTo('[data-tutorial="invoice-expand-latest"]');
      show(3, 'Tap to expand', 'See all items inside the invoice.');
      await waitForUser(false);
      if (cancelled) return;
      await tap('[data-tutorial="invoice-expand-latest"]');
      await sleep(700);

      await moveTo('[data-tutorial="status-badge-latest"]');
      show(3, 'Payment status', 'Tap to switch: Unpaid → Paid → Partial.');
      await waitForUser(false);
      if (cancelled) return;
      await tap('[data-tutorial="status-badge-latest"]');
      await sleep(450);
      await tap('[data-tutorial="status-badge-latest"]');
      await sleep(450);
      await tap('[data-tutorial="status-badge-latest"]');
      await sleep(520);

      clearSpot();
      show(3, 'Collapse it', 'Tap Next to close the invoice back up.');
      await waitForUser(false);
      if (cancelled) return;
      await tap('[data-tutorial="invoice-expand-latest"]');
      await sleep(550);
      clearSpot();

      show(3, 'Got it!', 'Open any invoice to review or update its status.');
      await waitForUser(true);
    }

    // ══ STEP 4 ═══════════════════════════════════════════════════════════════
    async function step4() {
      show(4, 'Store balances', 'Tap a store name to see what they owe you.');
      navigate('history');
      clearSpot();
      await sleep(700);
      await waitForUser(false);
      if (cancelled) return;

      await moveTo('[data-tutorial="store-name-link"]');
      show(4, 'Tap the store', 'Opens a full invoice history for that store.');
      await waitForUser(false);
      if (cancelled) return;

      clearSpot();
      await tap('[data-tutorial="store-name-link"]');
      await sleep(1400);

      show(4, 'Balance view', 'See what this store owes. Tap Next to go back.');
      await waitForUser(false);
      if (cancelled) return;

      const backBtn = Array.from(document.querySelectorAll('button'))
        .find(b => b.textContent.includes('Back') || b.textContent.includes('←'));
      if (backBtn) { await tap(backBtn); } else { navigate('history'); }
      await sleep(560);
      clearSpot();

      show(4, 'Done!', 'Access store balances anytime from Invoices.');
      await waitForUser(true);
    }

    // ══ STEP 5 ═══════════════════════════════════════════════════════════════
    async function step5() {
      show(5, 'Products auto-save', 'Items you sell are saved here automatically.');
      navigate('products');
      clearSpot();
      await sleep(750);
      await waitForUser(false);
      if (cancelled) return;

      await moveTo('[data-tutorial="products-list"]');
      show(5, 'Your catalogue', 'Grows as you invoice. Swipe to remove a product.');
      await waitForUser(false);
      if (cancelled) return;
      await sleep(700);

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
      if (nextResolverRef.current) { nextResolverRef.current(); nextResolverRef.current = null; }
    };
  }, [stepIdx, replayKey, welcomed]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleNext() {
    if (nextResolverRef.current) {
      const r = nextResolverRef.current;
      nextResolverRef.current = null;
      r();
    }
  }
  function handleBack()     { if (stepIdx > 0) setStepIdx(s => s - 1); }
  function handleSeeAgain() { setReplayKey(k => k + 1); }

  if (!welcomed) {
    return (
      <>
        <Spotlight rect={null} animate={false} accent={accent} />
        <WelcomeScreen dark={dark} accent={accent} onStart={() => setWelcomed(true)} onSkip={onSkip} />
      </>
    );
  }

  return (
    <>
      <Spotlight rect={rect} animate={animateSpot} accent={accent} />
      <VisualCursor pos={cursorPos} pulse={cursorPulse} accent={accent} />
      <Tooltip
        stepId={tooltip.stepId}
        title={tooltip.title}
        desc={tooltip.desc}
        contentKey={contentKey}
        rect={rect}
        dark={dark}
        phase={phase}
        stepIdx={stepIdx}
        accent={accent}
        onSkip={onSkip}
        onNext={handleNext}
        onBack={handleBack}
        onSeeAgain={handleSeeAgain}
      />
    </>
  );
}
