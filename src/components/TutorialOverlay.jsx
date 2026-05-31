/**
 * TutorialOverlay — animated step-by-step walkthrough of InvoiceGo.
 *
 * Every demo frame uses the real DARK / LIGHT / ACCENT tokens so it looks
 * identical to the live app — same bg, same card colour, same input radius.
 *
 * • Auto-shows on first launch (localStorage flag: inv_tutorial_seen)
 * • Accessible any time via "How it Works" in the sidebar
 * • Swipe left / right to navigate on mobile
 */

import { useState, useEffect, useRef } from 'react';
import { useTheme } from '../context/ThemeContext';
import { LIGHT, DARK, ACCENT } from '../theme';
import { AppLogoSVG } from './SplashScreen';

export function hasSeenTutorial() {
  try { return !!localStorage.getItem('inv_tutorial_seen'); } catch { return false; }
}
export function markTutorialSeen() {
  try { localStorage.setItem('inv_tutorial_seen', '1'); } catch {}
}

// ─── Keyframes (injected once) ────────────────────────────────────────────────
if (typeof document !== 'undefined' && !document.getElementById('tutor-kf')) {
  const el = document.createElement('style');
  el.id = 'tutor-kf';
  el.textContent = `
    @keyframes t-enter  { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
    @keyframes t-pop    { from{opacity:0;transform:scale(0.8)}        to{opacity:1;transform:scale(1)}     }
    @keyframes t-slide  { from{opacity:0;transform:translateX(-10px)} to{opacity:1;transform:translateX(0)}}
    @keyframes t-blink  { 0%,100%{opacity:1} 50%{opacity:0} }
    @keyframes t-pulse  { 0%,100%{transform:scale(1)} 50%{transform:scale(1.04)} }
    @keyframes t-float  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
  `;
  document.head.appendChild(el);
}

// ─── Steps ────────────────────────────────────────────────────────────────────

const STEPS = [
  { id: 'welcome',  title: 'Welcome to InvoiceGo',    desc: 'Create delivery invoices in seconds, track what every store owes you, and see your daily revenue — all from your phone.', Demo: DemoWelcome  },
  { id: 'customer', title: 'Fill in Customer Info',    desc: 'Enter the store name — phone and address auto-fill from past visits. Then add the customer name.', Demo: DemoCustomer },
  { id: 'items',    title: 'Add Items',                desc: 'Type a product name (or tap 📷 to scan a barcode). Enter quantity and price — a live total appears instantly.', Demo: DemoItems    },
  { id: 'generate', title: 'Generate & Share',         desc: 'Tap "Generate Invoice" to save it. A PDF opens in a new tab ready to share via AirDrop, WhatsApp, or email.', Demo: DemoGenerate },
  { id: 'history',  title: 'Invoice History',          desc: 'The ≡ tab shows all invoices. Search by store, see totals, and mark invoices Paid · Partial · Unpaid.', Demo: DemoHistory  },
  { id: 'reports',  title: 'Reports',                  desc: 'Open the sidebar and tap Reports for a revenue overview: weekly/monthly totals, top stores, top products, and a 7-day chart.', Demo: DemoReports  },
  { id: 'settings', title: 'Settings',                 desc: 'Sidebar → Settings to update your business name, phone, switch themes, manage pinned stores, and backup your data.', Demo: DemoSettings },
  { id: 'homescreen', title: 'Add to Your Home Screen', desc: 'Install InvoiceGo like a native app — no App Store needed. It works offline and opens full-screen.', Demo: DemoHomescreen },
  { id: 'done',       title: "You're all set!",        desc: 'That covers everything. Reopen this guide anytime from "How it Works" in the sidebar.', Demo: DemoDone     },
];

// ─── Main overlay ─────────────────────────────────────────────────────────────

export default function TutorialOverlay({ onClose }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  const [step, setStep] = useState(0);
  const total = STEPS.length;
  const { title, desc, Demo } = STEPS[step];

  function next()  { step < total - 1 ? setStep(s => s + 1) : close(); }
  function back()  { if (step > 0) setStep(s => s - 1); }
  function close() { markTutorialSeen(); onClose(); }

  const touchX = useRef(null);
  function onTouchStart(e) { touchX.current = e.touches[0].clientX; }
  function onTouchEnd(e) {
    if (touchX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if (dx < -50) next();
    else if (dx > 50) back();
  }

  const overlayBg = dark ? 'rgba(0,0,0,0.92)' : 'rgba(0,0,0,0.65)';
  const sheetBg   = C.card;
  const titleCol  = C.text;
  const descCol   = C.textMuted;
  const backCol   = C.textLight;

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 5000, background: overlayBg, display: 'flex', alignItems: 'flex-end' }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div style={{
        width: '100%',
        background: sheetBg,
        borderRadius: '24px 24px 0 0',
        paddingBottom: 'max(28px, env(safe-area-inset-bottom))',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '94dvh',
        overflow: 'hidden',
        position: 'relative',
      }}>
        {/* Progress dots */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, paddingTop: 16, paddingBottom: 0 }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{
              height: 7, borderRadius: 4,
              width: i === step ? 20 : 7,
              background: i === step ? ACCENT : (dark ? '#2a2a2a' : '#e4e4e7'),
              transition: 'all 0.3s ease',
            }} />
          ))}
        </div>

        {/* Skip */}
        <button
          style={{ position: 'absolute', top: 16, right: 20, background: 'none', border: 'none', color: backCol, fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: '4px 8px', WebkitTapHighlightColor: 'transparent' }}
          onClick={close}
        >
          Skip
        </button>

        {/* Demo area */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 0 10px', overflow: 'hidden' }}>
          <Demo key={step} dark={dark} C={C} />
        </div>

        {/* Text */}
        <div style={{ padding: '0 28px 20px', textAlign: 'center' }}>
          <h2 style={{ color: titleCol, fontSize: 20, fontWeight: 800, margin: '0 0 8px', letterSpacing: -0.3 }}>{title}</h2>
          <p  style={{ color: descCol,  fontSize: 14, lineHeight: 1.65, margin: 0 }}>{desc}</p>
        </div>

        {/* Nav */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 24px 8px' }}>
          <button
            style={{ background: 'none', border: 'none', color: backCol, fontSize: 15, fontWeight: 600, cursor: 'pointer', padding: '10px 4px', opacity: step === 0 ? 0.3 : 1, WebkitTapHighlightColor: 'transparent' }}
            onClick={back}
            disabled={step === 0}
          >
            ← Back
          </button>
          <button
            style={{ background: ACCENT, border: 'none', color: '#fff', fontSize: 15, fontWeight: 700, padding: '12px 32px', borderRadius: 16, cursor: 'pointer', boxShadow: '0 4px 20px rgba(74,123,247,0.35)', WebkitTapHighlightColor: 'transparent' }}
            onClick={next}
          >
            {step === total - 1 ? 'Get Started' : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Shared phone shell ───────────────────────────────────────────────────────
// Matches the visual weight of a real iPhone screen in the given theme.

function Phone({ dark, C, children }) {
  const border = dark ? '#222222' : '#d6d0c8';
  const notch  = dark ? '#0a0a0a' : '#e8e4df';
  return (
    <div style={{
      width: 220, height: 348,
      background: C.bg,
      borderRadius: 30,
      border: `2.5px solid ${border}`,
      overflow: 'hidden',
      position: 'relative',
      boxShadow: dark
        ? '0 24px 64px rgba(0,0,0,0.7)'
        : '0 24px 64px rgba(0,0,0,0.18)',
      display: 'flex',
      flexDirection: 'column',
      animation: 't-enter 0.4s ease both',
    }}>
      {/* Notch bar */}
      <div style={{ height: 22, background: notch, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 56, height: 9, background: dark ? '#1a1a1a' : '#d6d0c8', borderRadius: 5 }} />
      </div>
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
      {/* Bottom nav bar stub */}
      <div style={{ height: 36, background: dark ? '#0d0d0d' : '#f7f4f0', flexShrink: 0, borderTop: `1px solid ${dark ? '#1a1a1a' : '#e2ddd7'}`, display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '0 10px' }}>
        {[['＋','New'],['≡','Invoices'],['◈','Products']].map(([icon, label], i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
            <span style={{ fontSize: 13, color: i === 0 ? ACCENT : C.textMuted }}>{icon}</span>
            <span style={{ fontSize: 8, fontWeight: 600, color: i === 0 ? ACCENT : C.textMuted }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Tiny reusable field that matches the real app's input style
function Field({ label, value, focused, dark, C, delay = 0 }) {
  return (
    <div style={{ animation: `t-slide 0.3s ${delay}s ease both` }}>
      {label && <div style={{ color: C.textSub, fontSize: 9, fontWeight: 500, marginBottom: 3 }}>{label}</div>}
      <div style={{
        background: C.inputBg,
        border: `1px solid ${focused ? ACCENT : C.inputBorder}`,
        borderRadius: 10,
        height: 30,
        padding: '0 10px',
        display: 'flex',
        alignItems: 'center',
        gap: 3,
        transition: 'border-color 0.25s',
        boxSizing: 'border-box',
      }}>
        <span style={{ color: C.text, fontSize: 11, lineHeight: 1 }}>{value}</span>
        {focused && value !== undefined && (
          <span style={{ width: 1.5, height: 12, background: ACCENT, animation: 't-blink 0.8s infinite', flexShrink: 0 }} />
        )}
      </div>
    </div>
  );
}

// Section label — same uppercase pill style as the app
function SectionLabel({ text, C }) {
  return <div style={{ color: C.textMuted, fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{text}</div>;
}

// Card — same 18px radius, same bg
function Card({ C, dark, children, style }) {
  return (
    <div style={{
      background: C.card,
      borderRadius: 14,
      padding: '10px 12px',
      border: `1px solid ${C.cardBorder || 'transparent'}`,
      ...style,
    }}>
      {children}
    </div>
  );
}

// ─── Demo: Welcome ────────────────────────────────────────────────────────────
function DemoWelcome({ dark, C }) {
  return (
    <Phone dark={dark} C={C}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '0 20px' }}>
        <div style={{
          width: 64, height: 64, borderRadius: 18,
          background: ACCENT,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 12px 36px ${ACCENT}55`,
          animation: 't-float 2.5s ease-in-out infinite',
        }}>
          <AppLogoSVG size={36} />
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: C.text, fontWeight: 800, fontSize: 16, letterSpacing: 0.3 }}>InvoiceGo</div>
          <div style={{ color: C.textMuted, fontSize: 10, marginTop: 4, lineHeight: 1.5 }}>Delivery invoicing, simplified</div>
        </div>
        {/* feature chips */}
        {[['📄','Invoices'],['📊','Reports'],['⚙','Settings']].map(([icon, label], i) => (
          <div key={i} style={{
            background: C.card,
            border: `1px solid ${C.cardBorder || C.divider}`,
            borderRadius: 20, padding: '5px 14px',
            display: 'flex', alignItems: 'center', gap: 6,
            animation: `t-pop 0.35s ${0.1 + i * 0.12}s ease both`,
          }}>
            <span style={{ fontSize: 12 }}>{icon}</span>
            <span style={{ color: C.text, fontSize: 11, fontWeight: 600 }}>{label}</span>
          </div>
        ))}
      </div>
    </Phone>
  );
}

// ─── Demo: Customer ───────────────────────────────────────────────────────────
function DemoCustomer({ dark, C }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(v => (v + 1) % 72), 110);
    return () => clearInterval(t);
  }, []);
  const storeTxt  = 'Sunrise Deli'.slice(0, Math.min(12, Math.floor(tick / 3)));
  const custTxt   = 'John Smith'.slice(0, Math.max(0, Math.min(10, Math.floor((tick - 22) / 3))));
  const autoFill  = tick > 38;
  const focusStore = tick < 22;
  const focusCust  = tick >= 22 && tick < 60;

  return (
    <Phone dark={dark} C={C}>
      {/* Header strip matching the real sticky header */}
      <div style={{ background: dark ? 'rgba(0,0,0,0.88)' : 'rgba(244,244,245,0.88)', padding: '6px 12px 5px', borderBottom: `1px solid ${C.divider}` }}>
        <div style={{ color: C.text, fontSize: 11, fontWeight: 800, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 1.2 }}>J&Y Distributions</div>
      </div>
      <div style={{ flex: 1, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 7, overflowY: 'hidden' }}>
        <Card C={C} dark={dark}>
          <SectionLabel text="Customer" C={C} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Field label="Store Name *"    value={storeTxt} focused={focusStore} dark={dark} C={C} delay={0}   />
            <Field label="Customer Name *" value={custTxt}  focused={focusCust}  dark={dark} C={C} delay={0.05}/>
            {autoFill && (
              <div style={{ background: dark ? '#0D2B20' : '#f0fdf4', borderRadius: 8, padding: '5px 8px', animation: 't-pop 0.25s ease both' }}>
                <span style={{ color: dark ? '#2ECC8A' : '#16a34a', fontSize: 9, fontWeight: 700 }}>✓ Phone & address auto-filled</span>
              </div>
            )}
            <Field label="Phone"   value={autoFill ? '(718) 555-0123' : ''} dark={dark} C={C} />
            <Field label="Address" value={autoFill ? '123 Main St, Brooklyn' : ''} dark={dark} C={C} />
          </div>
        </Card>
      </div>
    </Phone>
  );
}

// ─── Demo: Items ──────────────────────────────────────────────────────────────
function DemoItems({ dark, C }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(v => (v + 1) % 88), 120);
    return () => clearInterval(t);
  }, []);
  const prodTxt   = 'Marlboro Reds'.slice(0, Math.min(13, Math.floor(tick / 2)));
  const showQtyPr = tick > 26;
  const qtyVal    = tick > 36 ? '2' : '';
  const priceVal  = tick > 46 ? '12.50' : '';
  const showTotal = tick > 50;
  const showAdded = tick > 68;

  return (
    <Phone dark={dark} C={C}>
      <div style={{ flex: 1, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 7, overflowY: 'hidden' }}>
        <Card C={C} dark={dark}>
          <SectionLabel text="Add Item" C={C} />
          {/* product row */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', marginBottom: 6 }}>
            <div style={{ flex: 1 }}>
              <Field label="Product Name *" value={prodTxt} focused={tick < 27} dark={dark} C={C} />
            </div>
            <div style={{
              width: 30, height: 30, flexShrink: 0,
              background: C.inputBg, border: `1px solid ${C.inputBorder}`, borderRadius: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
            }}>📷</div>
          </div>

          {showQtyPr && (
            <div style={{ display: 'flex', gap: 6, animation: 't-slide 0.3s ease both' }}>
              <div style={{ flex: 1 }}><Field label="Qty *" value={qtyVal} focused={tick > 36 && tick <= 46} dark={dark} C={C} /></div>
              <div style={{ flex: 1 }}><Field label="Price ($) *" value={priceVal} focused={tick > 46 && tick <= 55} dark={dark} C={C} /></div>
            </div>
          )}

          {showTotal && (
            <div style={{
              background: C.rowBg, borderRadius: 8,
              padding: '7px 10px', marginTop: 6,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              animation: 't-pop 0.25s ease both',
            }}>
              <span style={{ color: C.textMuted, fontSize: 10 }}>2 × $12.50</span>
              <span style={{ color: C.text, fontSize: 13, fontWeight: 800 }}>= $25.00</span>
            </div>
          )}

          {showAdded ? (
            <div style={{ background: dark ? '#0D2B20' : '#f0fdf4', borderRadius: 8, padding: '6px 10px', marginTop: 6, animation: 't-pop 0.25s ease both' }}>
              <span style={{ color: dark ? '#2ECC8A' : '#16a34a', fontSize: 9, fontWeight: 700 }}>✓ Item added to invoice</span>
            </div>
          ) : (
            <div style={{
              marginTop: 8, height: 30,
              background: C.rowBg, borderRadius: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ color: C.textSub, fontSize: 11, fontWeight: 600 }}>+ Add Item</span>
            </div>
          )}
        </Card>
      </div>
    </Phone>
  );
}

// ─── Demo: Generate ───────────────────────────────────────────────────────────
function DemoGenerate({ dark, C }) {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 900);
    const t2 = setTimeout(() => setPhase(2), 1900);
    const t3 = setTimeout(() => setPhase(3), 2900);
    const t4 = setTimeout(() => setPhase(0), 4800);
    return () => [t1,t2,t3,t4].forEach(clearTimeout);
  }, []);

  const btnLabel = phase === 0 ? 'Generate Invoice' : phase === 1 ? 'Saving…' : '✓ Invoice Saved';
  const btnBg    = phase === 2 || phase === 3 ? '#16a34a' : ACCENT;

  return (
    <Phone dark={dark} C={C}>
      <div style={{ flex: 1, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 7, overflowY: 'hidden' }}>
        {/* Invoice preview */}
        <Card C={C} dark={dark}>
          <SectionLabel text="Items" C={C} />
          {[['Marlboro Reds','2×','$25.00'],['Newport 100s','3×','$30.00']].map(([n,q,t], i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: i === 0 ? `1px solid ${C.divider}` : 'none' }}>
              <span style={{ color: C.text, fontSize: 10, fontWeight: 500 }}>{n}</span>
              <span style={{ color: C.textMuted, fontSize: 10 }}>{q}</span>
              <span style={{ color: C.text, fontSize: 10, fontWeight: 700 }}>{t}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, paddingTop: 6, borderTop: `1px solid ${C.divider}` }}>
            <span style={{ color: C.textSub, fontSize: 11, fontWeight: 700 }}>Total</span>
            <span style={{ color: ACCENT, fontSize: 13, fontWeight: 800 }}>$55.00</span>
          </div>
        </Card>

        {/* Generate button */}
        <button style={{
          height: 38, background: btnBg, border: 'none', borderRadius: 14,
          color: '#fff', fontSize: 12, fontWeight: 700,
          animation: phase === 0 ? 't-pulse 1.8s ease-in-out infinite' : 'none',
          transition: 'background 0.3s',
          cursor: 'pointer',
        }}>
          {btnLabel}
        </button>

        {phase >= 2 && (
          <Card C={C} dark={dark} style={{ animation: 't-pop 0.3s ease both' }}>
            <div style={{ color: ACCENT, fontSize: 10, fontWeight: 700, marginBottom: 3 }}>📄 PDF ready — opens in new tab</div>
            <div style={{ color: C.textMuted, fontSize: 9 }}>Share via AirDrop · WhatsApp · Email</div>
          </Card>
        )}
      </div>
    </Phone>
  );
}

// ─── Demo: History ────────────────────────────────────────────────────────────
function DemoHistory({ dark, C }) {
  const [sel, setSel] = useState(null);
  const rows = [
    { store: 'Sunrise Deli', date: 'May 31', amt: '$55.00', status: 'paid'   },
    { store: 'Corner Mart',  date: 'May 31', amt: '$32.50', status: 'unpaid' },
    { store: 'Quick Stop',   date: 'May 30', amt: '$78.00', status: 'partial'},
  ];
  const STATUS_STYLE = {
    paid:    { bg: dark ? '#0D2B20' : '#f0fdf4', text: dark ? '#2ECC8A' : '#16a34a' },
    unpaid:  { bg: dark ? '#2d0a0a' : '#fef2f2', text: dark ? '#f87171' : '#dc2626' },
    partial: { bg: dark ? '#1f1000' : '#fffbeb', text: dark ? '#fbbf24' : '#b45309' },
  };

  return (
    <Phone dark={dark} C={C}>
      {/* Header */}
      <div style={{ background: dark ? 'rgba(0,0,0,0.88)' : 'rgba(244,244,245,0.88)', padding: '6px 12px 5px', borderBottom: `1px solid ${C.divider}` }}>
        <div style={{ color: C.text, fontSize: 11, fontWeight: 700, textAlign: 'center' }}>Invoice History</div>
      </div>
      {/* Search */}
      <div style={{ padding: '6px 10px 0' }}>
        <div style={{ background: C.inputBg, border: `1px solid ${C.inputBorder}`, borderRadius: 10, height: 26, padding: '0 10px', display: 'flex', alignItems: 'center' }}>
          <span style={{ color: C.textMuted, fontSize: 9 }}>🔍  Search store…</span>
        </div>
      </div>
      <div style={{ flex: 1, padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 5, overflowY: 'hidden' }}>
        {rows.map((r, i) => {
          const st = STATUS_STYLE[r.status];
          return (
            <div
              key={i}
              style={{
                background: sel === i ? C.nestedCard : C.card,
                border: `1px solid ${sel === i ? ACCENT : (C.cardBorder || C.divider)}`,
                borderRadius: 12, padding: '8px 10px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                animation: `t-slide 0.3s ${i * 0.08}s ease both`,
                cursor: 'pointer', transition: 'border-color 0.2s, background 0.2s',
              }}
              onMouseEnter={() => setSel(i)}
              onMouseLeave={() => setSel(null)}
            >
              <div>
                <div style={{ color: C.text, fontSize: 11, fontWeight: 700 }}>{r.store}</div>
                <div style={{ color: C.textMuted, fontSize: 9, marginTop: 1 }}>{r.date}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: C.text, fontSize: 12, fontWeight: 800 }}>{r.amt}</div>
                <div style={{ background: st.bg, color: st.text, fontSize: 8, fontWeight: 700, borderRadius: 5, padding: '2px 6px', marginTop: 2 }}>
                  {r.status.toUpperCase()}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Phone>
  );
}

// ─── Demo: Reports ────────────────────────────────────────────────────────────
function DemoReports({ dark, C }) {
  const bars = [18, 42, 30, 65, 50, 88, 110];
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const maxB = Math.max(...bars);

  return (
    <Phone dark={dark} C={C}>
      <div style={{ background: dark ? 'rgba(0,0,0,0.88)' : 'rgba(244,244,245,0.88)', padding: '6px 12px 5px', borderBottom: `1px solid ${C.divider}` }}>
        <div style={{ color: C.text, fontSize: 11, fontWeight: 700, textAlign: 'center' }}>Reports</div>
      </div>
      <div style={{ flex: 1, padding: '7px 10px', display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'hidden' }}>
        {/* Range pills */}
        <div style={{ display: 'flex', background: dark ? '#1a1a1a' : '#e0e0e0', borderRadius: 10, padding: 3, gap: 3 }}>
          {['This Week','This Month','All Time'].map((l, i) => (
            <div key={i} style={{
              flex: 1, textAlign: 'center', borderRadius: 8, padding: '4px 0',
              background: i === 0 ? (dark ? '#2a2a2a' : '#fff') : 'none',
              color: i === 0 ? C.text : C.textMuted,
              fontSize: 8, fontWeight: 600,
              boxShadow: i === 0 ? (dark ? '0 1px 4px rgba(0,0,0,0.4)' : '0 1px 3px rgba(0,0,0,0.1)') : 'none',
            }}>{l}</div>
          ))}
        </div>
        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
          {[['Revenue','$165.00',C.text,true],['Collected','$110.00','#2ECC8A',false],['Pending','$55.00','#f59e0b',false]].map(([l,v,col,span], i) => (
            <div key={i} style={{
              background: C.card, border: `1px solid ${C.cardBorder || C.divider}`,
              borderRadius: 12, padding: '8px 10px',
              gridColumn: span ? 'span 2' : undefined,
              animation: `t-pop 0.3s ${i * 0.1}s ease both`,
            }}>
              <div style={{ color: C.textMuted, fontSize: 7, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>{l}</div>
              <div style={{ color: col, fontSize: span ? 18 : 14, fontWeight: 800 }}>{v}</div>
            </div>
          ))}
        </div>
        {/* 7-day chart */}
        <Card C={C} dark={dark} style={{ padding: '8px 10px' }}>
          <div style={{ color: C.textMuted, fontSize: 7, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Last 7 Days</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: 48, gap: 3 }}>
            {bars.map((v, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', gap: 2 }}>
                <div style={{
                  width: '100%', borderRadius: '3px 3px 0 0',
                  height: `${(v / maxB) * 100}%`,
                  background: i === 6 ? ACCENT : (dark ? '#2a2a2a' : '#d4d4d8'),
                  minHeight: 3,
                  transition: 'height 0.6s ease',
                }} />
                <span style={{ color: i === 6 ? C.text : C.textMuted, fontSize: 7 }}>{days[i]}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </Phone>
  );
}

// ─── Demo: Settings ───────────────────────────────────────────────────────────
function DemoSettings({ dark, C }) {
  return (
    <Phone dark={dark} C={C}>
      <div style={{ background: dark ? 'rgba(0,0,0,0.88)' : 'rgba(244,244,245,0.88)', padding: '6px 12px 5px', borderBottom: `1px solid ${C.divider}` }}>
        <div style={{ color: C.text, fontSize: 11, fontWeight: 700, textAlign: 'center' }}>Settings</div>
      </div>
      <div style={{ flex: 1, padding: '7px 10px', display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'hidden' }}>
        {/* Theme */}
        <Card C={C} dark={dark}>
          <SectionLabel text="Appearance" C={C} />
          <div style={{ display: 'flex', background: dark ? '#1a1a1a' : '#e0e0e0', borderRadius: 10, padding: 3, gap: 3 }}>
            {['☀ Light','☾ Dark'].map((l, i) => (
              <div key={i} style={{
                flex: 1, textAlign: 'center', padding: '5px 0', borderRadius: 8, fontSize: 9, fontWeight: 600,
                background: (dark ? i === 1 : i === 0) ? (dark ? '#2a2a2a' : '#fff') : 'none',
                color: (dark ? i === 1 : i === 0) ? C.text : C.textMuted,
              }}>{l}</div>
            ))}
          </div>
        </Card>
        {/* Business info */}
        <Card C={C} dark={dark}>
          <SectionLabel text="Business Info" C={C} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <Field label="Business Name" value="J&Y Distributions" dark={dark} C={C} />
            <Field label="Business Phone" value="(718) 555-0000" dark={dark} C={C} />
            <div style={{ height: 26, background: ACCENT, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 't-pop 0.3s 0.3s ease both' }}>
              <span style={{ color: '#fff', fontSize: 10, fontWeight: 700 }}>Save Changes</span>
            </div>
          </div>
        </Card>
        {/* Backup row */}
        <Card C={C} dark={dark}>
          <SectionLabel text="Backup & Restore" C={C} />
          <div style={{ height: 26, background: ACCENT, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#fff', fontSize: 10, fontWeight: 700 }}>Export Backup</span>
          </div>
        </Card>
      </div>
    </Phone>
  );
}

// ─── Demo: Add to Home Screen ─────────────────────────────────────────────────
function DemoHomescreen({ dark, C }) {
  const isIOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent);
  const [tab, setTab] = useState(isIOS ? 'ios' : 'android');

  const iosSteps = [
    { icon: '□↑', label: 'Tap the Share button', sub: 'Bottom center of Safari' },
    { icon: '⊞',  label: '"Add to Home Screen"',  sub: 'Scroll down in the share sheet' },
    { icon: '✓',  label: 'Tap "Add"',             sub: 'App icon appears on your home screen' },
  ];
  const androidSteps = [
    { icon: '⋮',  label: 'Tap the menu (⋮)',        sub: 'Top-right in Chrome' },
    { icon: '⊞',  label: '"Add to Home Screen"',    sub: 'Or "Install App"' },
    { icon: '✓',  label: 'Tap "Add"',               sub: 'App icon appears on your home screen' },
  ];
  const steps = tab === 'ios' ? iosSteps : androidSteps;

  return (
    <div style={{ ...enterStyle, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, width: '100%', padding: '0 20px' }}>
      {/* OS toggle */}
      <div style={{ display: 'flex', background: dark ? '#1a1a1a' : '#e8e8e8', borderRadius: 12, padding: 3, gap: 3, width: '100%', maxWidth: 260 }}>
        {[['ios','🍎 iPhone / iPad'],['android','🤖 Android']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            flex: 1, padding: '7px 4px', borderRadius: 10, border: 'none',
            background: tab === id ? (dark ? '#2a2a2a' : '#fff') : 'none',
            color: tab === id ? (dark ? '#fff' : '#09090b') : (dark ? '#666' : '#888'),
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
            boxShadow: tab === id ? (dark ? '0 1px 4px rgba(0,0,0,0.4)' : '0 1px 3px rgba(0,0,0,0.1)') : 'none',
            WebkitTapHighlightColor: 'transparent',
            transition: 'all 0.2s',
          }}>{label}</button>
        ))}
      </div>

      {/* Steps */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 300 }}>
        {steps.map((step, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 14,
            background: dark ? '#141414' : '#f7f4f0',
            border: `1px solid ${dark ? '#222' : '#e2ddd7'}`,
            borderRadius: 14, padding: '12px 14px',
            animation: `t-slide 0.3s ${i * 0.1}s ease both`,
          }}>
            <div style={{
              width: 40, height: 40, flexShrink: 0,
              background: i === steps.length - 1 ? ACCENT : (dark ? '#1e1e1e' : '#e8e4de'),
              borderRadius: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, fontWeight: 700,
              color: i === steps.length - 1 ? '#fff' : (dark ? '#888' : '#666'),
            }}>
              {step.icon}
            </div>
            <div>
              <div style={{ color: dark ? '#fff' : '#09090b', fontSize: 13, fontWeight: 700 }}>{step.label}</div>
              <div style={{ color: dark ? '#888' : '#71717a', fontSize: 11, marginTop: 1 }}>{step.sub}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{
        background: dark ? 'rgba(74,123,247,0.1)' : 'rgba(74,123,247,0.08)',
        border: `1px solid ${dark ? 'rgba(74,123,247,0.2)' : 'rgba(74,123,247,0.15)'}`,
        borderRadius: 12, padding: '10px 14px',
        color: dark ? '#7B9FFF' : '#1d4ed8',
        fontSize: 12, lineHeight: 1.5, maxWidth: 300,
      }}>
        💡 Once installed, InvoiceGo opens full-screen with no browser chrome — just like a native app.
      </div>
    </div>
  );
}

const enterStyle = { animation: 't-enter 0.4s ease both' };

// ─── Demo: Done ───────────────────────────────────────────────────────────────
function DemoDone({ dark, C }) {
  return (
    <Phone dark={dark} C={C}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '0 16px' }}>
        <div style={{ fontSize: 44, animation: 't-float 2s ease-in-out infinite' }}>🎉</div>
        <div style={{ color: C.text, fontWeight: 800, fontSize: 15, textAlign: 'center' }}>You're ready to go!</div>
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            ['Bottom nav →', 'New Invoice, History, Products', C.card],
            ['Sidebar →',    'Reports, Settings, Profile',      C.card],
            ['Footer →',     "What's New, Backup, About",       C.card],
          ].map(([label, sub, bg], i) => (
            <div key={i} style={{
              background: bg,
              border: `1px solid ${C.cardBorder || C.divider}`,
              borderRadius: 10, padding: '7px 12px',
              animation: `t-slide 0.3s ${i * 0.12}s ease both`,
            }}>
              <div style={{ color: ACCENT, fontSize: 9, fontWeight: 700 }}>{label}</div>
              <div style={{ color: C.textSub, fontSize: 9, marginTop: 1 }}>{sub}</div>
            </div>
          ))}
        </div>
      </div>
    </Phone>
  );
}
