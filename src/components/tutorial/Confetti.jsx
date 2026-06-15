/**
 * Confetti — a lightweight, dependency-free burst for the Quick Start finale.
 * ~26 absolutely-positioned pieces fall once with randomized x, delay, color,
 * and rotation. Pointer-events none so it never blocks the Done button.
 */

const COLORS = ['#4A7BF7', '#22C55E', '#F59E0B', '#EC4899', '#8B5CF6', '#06B6D4'];
const PIECES = Array.from({ length: 26 }, (_, i) => ({
  left:  Math.round((i * 37 + (i % 5) * 11) % 100),       // spread across width
  delay: ((i % 7) * 0.09).toFixed(2),
  dur:   (1.6 + (i % 5) * 0.22).toFixed(2),
  color: COLORS[i % COLORS.length],
  size:  6 + (i % 3) * 3,
  round: i % 2 === 0,
}));

export default function Confetti() {
  return (
    <div aria-hidden style={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 1 }}>
      {PIECES.map((p, i) => (
        <span
          key={i}
          style={{
            position: 'absolute',
            top: 0,
            left: `${p.left}%`,
            width: p.size,
            height: p.size * (p.round ? 1 : 1.6),
            background: p.color,
            borderRadius: p.round ? '50%' : 2,
            animation: `tut-confetti ${p.dur}s cubic-bezier(0.4,0.1,0.3,1) ${p.delay}s forwards`,
          }}
        />
      ))}
    </div>
  );
}
