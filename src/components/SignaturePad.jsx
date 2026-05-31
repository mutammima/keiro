/**
 * SignaturePad — touch/mouse drawable signature canvas.
 * Calls onChange(dataUrl | null) whenever signature changes.
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import { ACCENT } from '../theme';

export default function SignaturePad({ label, dark, C, onChange }) {
  const canvasRef = useRef(null);
  const drawing   = useRef(false);
  const lastPos   = useRef(null);
  const [isEmpty, setIsEmpty] = useState(true);

  // Scale canvas for device pixel ratio
  useEffect(() => {
    const canvas = canvasRef.current;
    const rect   = canvas.getBoundingClientRect();
    const dpr    = window.devicePixelRatio || 1;
    canvas.width  = rect.width  * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = dark ? '#ffffff' : '#111111';
    ctx.lineWidth   = 2;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
  }, [dark]);

  function getPos(e) {
    const canvas = canvasRef.current;
    const rect   = canvas.getBoundingClientRect();
    const src    = e.touches ? e.touches[0] : e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  }

  function startDraw(e) {
    e.preventDefault();
    drawing.current = true;
    lastPos.current = getPos(e);
  }

  function draw(e) {
    e.preventDefault();
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext('2d');
    const pos    = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current = pos;
  }

  function endDraw(e) {
    e?.preventDefault();
    drawing.current = false;
    setIsEmpty(false);
    // Emit data URL
    const dataUrl = canvasRef.current.toDataURL('image/png');
    onChange?.(dataUrl);
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext('2d');
    const dpr    = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    setIsEmpty(true);
    onChange?.(null);
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
        {!isEmpty && (
          <button onClick={clear} style={{ background: 'none', border: 'none', color: C.danger, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '2px 0', WebkitTapHighlightColor: 'transparent' }}>
            Clear
          </button>
        )}
      </div>
      <div style={{
        borderRadius: 12,
        border: `1.5px dashed ${isEmpty ? C.divider : ACCENT}`,
        overflow: 'hidden',
        background: dark ? '#0a0a0a' : '#fafafa',
        position: 'relative',
      }}>
        {isEmpty && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <span style={{ color: C.textLight, fontSize: 13 }}>Sign here</span>
          </div>
        )}
        <canvas
          ref={canvasRef}
          style={{ display: 'block', width: '100%', height: 90, touchAction: 'none', cursor: 'crosshair' }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
      </div>
    </div>
  );
}
