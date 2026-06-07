/**
 * SOOnboardingTutorial — Store Owner onboarding. Same autoplay format as
 * OnboardingTutorial (driver) but walks through Request → Orders → Drivers.
 *
 * Props:
 *   navigate(page)  — app navigation
 *   onComplete()    — called when user finishes
 *   onSkip()        — called when user skips
 */

import { useState, useEffect, useRef } from 'react';
import { useTheme } from '../../context/ThemeContext';

const TOTAL     = 5;
const TOOLTIP_Z = 9200;
const CURSOR_Z  = 9300;
const BLOCK_Z   = 9100;

const TUT_PALETTE = [
  '#4A7BF7', '#f59e0b', '#ef4444',
  '#8b5cf6', '#06b6d4', '#ec4899', '#10b981',
];

function hexToRgb(hex) {
  const h = (hex || '#000').replace('#', '');
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}

function getTutAccent(appAccent) {
  const [ar,ag,ab] = hexToRgb(appAccent);
  let best = TUT_PALETTE[0], bestDist = -1;
  for (const c of TUT_PALETTE) {
    const [r,g,b] = hexToRgb(c);
    const d = (r-ar)**2 + (g-ag)**2 + (b-ab)**2;
    if (d > bestDist) { bestDist = d; best = c; }
  }
  return best;
}

function setNativeValue(el, value) {
  if (!el) return;
  const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  s.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

// ─── Visual cursor dot ────────────────────────────────────────────────────────

function VisualCursor({ pos, pulse, accent }) {
  return (
    <div style={{
      position: 'fixed',
      left: pos.x - 12, top: pos.y - 12,
      width: 24, height: 24, borderRadius: '50%',
      background: pulse ? accent : 'rgba(255,255,255,0.95)',
      border: `3px solid ${accent}`,
      zIndex: CURSOR_Z, pointerEvents: 'none',
      transition: [
        'left 0.28s cubic-bezier(0.45,0.05,0.55,0.95)',
        'top  0.28s cubic-bezier(0.45,0.05,0.55,0.95)',
        'background 0.15s ease', 'transform 0.15s ease', 'box-shadow 0.15s ease',
      ].join(', '),
      transform: pulse ? 'scale(0.55)' : 'scale(1)',
      boxShadow: pulse
        ? `0 0 0 9px ${accent}35, 0 0 0 18px ${accent}15`
        : `0 2px 12px rgba(0,0,0,0.45)`,
    }} />
  );
}

// ─── Invisible blocker ────────────────────────────────────────────────────────

function Blocker() {
  const stopTouch = e => e.preventDefault();
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: BLOCK_Z, background: 'transparent', touchAction: 'none' }}
      onTouchMove={stopTouch}
    />
  );
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────

function Tooltip({ stepId, title, desc, contentKey, rect, dark, phase, stepIdx, accent, onSkip, onNext, onBack, onSeeAgain }) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const tooltipW  = Math.min(vw - 24, 400);
  const TOOLTIP_H = 270;
  const PAD       = 20;

  let tooltipTop;
  if (!rect) {
    tooltipTop = stepIdx === 0 ? PAD + 48 : vh - TOOLTIP_H - PAD;
  } else if (stepIdx === 0) {
    tooltipTop = rect.bottom + 14;
  } else {
    const elementMidY = (rect.top + rect.bottom) / 2;
    tooltipTop = elementMidY <= vh / 2
      ? vh - TOOLTIP_H - PAD
      : PAD + 48;
  }
  tooltipTop = Math.max(8, Math.min(vh - TOOLTIP_H - 8, tooltipTop));

  const showBack = stepIdx > 0 && phase !== 'playing';
  const isLast   = stepIdx === TOTAL - 1;

  return (
    <div
      data-tutorial-ui="tooltip"
      style={{
        position: 'fixed',
        top: tooltipTop,
        left: Math.max(12, (vw - tooltipW) / 2),
        width: tooltipW,
        zIndex: TOOLTIP_Z,
        background: dark ? '#1c1c20' : '#ffffff',
        borderRadius: 22, padding: '18px 20px 16px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
        border: `1px solid ${dark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)'}`,
        touchAction: 'none', WebkitUserSelect: 'none', userSelect: 'none',
        transition: 'top 0.4s cubic-bezier(0.4,0,0.2,1)',
      }}
    >
      {/* Step label + Skip */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
        <span style={{ fontSize:12, fontWeight:700, color:accent, letterSpacing:'0.07em', textTransform:'uppercase' }}>
          Step {stepId} of {TOTAL}
        </span>
        <button data-tutorial-ui="skip-btn" onClick={onSkip} style={{
          background:'none', border:'none', cursor:'pointer', fontSize:14, fontWeight:600,
          color: dark ? 'rgba(255,255,255,0.30)' : 'rgba(0,0,0,0.27)',
          padding:'3px 8px', borderRadius:8, WebkitTapHighlightColor:'transparent',
        }}>Skip</button>
      </div>

      {/* Progress bar */}
      <div style={{ display:'flex', gap:5, marginBottom:14 }}>
        {Array.from({ length: TOTAL }).map((_,i) => (
          <div key={i} style={{
            flex:1, height:4, borderRadius:2,
            background: i < stepId ? accent : (dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.10)'),
            opacity: i < stepId - 1 ? 0.42 : 1, transition:'background 0.3s',
          }} />
        ))}
      </div>

      {/* Text */}
      <div key={contentKey} style={{ animation:'tut-fadein 0.18s ease both' }}>
        <div style={{ fontSize:17, fontWeight:800, color: dark ? '#fff' : '#111', marginBottom:6, lineHeight:1.25 }}>{title}</div>
        <div style={{ fontSize:14, color: dark ? 'rgba(255,255,255,0.58)' : 'rgba(0,0,0,0.50)', lineHeight:1.6 }}>{desc}</div>
      </div>

      {/* Action buttons */}
      {phase !== 'playing' && (
        <div style={{ display:'flex', gap:8, marginTop:16 }}>
          {showBack && (
            <button data-tutorial-ui="back-btn" onClick={onBack} style={{
              flex:1, height:46, borderRadius:13, border:'none',
              background: dark ? '#2a2a30' : '#f0f0f3',
              color: dark ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.55)',
              fontSize:15, fontWeight:600, cursor:'pointer', WebkitTapHighlightColor:'transparent',
            }}>← Back</button>
          )}
          {phase === 'end-pause' && (
            <button data-tutorial-ui="see-again-btn" onClick={onSeeAgain} style={{
              flex:1, height:46, borderRadius:13, border:'none',
              background: dark ? '#2a2a30' : '#f0f0f3',
              color: dark ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.55)',
              fontSize:15, fontWeight:600, cursor:'pointer', WebkitTapHighlightColor:'transparent',
            }}>Again</button>
          )}
          <button data-tutorial-ui="next-btn" onClick={onNext} style={{
            flex:2, height:46, borderRadius:13, border:'none',
            background: accent, color:'#fff',
            fontSize:16, fontWeight:700, cursor:'pointer', WebkitTapHighlightColor:'transparent',
            boxShadow: `0 5px 18px ${accent}60`,
          }}>
            {phase === 'end-pause' && isLast ? "Let's go!" : 'Next →'}
          </button>
        </div>
      )}

      {phase === 'playing' && (
        <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:12 }}>
          <div style={{ width:7, height:7, borderRadius:4, background:accent, animation:'tut-blink 1.1s ease-in-out infinite' }} />
          <span style={{ fontSize:13, fontWeight:500, color: dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.30)' }}>Watch…</span>
        </div>
      )}
    </div>
  );
}

// ─── Welcome screen ────────────────────────────────────────────────────────────

function WelcomeScreen({ dark, accent, onStart, onSkip }) {
  return (
    <div data-tutorial-ui="welcome" style={{
      position:'fixed', inset:0, zIndex:TOOLTIP_Z,
      background: dark ? 'rgba(0,0,0,0.82)' : 'rgba(0,0,0,0.45)',
      display:'flex', alignItems:'center', justifyContent:'center', padding:24,
    }}>
      <div style={{
        width:'100%', maxWidth:340,
        background: dark ? '#1c1c20' : '#ffffff',
        borderRadius:24, padding:'30px 22px 22px',
        boxShadow:'0 24px 64px rgba(0,0,0,0.6)',
        border:`1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'}`,
        textAlign:'center', animation:'tut-fadein 0.3s ease both',
      }}>
        {/* Store icon */}
        <div style={{
          width:60, height:60, borderRadius:16, background:accent,
          margin:'0 auto 14px', display:'flex', alignItems:'center', justifyContent:'center',
          boxShadow:`0 10px 28px ${accent}55`,
        }}>
          <svg width={32} height={32} viewBox="0 0 36 36" fill="none">
            <rect x="4" y="16" width="28" height="16" rx="2" stroke="white" strokeWidth="2.2" fill="none" />
            <path d="M4 16l4-10h20l4 10" stroke="white" strokeWidth="2.2" fill="none" strokeLinejoin="round" />
            <rect x="13" y="22" width="10" height="10" rx="1.5" stroke="white" strokeWidth="2" fill="none" />
          </svg>
        </div>
        <div style={{ fontSize:21, fontWeight:900, letterSpacing:'-0.4px', color: dark ? '#fff' : '#111', marginBottom:8 }}>
          Welcome to <span style={{ color:accent }}>InvoGo!</span>
        </div>
        <div style={{ fontSize:13, color: dark ? 'rgba(255,255,255,0.52)' : 'rgba(0,0,0,0.48)', lineHeight:1.6, marginBottom:24 }}>
          Quick tour of your store owner tools — takes about a minute.
        </div>
        <button data-tutorial-ui="welcome-start" onClick={onStart} style={{
          width:'100%', height:46, borderRadius:13, border:'none',
          background:accent, color:'#fff', fontSize:15, fontWeight:700,
          cursor:'pointer', WebkitTapHighlightColor:'transparent',
          boxShadow:`0 6px 20px ${accent}55`, marginBottom:9,
        }}>Show me around</button>
        <button data-tutorial-ui="welcome-skip" onClick={onSkip} style={{
          width:'100%', height:38, borderRadius:11, border:'none',
          background:'none', color: dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.32)',
          fontSize:13, fontWeight:500, cursor:'pointer', WebkitTapHighlightColor:'transparent',
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

export default function SOOnboardingTutorial({ navigate, onComplete, onSkip }) {
  const { dark, accent: appAccent } = useTheme();
  const accent = getTutAccent(appAccent);

  const [welcomed,    setWelcomed]    = useState(false);
  const [cursorPos,   setCursorPos]   = useState({ x: -100, y: -100 });
  const [cursorPulse, setCursorPulse] = useState(false);
  const [rect,        setRect]        = useState(null);
  const [tooltip,     setTooltip]     = useState({ stepId:1, title:'', desc:'' });
  const [contentKey,  setContentKey]  = useState(0);
  const [stepIdx,     setStepIdx]     = useState(0);
  const [replayKey,   setReplayKey]   = useState(0);
  const [phase,       setPhase]       = useState('playing');

  const nextResolverRef = useRef(null);

  useEffect(() => { ensureKeyframes(); }, []);

  // ── Global click + touch blocker ─────────────────────────────────────────
  useEffect(() => {
    const stopTouch = e => e.preventDefault();
    document.addEventListener('touchmove', stopTouch, { passive: false });
    function blockClicks(e) {
      if (!e.isTrusted) return;
      if (e.target.closest?.('[data-tutorial-ui]')) return;
      e.stopPropagation(); e.preventDefault();
    }
    document.addEventListener('click', blockClicks, true);
    return () => {
      document.removeEventListener('touchmove', stopTouch);
      document.removeEventListener('click', blockClicks, true);
    };
  }, []);

  // ── Step runner ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!welcomed) return;

    let cancelled = false;

    setPhase('playing');
    setRect(null);
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

    function clearCursor() {
      setRect(null);
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
      await sleep(180);
      if (cancelled) return null;
      const r = el.getBoundingClientRect();
      setCursorPos({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
      await sleep(300);
      return cancelled ? null : el;
    }

    async function tap(elOrSelector) {
      if (cancelled) return;
      const el = await moveTo(elOrSelector);
      if (!el) return;
      await sleep(50);
      setCursorPulse(true);
      await sleep(80);
      el.click();
      await sleep(80);
      setCursorPulse(false);
      await sleep(120);
    }

    async function type(elOrSelector, text, charDelay = 22) {
      if (cancelled) return;
      const el = await moveTo(elOrSelector);
      if (!el) return;
      setNativeValue(el, '');
      await sleep(30);
      for (let i = 1; i <= text.length; i++) {
        if (cancelled) break;
        setNativeValue(el, text.slice(0, i));
        await sleep(charDelay);
      }
      await sleep(80);
    }

    // ══ STEP 1 — New Request ══════════════════════════════════════════════════
    async function step1() {
      show(1, 'Place a delivery request', 'Fill in what you need, pick a date, and your driver gets notified.');
      navigate('so-request');
      clearCursor();
      await sleep(400);
      await waitForUser(false);
      if (cancelled) return;

      // Anchor tooltip near product field
      const productEl = document.querySelector('[data-tutorial="so-request-product"]');
      if (productEl) {
        const r = productEl.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, right: r.right, bottom: r.bottom });
      }

      await type('[data-tutorial="so-request-product"]', 'Whole Milk 1 Gal', 28);
      await sleep(150);

      await type('[data-tutorial="so-request-qty"]', '12', 28);
      await sleep(150);

      // Set date input to tomorrow
      const dateEl = document.querySelector('[data-tutorial="so-request-date"]');
      if (dateEl) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const iso = tomorrow.toISOString().split('T')[0];
        await moveTo(dateEl);
        setNativeValue(dateEl, iso);
        dateEl.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(200);
      }

      // Move cursor to submit and pause
      await moveTo('[data-tutorial="so-request-submit"]');
      show(1, 'Tap Send Request', 'Your request is sent straight to your driver.');
      await waitForUser(true);
    }

    // ══ STEP 2 — Orders ═══════════════════════════════════════════════════════
    async function step2() {
      show(2, 'Track your requests', 'Every request shows up here. Tap one to update its status.');
      navigate('so-orders');
      clearCursor();
      await sleep(500);
      await waitForUser(false);
      if (cancelled) return;

      // Try to expand the first order card if any exist
      const firstCard = document.querySelector('[data-tutorial="so-order-card"]');
      if (firstCard) {
        setRect(firstCard.getBoundingClientRect());
        await tap(firstCard);
        await sleep(400);
        show(2, 'Update the status', 'Mark orders Accepted or Delivered as they progress.');
        await waitForUser(false);
        if (cancelled) return;
        // Collapse it
        await tap(firstCard);
        await sleep(200);
      } else {
        // Empty state — show the filter pills
        const filterRow = document.querySelector('[data-tutorial="so-orders-filters"]');
        if (filterRow) {
          setRect(filterRow.getBoundingClientRect());
          await moveTo(filterRow);
          await sleep(200);
        }
        show(2, 'Filter by status', 'Use Pending, Accepted, or Delivered to focus on what matters.');
        await waitForUser(false);
        if (cancelled) return;
      }

      clearCursor();
      show(2, 'Got it!', 'Accepted and Delivered statuses keep you and your driver in sync.');
      await waitForUser(true);
    }

    // ══ STEP 3 — Drivers ══════════════════════════════════════════════════════
    async function step3() {
      show(3, 'Manage your drivers', 'Add drivers and list what they carry so you always order from the right person.');
      navigate('so-drivers');
      clearCursor();
      await sleep(500);
      await waitForUser(false);
      if (cancelled) return;

      // Tap + Add to open the form
      const addBtn = document.querySelector('[data-tutorial="so-drivers-add-btn"]');
      if (addBtn) {
        setRect(addBtn.getBoundingClientRect());
        await tap(addBtn);
        await sleep(300);

        // Type a driver name
        const nameInput = document.querySelector('[data-tutorial="so-drivers-name-input"]');
        if (nameInput) {
          await type(nameInput, 'John Smith', 28);
          await sleep(200);
        }

        show(3, 'Add phone & inventory', 'Note what products each driver carries — makes ordering fast.');
        await waitForUser(false);
        if (cancelled) return;

        // Tap Cancel (same button now shows "Cancel")
        const cancelBtn = document.querySelector('[data-tutorial="so-drivers-add-btn"]');
        if (cancelBtn) { await tap(cancelBtn); await sleep(200); }
      }

      clearCursor();
      show(3, 'Driver directory', 'Your drivers show up here ready to assign to any request.');
      await waitForUser(true);
    }

    // ══ STEP 4 — Hamburger menu ═══════════════════════════════════════════════
    async function step4() {
      show(4, 'More at your fingertips', 'Tap the menu icon for your dashboard, settings, notes, and more.');
      clearCursor();
      await sleep(300);
      await waitForUser(false);
      if (cancelled) return;

      const hamburger = document.querySelector('[data-tutorial="hamburger"]');
      if (hamburger) {
        const r = hamburger.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, right: r.right, bottom: r.bottom });
        await moveTo(hamburger);
        setCursorPulse(true);
        await sleep(600);
        setCursorPulse(false);
        await sleep(200);
      }

      show(4, 'Dashboard, Settings & more', 'Your order summary, app preferences, and profile all live in that menu.');
      await waitForUser(true);
    }

    // ══ STEP 5 — Done! ════════════════════════════════════════════════════════
    async function step5() {
      show(5, "You're all set!", 'Start by placing your first request — your driver will see it right away.');
      navigate('so-request');
      clearCursor();
      await sleep(300);
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

  function handleNext()     { if (nextResolverRef.current) { const r = nextResolverRef.current; nextResolverRef.current = null; r(); } }
  function handleBack()     { if (stepIdx > 0) setStepIdx(s => s - 1); }
  function handleSeeAgain() { setReplayKey(k => k + 1); }

  if (!welcomed) {
    return (
      <>
        <Blocker />
        <WelcomeScreen dark={dark} accent={accent} onStart={() => setWelcomed(true)} onSkip={onSkip} />
      </>
    );
  }

  return (
    <>
      <Blocker />
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
