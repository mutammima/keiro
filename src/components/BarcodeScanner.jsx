import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

const SCANNER_ID = 'barcode-scanner-container';

/**
 * Full-screen modal barcode scanner.
 *
 * Props:
 *   onScan(decodedText: string) – called on successful scan
 *   onClose() – called when user dismisses
 */
export default function BarcodeScanner({ onScan, onClose }) {
  const scannerRef = useRef(null);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    const scanner = new Html5Qrcode(SCANNER_ID);
    scannerRef.current = scanner;

    const config = {
      fps: 10,
      qrbox: { width: 260, height: 160 },
      formatsToSupport: [
        0,  // QR_CODE
        1,  // AZTEC
        2,  // CODABAR
        3,  // CODE_39
        4,  // CODE_93
        5,  // CODE_128
        6,  // DATA_MATRIX
        7,  // MAXICODE
        8,  // ITF
        9,  // EAN_13
        10, // EAN_8
        11, // PDF_417
        12, // RSS_14
        13, // RSS_EXPANDED
        14, // UPC_A
        15, // UPC_E
        16, // UPC_EAN_EXTENSION
      ],
    };

    scanner
      .start(
        { facingMode: 'environment' },
        config,
        (decodedText) => {
          stopAndClose();
          onScan(decodedText);
        },
        () => {} // Suppress per-frame errors
      )
      .then(() => setStarting(false))
      .catch((err) => {
        setError(
          err?.message?.includes('permission')
            ? 'Camera permission denied. Please allow camera access in your browser settings.'
            : 'Could not start camera. Try closing other apps using the camera.'
        );
        setStarting(false);
      });

    return () => {
      stopScanner(scanner);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function stopScanner(scanner) {
    try {
      if (scanner?.isScanning) {
        scanner.stop().catch(() => {});
      }
    } catch {}
  }

  function stopAndClose() {
    stopScanner(scannerRef.current);
    onClose();
  }

  return (
    <div style={styles.overlay}>
      {/* Close button */}
      <button style={styles.closeBtn} onClick={stopAndClose} aria-label="Close scanner">
        ✕
      </button>

      <p style={styles.title}>Scan Barcode</p>
      <p style={styles.hint}>Point camera at a product barcode</p>

      {/* Scanner mounts here */}
      <div style={styles.scannerWrap}>
        <div id={SCANNER_ID} style={styles.scannerEl} />
      </div>

      {starting && !error && (
        <p style={styles.statusText}>Starting camera…</p>
      )}

      {error && (
        <div style={styles.errorBox}>
          <p style={{ margin: 0 }}>{error}</p>
          <button style={styles.closeBtn2} onClick={stopAndClose}>Dismiss</button>
        </div>
      )}

      <button style={styles.manualBtn} onClick={stopAndClose}>
        Enter Manually Instead
      </button>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: '#000',
    zIndex: 2000,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    paddingTop: 'env(safe-area-inset-top, 16px)',
  },
  closeBtn: {
    position: 'absolute',
    top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
    right: 16,
    background: 'rgba(255,255,255,0.15)',
    border: 'none',
    color: '#fff',
    fontSize: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 700,
    margin: '16px 0 4px',
  },
  hint: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    margin: '0 0 16px',
  },
  scannerWrap: {
    width: '100%',
    maxWidth: 400,
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  scannerEl: {
    width: '100%',
  },
  statusText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    margin: 8,
  },
  errorBox: {
    background: '#c53030',
    color: '#fff',
    padding: '16px 20px',
    borderRadius: 12,
    margin: '0 20px',
    textAlign: 'center',
    fontSize: 15,
  },
  closeBtn2: {
    marginTop: 10,
    background: 'rgba(255,255,255,0.2)',
    border: 'none',
    color: '#fff',
    padding: '8px 20px',
    borderRadius: 8,
    fontSize: 15,
    cursor: 'pointer',
  },
  manualBtn: {
    margin: '16px 0 32px',
    background: 'transparent',
    border: '1.5px solid rgba(255,255,255,0.4)',
    color: '#fff',
    padding: '14px 28px',
    borderRadius: 12,
    fontSize: 16,
    cursor: 'pointer',
  },
};
