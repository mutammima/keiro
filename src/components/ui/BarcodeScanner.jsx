import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Html5Qrcode } from 'html5-qrcode';

const SCANNER_ID = 'qr-reader';

export default function BarcodeScanner({ onScan, onClose }) {
  const scannerRef = useRef(null);
  const [status, setStatus] = useState('starting'); // starting | ready | error
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    // Hide html5-qrcode's built-in UI chrome via injected style
    const style = document.createElement('style');
    style.id = 'qr-hide';
    style.textContent = `
      #${SCANNER_ID} img, #${SCANNER_ID} select, #${SCANNER_ID} button,
      #${SCANNER_ID} > div > span { display: none !important; }
      #${SCANNER_ID} video { border-radius: 0 !important; border: none !important; }
    `;
    document.head.appendChild(style);

    const scanner = new Html5Qrcode(SCANNER_ID, { verbose: false });
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 12, qrbox: { width: 240, height: 140 },
          formatsToSupport: [9, 10, 14, 15, 5, 4, 3, 8] }, // EAN-13, EAN-8, UPC-A, UPC-E, CODE-128, CODE-93, CODE-39, ITF
        (text) => { stopAndClose(); onScan(text); },
        () => {}
      )
      .then(() => setStatus('ready'))
      .catch(err => {
        setStatus('error');
        setErrorMsg(
          err?.message?.toLowerCase().includes('permission')
            ? 'Camera access denied. Allow camera in your browser settings.'
            : 'Could not start camera.'
        );
      });

    return () => {
      try { scanner?.isScanning && scanner.stop().catch(() => {}); } catch {}
      document.getElementById('qr-hide')?.remove();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function stopAndClose() {
    try { scannerRef.current?.isScanning && scannerRef.current.stop().catch(() => {}); } catch {}
    onClose();
  }

  // Render into document.body via a portal so that position:fixed is always
  // relative to the viewport — not to the transformed tab-strip ancestor.
  return createPortal(
    <div style={s.overlay}>
      {/* Top bar */}
      <div style={s.topBar}>
        <button aria-label="Close scanner" style={s.closeBtn} onClick={stopAndClose}>✕</button>
        <span style={s.topTitle}>Scan Barcode</span>
        <div style={{ width: 44 }} />
      </div>

      <p style={s.hint}>Point at a product barcode</p>

      {/* Camera feed */}
      <div style={s.viewfinderWrap}>
        <div id={SCANNER_ID} style={s.videoEl} />

        {/* Corner markers */}
        {status === 'ready' && (
          <div style={s.frameOuter}>
            <Corner pos="tl" /><Corner pos="tr" />
            <Corner pos="bl" /><Corner pos="br" />
            {/* Scan line animation */}
            <div style={s.scanLine} />
          </div>
        )}

        {status === 'starting' && (
          <div style={s.centeredMsg}><p style={s.statusTxt}>Starting camera…</p></div>
        )}

        {status === 'error' && (
          <div style={s.centeredMsg}>
            <p style={{ ...s.statusTxt, color: '#f87171', textAlign: 'center', padding: '0 24px' }}>{errorMsg}</p>
          </div>
        )}
      </div>

      <button style={s.manualBtn} onClick={stopAndClose}>Enter manually</button>

      <style>{`
        @keyframes scanMove {
          0%   { top: 10%; opacity: 1; }
          90%  { top: 88%; opacity: 1; }
          100% { top: 88%; opacity: 0; }
        }
      `}</style>
    </div>,
    document.body
  );
}

function Corner({ pos }) {
  const top    = pos.startsWith('t');
  const left   = pos.endsWith('l');
  return (
    <div style={{
      position: 'absolute',
      width: 22, height: 22,
      [top ? 'top' : 'bottom']: 0,
      [left ? 'left' : 'right']: 0,
      borderTop:    top  ? '3px solid #fff' : 'none',
      borderBottom: !top ? '3px solid #fff' : 'none',
      borderLeft:   left ? '3px solid #fff' : 'none',
      borderRight:  !left? '3px solid #fff' : 'none',
      borderRadius: top && left  ? '4px 0 0 0'
                  : top && !left ? '0 4px 0 0'
                  : !top && left ? '0 0 0 4px'
                  :                '0 0 4px 0',
    }} />
  );
}

const s = {
  overlay: {
    position: 'fixed', inset: 0,
    background: '#000',
    zIndex: 2000,
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    paddingTop: 'env(safe-area-inset-top)',
  },
  topBar: {
    width: '100%', display: 'flex', alignItems: 'center',
    justifyContent: 'space-between', padding: '12px 12px 0',
  },
  closeBtn: {
    width: 44, height: 44, borderRadius: 22,
    background: 'rgba(255,255,255,0.12)', border: 'none',
    color: '#fff', fontSize: 18,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', flexShrink: 0,
  },
  topTitle: {
    color: '#fff', fontSize: 17, fontWeight: 600, letterSpacing: 0.2,
  },
  hint: {
    color: 'rgba(255,255,255,0.45)', fontSize: 14,
    margin: '10px 0 20px',
  },
  viewfinderWrap: {
    position: 'relative',
    width: '100%', flex: 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  videoEl: { width: '100%', height: '100%' },
  frameOuter: {
    position: 'absolute',
    width: 260, height: 150,
    pointerEvents: 'none',
  },
  scanLine: {
    position: 'absolute',
    left: 4, right: 4, height: 2,
    background: 'linear-gradient(90deg, transparent, #1a73e8, transparent)',
    animation: 'scanMove 1.8s ease-in-out infinite',
    borderRadius: 1,
  },
  centeredMsg: {
    position: 'absolute', inset: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  statusTxt: { color: 'rgba(255,255,255,0.6)', fontSize: 14, margin: 0 },
  manualBtn: {
    margin: '20px 0 32px',
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.15)',
    color: 'rgba(255,255,255,0.7)',
    padding: '13px 32px', borderRadius: 14,
    fontSize: 15, fontWeight: 500,
    cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
  },
};
