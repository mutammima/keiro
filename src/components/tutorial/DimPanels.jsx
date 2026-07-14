/**
 * DimPanels — the shared 4-panel screen dim with a rectangular hole cut around a
 * target rect, plus an optional pulsing highlight ring.
 *
 * Used by `Spotlight` with `blockTaps` panels that capture taps/scroll, so only
 * the highlighted element shows through and stays interactive.
 *
 * When `rect` is null the whole screen is dimmed (no hole yet).
 */

const stop        = (e) => e.stopPropagation();
const stopPrevent = (e) => { e.preventDefault(); e.stopPropagation(); };

export default function DimPanels({ rect, vw, vh, dim, accent, z, pad = 8, blockTaps = false, glow = true }) {
  const handlers = blockTaps
    ? { onClick: stop, onMouseDown: stop, onTouchStart: stop, onTouchMove: stopPrevent }
    : {};
  const panel = {
    position: 'fixed', background: dim, zIndex: z,
    ...(blockTaps ? { touchAction: 'none' } : { pointerEvents: 'none' }),
  };

  if (!rect) return <div {...handlers} className="tut-dim-panel" style={{ ...panel, inset: 0 }} />;

  return (
    <>
      <div {...handlers} className="tut-dim-panel" style={{ ...panel, left: 0, top: 0, width: '100%', height: Math.max(0, rect.top - pad) }} />
      <div {...handlers} className="tut-dim-panel" style={{ ...panel, left: 0, top: rect.bottom + pad, width: '100%', height: Math.max(0, vh - rect.bottom - pad) }} />
      <div {...handlers} className="tut-dim-panel" style={{ ...panel, left: 0, top: Math.max(0, rect.top - pad), width: Math.max(0, rect.left - pad), height: rect.height + pad * 2 }} />
      <div {...handlers} className="tut-dim-panel" style={{ ...panel, left: rect.right + pad, top: Math.max(0, rect.top - pad), width: Math.max(0, vw - rect.right - pad), height: rect.height + pad * 2 }} />
      {glow && (
        <div
          aria-hidden
          className="tut-dim-panel"
          style={{
            position: 'fixed', left: rect.left - pad, top: rect.top - pad,
            width: rect.width + pad * 2, height: rect.height + pad * 2,
            border: `2px solid ${accent}`, borderRadius: 12, zIndex: z + 1,
            pointerEvents: 'none', '--tut-glow': `${accent}73`,
            animation: 'tut-pulse 1.6s ease-in-out infinite',
          }}
        />
      )}
    </>
  );
}
