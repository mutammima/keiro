/**
 * DashboardCharts — pure presentational chart components for the Home dashboard.
 *
 * All three components are stateless and receive only what they need to render.
 * Keeping them here makes Home.jsx easy to read and lets the charts be reused
 * (e.g. in Reports) without copy-paste.
 *
 * Exports:
 *   BarChart      — 7-day SVG bar chart (accepts { days, dark })
 *   DonutRing     — SVG donut ring showing paid % (accepts { paid, owed, dark })
 *   HorizBar      — CSS horizontal progress bar (accepts { pct, color })
 *   PRODUCT_COLORS — palette array for cycling product bar colors
 */

import { ACCENT } from '../../theme';

// ─── Palette (cycle through for top-product bars) ─────────────────────────────

export const PRODUCT_COLORS = ['#4A7BF7', '#22c55e', '#f59e0b', '#8b5cf6', '#06b6d4'];

// ─── 7-Day Bar Chart ──────────────────────────────────────────────────────────
//
// Props:
//   days  — array of 7 objects: { label: string, total: number, isToday: boolean }
//   dark  — boolean (controls ghost-bar and label colours)

export function BarChart({ days, dark }) {
  const maxVal = Math.max(...days.map(d => d.total), 0.01);
  const CHART_H = 68;
  const SLOT_W  = 34;
  const BAR_W   = 22;
  const totalW  = SLOT_W * days.length;

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${totalW} ${CHART_H + 18}`}
      preserveAspectRatio="none"
      style={{ display: 'block' }}
    >
      {days.map((day, i) => {
        const barH  = day.total > 0 ? Math.max((day.total / maxVal) * CHART_H, 5) : 0;
        const x     = i * SLOT_W + (SLOT_W - BAR_W) / 2;
        const y     = CHART_H - barH;
        const today = day.isToday;

        return (
          <g key={i}>
            {/* Empty-state ghost bar */}
            <rect
              x={x} y={0} width={BAR_W} height={CHART_H} rx={5}
              fill={dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}
            />
            {/* Revenue bar */}
            {day.total > 0 && (
              <rect
                x={x} y={y} width={BAR_W} height={barH} rx={5}
                fill={today ? ACCENT : (dark ? 'rgba(74,123,247,0.5)' : 'rgba(74,123,247,0.38)')}
              />
            )}
            {/* Day label */}
            <text
              x={x + BAR_W / 2} y={CHART_H + 13}
              textAnchor="middle"
              fontSize={9}
              fontWeight={today ? 800 : 500}
              fill={today ? ACCENT : (dark ? 'rgba(255,255,255,0.38)' : 'rgba(0,0,0,0.35)')}
            >
              {day.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── Collection Donut Ring ────────────────────────────────────────────────────
//
// Props:
//   paid  — number (total paid amount)
//   owed  — number (total unpaid/partial amount)
//   dark  — boolean

export function DonutRing({ paid, owed, dark }) {
  const total = paid + owed;
  const pct   = total > 0 ? paid / total : 0;
  const R     = 34;
  const CX    = 44;
  const CY    = 44;
  const circ  = 2 * Math.PI * R;
  const paidLen = circ * pct;

  return (
    <svg width={88} height={88} style={{ flexShrink: 0 }}>
      {/* Track */}
      <circle
        cx={CX} cy={CY} r={R} fill="none"
        stroke={dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)'}
        strokeWidth={11}
      />
      {/* Owed arc (background red) */}
      {total > 0 && owed > 0 && (
        <circle
          cx={CX} cy={CY} r={R} fill="none"
          stroke={dark ? 'rgba(239,68,68,0.28)' : 'rgba(239,68,68,0.22)'}
          strokeWidth={11}
          strokeDasharray={`${circ} 0`}
          transform={`rotate(-90 ${CX} ${CY})`}
        />
      )}
      {/* Paid arc (green) */}
      {paid > 0 && (
        <circle
          cx={CX} cy={CY} r={R} fill="none"
          stroke="#22c55e"
          strokeWidth={11}
          strokeLinecap="round"
          strokeDasharray={`${paidLen} ${circ}`}
          transform={`rotate(-90 ${CX} ${CY})`}
        />
      )}
      {/* Center: percentage */}
      <text
        x={CX} y={CY - 4}
        textAnchor="middle" dominantBaseline="middle"
        fontSize={14} fontWeight={800}
        fill={dark ? '#fff' : '#111'}
      >
        {total > 0 ? `${Math.round(pct * 100)}%` : '--'}
      </text>
      <text
        x={CX} y={CY + 12}
        textAnchor="middle"
        fontSize={8} fontWeight={700}
        fill={dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.33)'}
        letterSpacing="0.05em"
      >
        PAID
      </text>
    </svg>
  );
}

// ─── Horizontal product bar ───────────────────────────────────────────────────
//
// Props:
//   pct   — 0–1 fill fraction
//   color — CSS color string

export function HorizBar({ pct, color }) {
  return (
    <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'rgba(128,128,128,0.12)', overflow: 'hidden' }}>
      <div style={{
        height: '100%',
        width: `${Math.max(pct * 100, pct > 0 ? 4 : 0)}%`,
        background: color,
        borderRadius: 3,
        transition: 'width 0.5s ease',
      }} />
    </div>
  );
}
