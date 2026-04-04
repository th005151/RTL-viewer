import React from 'react'

const WIRE_COLOR  = '#4a9eff'
const WIRE_TRACED = '#ffd700'
const WIRE_W      = 1.5
const WIRE_W_TR   = 2.5

/**
 * Build an orthogonal (Manhattan) path between two pin coordinates.
 *
 * Forward wires (toX > fromX) — Z-bend at a point 40% into the gap:
 *   fromPin ──┐
 *             │
 *             └── toPin
 *
 * Backward wires (toX ≤ fromX) — U-route above both endpoints:
 *   fromPin ──┐
 *   ┌─────────┘
 *   └── toPin
 */
function buildPath(fromX, fromY, toX, toY) {
  // Pure horizontal — no bends needed
  if (Math.abs(toY - fromY) < 0.5) {
    return `M ${fromX} ${fromY} L ${toX} ${toY}`
  }

  if (toX > fromX + 2) {
    // ── Forward: H → V → H, bend placed at 40% from source ──────────────
    // Placing the bend near the source keeps long cross-column wires tidy
    // (they run the long horizontal stretch at the destination's Y level)
    const gap   = toX - fromX
    const bendX = Math.round(fromX + gap * 0.4)
    return (
      `M ${fromX} ${fromY} ` +
      `L ${bendX}  ${fromY} ` +
      `L ${bendX}  ${toY}   ` +
      `L ${toX}    ${toY}`
    )
  }

  // ── Backward / same-column: U-route above both ────────────────────────
  const stub   = 28                        // horizontal stub out of each pin
  const rx1    = fromX + stub
  const rx2    = toX  - stub
  const routeY = Math.min(fromY, toY) - 36 // channel above both endpoints
  return (
    `M ${fromX} ${fromY} ` +
    `L ${rx1}   ${fromY} ` +
    `L ${rx1}   ${routeY} ` +
    `L ${rx2}   ${routeY} ` +
    `L ${rx2}   ${toY}   ` +
    `L ${toX}   ${toY}`
  )
}

export default function Wire({ wire, isTraced, onClick }) {
  const { fromX, fromY, toX, toY, net } = wire
  const d     = buildPath(fromX, fromY, toX, toY)
  const color = isTraced ? WIRE_TRACED : WIRE_COLOR
  const width = isTraced ? WIRE_W_TR   : WIRE_W

  // Label at the bend point (40% along X)
  const labelX = fromX + (toX - fromX) * 0.4
  const labelY = fromY - 7

  return (
    <g onClick={() => onClick(net)} style={{ cursor: 'pointer' }}>
      {/* Hit area (wider for easier clicking) */}
      <path d={d} fill="none" stroke="transparent" strokeWidth={12} />

      {/* Wire */}
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={width}
        opacity={isTraced ? 1 : 0.75}
      />

      {/* Net label (shown only when traced) */}
      {isTraced && (
        <text
          x={labelX}
          y={labelY}
          textAnchor="middle"
          fill={WIRE_TRACED}
          fontSize={9}
          fontFamily="'Fira Code','Consolas',monospace"
          style={{ pointerEvents: 'none' }}
        >
          {net}
        </text>
      )}
    </g>
  )
}
