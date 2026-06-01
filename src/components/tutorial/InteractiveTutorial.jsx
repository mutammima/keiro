import { useState, useEffect } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { LIGHT, DARK, ACCENT } from '../../theme';

const STEPS = [
  {
    title: "Welcome to InvoiceGo 👋",
    instruction: "Let's create your first invoice together. I'll guide you through each step of the app — you'll do the real actions.",
    beacon: null,
    action: null,
    autoAdvanceOn: null,
  },
  {
    title: "Step 1 — Open New Invoice",
    instruction: "Tap the 'New' button in the bottom navigation bar to go to the invoice form.",
    beacon: { x: '16%', y: 'calc(100dvh - 34px)' },
    action: "Tap 'New' in the bottom bar",
    autoAdvanceOn: 'invoice',
  },
  {
    title: "Step 2 — Enter Store Name",
    instruction: "Type the name of the store you're delivering to in the 'Store Name' field at the top of the form.",
    beacon: { x: '50%', y: '34%' },
    action: "Fill in the store name, then tap Next →",
    autoAdvanceOn: null,
  },
  {
    title: "Step 3 — Enter Customer Name",
    instruction: "Type the customer's name. This is the person receiving the delivery.",
    beacon: { x: '50%', y: '44%' },
    action: "Fill in the customer name, then tap Next →",
    autoAdvanceOn: null,
  },
  {
    title: "Step 4 — Add a Product",
    instruction: "Tap '+ Add Item' to add a product to the invoice. Enter the product name, quantity, and price.",
    beacon: { x: '50%', y: '58%' },
    action: "Add at least one item, then tap Next →",
    autoAdvanceOn: null,
  },
  {
    title: "Step 5 — Generate the Invoice",
    instruction: "Scroll down and tap 'Generate Invoice'. This creates a shareable PDF invoice.",
    beacon: { x: '50%', y: '82%' },
    action: "Tap Generate Invoice — the tutorial advances automatically",
    autoAdvanceOn: 'invoice-view',
  },
  {
    title: "Step 6 — Download or Share",
    instruction: "Your invoice is ready! Tap 'Download PDF' to save it, or 'Share' to send it directly.",
    beacon: { x: '50%', y: '54%' },
    action: "Download or share your invoice, then tap Next →",
    autoAdvanceOn: null,
  },
  {
    title: "Step 7 — Invoice History",
    instruction: "Tap 'Invoices' in the bottom bar. All your past invoices are here — tap any one to view it.",
    beacon: { x: '50%', y: 'calc(100dvh - 34px)' },
    action: "Go to Invoices tab",
    autoAdvanceOn: 'history',
  },
  {
    title: "Step 8 — Products Catalog",
    instruction: "Tap 'Products' in the bottom bar. Products save automatically when you invoice them, and you can add more manually.",
    beacon: { x: '84%', y: 'calc(100dvh - 34px)' },
    action: "Go to Products tab",
    autoAdvanceOn: 'products',
  },
  {
    title: "Step 9 — Sidebar Features",
    instruction: "Tap the ☰ menu in the top-left to access Reports, Store Info, Notes, and Settings.",
    beacon: { x: '28px', y: 'max(52px, calc(env(safe-area-inset-top) + 24px))' },
    action: "Open the sidebar menu, then tap Next →",
    autoAdvanceOn: null,
  },
  {
    title: "You're all set! 🎉",
    instruction: "You now know how to use InvoiceGo. Go ahead and start using the app — your data syncs to the cloud automatically.",
    beacon: null,
    action: null,
    autoAdvanceOn: null,
  },
];

export default function InteractiveTutorial({ currentPage, onClose }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;
  const [step, setStep] = useState(0);

  const current = STEPS[step];
  const isFirst = step === 0;
  const isLast  = step === STEPS.length - 1;

  // Auto-advance when user navigates to expected page
  useEffect(() => {
    if (current.autoAdvanceOn && currentPage === current.autoAdvanceOn) {
      const t = setTimeout(() => setStep(s => Math.min(s + 1, STEPS.length - 1)), 600);
      return () => clearTimeout(t);
    }
  }, [currentPage, step]); // eslint-disable-line

  function next() {
    if (isLast) { onClose(); return; }
    setStep(s => s + 1);
  }
  function back() { if (!isFirst) setStep(s => s - 1); }

  // CSS for pulsing beacon
  useEffect(() => {
    if (document.getElementById('itut-kf')) return;
    const el = document.createElement('style');
    el.id = 'itut-kf';
    el.textContent = `
      @keyframes itut-pulse {
        0%   { transform: translate(-50%,-50%) scale(1);   opacity: 0.9; }
        60%  { transform: translate(-50%,-50%) scale(1.8); opacity: 0;   }
        100% { transform: translate(-50%,-50%) scale(1.8); opacity: 0;   }
      }
      @keyframes itut-core {
        0%,100% { transform: translate(-50%,-50%) scale(1);    }
        50%      { transform: translate(-50%,-50%) scale(1.12); }
      }
    `;
    document.head.appendChild(el);
  }, []);

  return (
    <>
      {/* Semi-dim backdrop — pointer-events: none so touches pass through */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 5000,
        background: 'rgba(0,0,0,0.45)',
        pointerEvents: 'none',
      }} />

      {/* Beacon */}
      {current.beacon && (
        <div style={{
          position: 'fixed',
          left: current.beacon.x,
          top: current.beacon.y,
          zIndex: 5001,
          pointerEvents: 'none',
        }}>
          {/* Pulse ring */}
          <div style={{
            position: 'absolute',
            width: 48, height: 48,
            borderRadius: 24,
            background: ACCENT,
            transform: 'translate(-50%,-50%)',
            animation: 'itut-pulse 1.8s ease-out infinite',
          }} />
          {/* Core dot */}
          <div style={{
            position: 'absolute',
            width: 18, height: 18,
            borderRadius: 9,
            background: ACCENT,
            border: '2.5px solid #fff',
            transform: 'translate(-50%,-50%)',
            animation: 'itut-core 1.8s ease-in-out infinite',
            boxShadow: '0 2px 12px rgba(74,123,247,0.6)',
          }} />
        </div>
      )}

      {/* Instruction card — pointer-events: auto so user can tap buttons */}
      <div style={{
        position: 'fixed',
        bottom: 'max(72px, calc(env(safe-area-inset-bottom) + 62px))',
        left: 12, right: 12,
        zIndex: 5002,
        background: dark ? '#141414' : '#ffffff',
        borderRadius: 20,
        padding: '18px 18px 14px',
        boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
        border: `1px solid ${dark ? '#2a2a2a' : '#e4e4e7'}`,
      }}>
        {/* Progress bar */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{
              flex: 1, height: 3, borderRadius: 2,
              background: i <= step ? ACCENT : (dark ? '#2a2a2a' : '#e4e4e7'),
              transition: 'background 0.3s',
            }} />
          ))}
        </div>

        {/* Title */}
        <p style={{ color: C.text, fontSize: 16, fontWeight: 800, margin: '0 0 6px', lineHeight: 1.3 }}>
          {current.title}
        </p>

        {/* Instruction */}
        <p style={{ color: C.textMuted, fontSize: 14, margin: '0 0 12px', lineHeight: 1.55 }}>
          {current.instruction}
        </p>

        {/* Action hint */}
        {current.action && (
          <div style={{
            background: dark ? '#1e1e1e' : '#f4f4f5',
            borderRadius: 10, padding: '8px 12px',
            marginBottom: 12,
          }}>
            <p style={{ color: ACCENT, fontSize: 13, fontWeight: 600, margin: 0 }}>
              👆 {current.action}
            </p>
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {!isFirst && (
            <button onClick={back} style={{
              background: dark ? '#1e1e1e' : '#f4f4f5',
              border: 'none', borderRadius: 12,
              color: C.textMuted, fontSize: 14, fontWeight: 600,
              padding: '10px 16px', cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
            }}>← Back</button>
          )}
          <button onClick={() => { onClose(); }} style={{
            background: 'none', border: 'none',
            color: C.textLight, fontSize: 13, fontWeight: 500,
            cursor: 'pointer', padding: '10px 8px',
            WebkitTapHighlightColor: 'transparent',
            marginLeft: isFirst ? 0 : 'auto',
          }}>
            {isFirst ? 'Skip tutorial' : 'Exit'}
          </button>
          {isFirst && <div style={{ flex: 1 }} />}
          <button onClick={next} style={{
            flex: isFirst ? undefined : 1,
            background: ACCENT, border: 'none', borderRadius: 12,
            color: '#fff', fontSize: 15, fontWeight: 700,
            padding: '11px 20px', cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
            boxShadow: '0 4px 14px rgba(74,123,247,0.4)',
          }}>
            {isLast ? 'Start using the app ✓' : (current.autoAdvanceOn ? 'Skip step →' : 'Next →')}
          </button>
        </div>
      </div>
    </>
  );
}
