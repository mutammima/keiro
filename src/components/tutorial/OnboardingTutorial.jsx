/**
 * OnboardingTutorial — Fully automated demo / autoplay.
 *
 * Plays through 5 steps on its own with a visual cursor and character-by-character
 * typing. The user cannot interact with the app during playback — only the "Skip"
 * button is reachable. No "Next" button, no "do it yourself" hint.
 *
 * Step order (business name first):
 *   1. Set business name  (Settings overlay)
 *   2. Create an invoice  (New tab — store, item, generate)
 *   3. Mark invoice paid  (Invoices tab — status badge)
 *   4. Store balance      (tap store name → StoreBalance overlay → back)
 *   5. Products auto-save (Products tab)
 */

import { useState, useEffect, useRef } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { ACCENT } from '../../theme';

// ── Constants ─────────────────────────────────────────────────────────────────

const TOTAL     = 5;
const OVERLAY_Z = 9100;
const TOOLTIP_Z = 9200;
const CURSOR_Z  = 9300;
const PAD       = 5;   // tight spotlight — hugs the element

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
      {/* Four blocking panels */}
      <div style={{ ...base, top: 0,      left: 0,     right: 0,    height: top    }} {...pp} />
      <div style={{ ...base, top: bottom, left: 0,     right: 0,    bottom: 0      }} {...pp} />
      <div style={{ ...base, top,         left: 0,     width: left, height: h      }} {...pp} />
      <div style={{ ...base, top,         left: right, right: 0,    height: h      }} {...pp} />

      {/* Glow ring */}
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

// ── Tooltip card (no Next button) ─────────────────────────────────────────────

function Tooltip({ stepId, title, desc, rect, dark, onSkip }) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const tooltipW  = Math.min(320, vw - 32);
  const TOOLTIP_H = 155;

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
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OnboardingTutorial({ navigate, onComplete, onSkip }) {
  const { dark } = useTheme();

  const [cursorPos,   setCursorPos]   = useState({ x: -100, y: -100 });
  const [cursorPulse, setCursorPulse] = useState(false);
  const [rect,        setRect]        = useState(null);
  const [tooltip,     setTooltip]     = useState({
    stepId: 1,
    title:  'Welcome to InvoGo!',
    desc:   "Let's take a quick tour of the app.",
  });

  const abortRef = useRef(false);

  // ── Touch + click lock (user cannot interact during autoplay) ─────────────
  useEffect(() => {
    const savedBodyOverflow = document.body.style.overflow;
    const savedBodyPosition = document.body.style.position;
    const savedHtmlOverflow = document.documentElement.style.overflow;
    const savedScrollY      = window.scrollY;

    document.body.style.overflow             = 'hidden';
    document.body.style.position             = 'fixed';
    document.body.style.top                  = `-${savedScrollY}px`;
    document.body.style.width                = '100%';
    document.documentElement.style.overflow  = 'hidden';

    const stopTouch = e => e.preventDefault();
    document.addEventListener('touchmove', stopTouch, { passive: false });

    // Block all real (trusted) user clicks — only Skip is exempted via data-tutorial-ui
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

  // ── Autoplay sequence ─────────────────────────────────────────────────────
  useEffect(() => {
    abortRef.current = false;

    // Helpers — defined inline so they close over state setters directly
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    const show = (stepId, title, desc) => setTooltip({ stepId, title, desc });

    /** Move cursor to element, scroll it into view, update spotlight rect */
    async function moveTo(elOrSelector) {
      if (abortRef.current) return null;
      const el = typeof elOrSelector === 'string'
        ? document.querySelector(elOrSelector)
        : elOrSelector;
      if (!el) return null;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await sleep(420);
      const r = el.getBoundingClientRect();
      setCursorPos({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
      setRect({ top: r.top, left: r.left, right: r.right, bottom: r.bottom });
      await sleep(480);
      return el;
    }

    /** Move cursor to element then programmatically click it */
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

    /** Move cursor to input then type text character-by-character */
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

    async function run() {

      // ══ STEP 1 — Business name ══════════════════════════════════════════════
      show(1, 'Welcome to InvoGo!', "First, let's set your business name — it appears on every invoice.");
      navigate('settings');
      await sleep(1100);

      await moveTo('[data-tutorial="settings-biz-name"]');
      show(1, 'Your business name', 'This prints at the top of every invoice you generate.');
      await sleep(350);
      await type('[data-tutorial="settings-biz-name"]', 'J&Y Distributions');
      await tap('[data-tutorial="settings-save-btn"]');
      await sleep(600);

      // ══ STEP 2 — Create an invoice ══════════════════════════════════════════
      navigate('invoice');
      await sleep(900);
      setRect(null);
      show(2, 'This is the New Invoice page', 'Fill in the store details, add the products you delivered, then generate.');
      await sleep(1700);

      // Store name + customer
      await moveTo('[data-tutorial="invoice-store-name"]');
      show(2, 'Enter store details', 'Type the store name and contact person.');
      await sleep(350);
      await type('input[placeholder="Sunrise Deli"]', 'Corner Store');
      await type('input[placeholder="John Smith"]',   'Mike Johnson');
      await sleep(300);

      // Add item section
      await moveTo('[data-tutorial="invoice-add-item"]');
      show(2, 'Add a product', 'Enter the item name, quantity and price, then tap + Add Item.');
      await sleep(550);
      await type('input[placeholder="GMan V Cut T-Shirt"]', 'GMan V Cut T-Shirt');

      // Qty — default may be "1"; clear then type
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

      // + Add Item button
      const addBtn = Array.from(document.querySelectorAll('button'))
        .find(b => b.textContent.trim() === '+ Add Item');
      if (addBtn) {
        await tap(addBtn);
        await sleep(500);
      }

      // Generate
      await moveTo('[data-tutorial="invoice-generate"]');
      show(2, 'Generate the invoice', 'Tap Generate to save and record this invoice.');
      await sleep(550);
      await tap('[data-tutorial="invoice-generate"]');
      await sleep(1300);

      // ══ STEP 3 — Mark as paid ═══════════════════════════════════════════════
      navigate('history');
      await sleep(900);
      setRect(null);
      show(3, 'This is your Invoices page', 'Every invoice you create appears here, sorted by date.');
      await sleep(1700);

      await moveTo('[data-tutorial="status-badge-latest"]');
      show(3, 'Mark as paid', 'One tap on the status badge cycles it from Unpaid → Paid. Tap it when you collect payment.');
      await sleep(550);
      await tap('[data-tutorial="status-badge-latest"]');
      await sleep(1000);

      // ══ STEP 4 — Store balance ═══════════════════════════════════════════════
      show(4, 'Track store balances', 'Tap any store name to see its full payment history and running balance.');
      await moveTo('[data-tutorial="store-name-link"]');
      await sleep(550);
      await tap('[data-tutorial="store-name-link"]');
      await sleep(1800);

      // Tap the ← Back button on StoreBalance page
      const backBtn = Array.from(document.querySelectorAll('button'))
        .find(b => b.textContent.includes('Back') || b.textContent.includes('←'));
      if (backBtn) {
        await tap(backBtn);
      } else {
        navigate('history');
      }
      await sleep(700);

      // ══ STEP 5 — Products ═══════════════════════════════════════════════════
      navigate('products');
      await sleep(900);
      setRect(null);
      show(5, 'Products auto-save', 'Every item you sell is saved here automatically. Next time, InvoGo autofills it for you.');
      await moveTo('[data-tutorial="products-list"]');
      await sleep(2400);

      if (!abortRef.current) onComplete();
    }

    run();
    return () => { abortRef.current = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
        onSkip={onSkip}
      />
    </>
  );
}
