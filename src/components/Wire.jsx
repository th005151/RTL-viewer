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
function buildPath(fromX, fromY, toX, toY, bendXOvr) {
  // Pure horizontal — no bends needed
  if (Math.abs(toY - fromY) < 0.5) {
    return `M ${fromX} ${fromY} L ${toX} ${toY}`
  }

  if (toX > fromX + 2) {
    // ── Forward: H → V → H, bend placed at 40% from source ──────────────
    const gap   = toX - fromX
    const bendX = bendXOvr !== undefined ? bendXOvr : Math.round(fromX + gap * 0.4)
    return (
      `M ${fromX} ${fromY} ` +
      `L ${bendX}  ${fromY} ` +
      `L ${bendX}  ${toY}   ` +
      `L ${toX}    ${toY}`
    )
  }

  // ── Backward / same-column: U-route above both ────────────────────────
  const stub   = 28
  const rx1    = fromX + stub
  const rx2    = toX  - stub
  const routeY = Math.min(fromY, toY) - 36
  return (
    `M ${fromX} ${fromY} ` +
    `L ${rx1}   ${fromY} ` +
    `L ${rx1}   ${routeY} ` +
    `L ${rx2}   ${routeY} ` +
    `L ${rx2}   ${toY}   ` +
    `L ${toX}   ${toY}`
  )
}

/**
 * Compute a good label anchor point on the wire:
 * - Forward (Z-bend): midpoint of the vertical segment (at bendX, midY)
 * - Horizontal: midpoint of the line
 * - Backward (U-route): midpoint of the top horizontal channel
 */
function labelPos(fromX, fromY, toX, toY, bendXOvr) {
  if (Math.abs(toY - fromY) < 0.5) {
    return { x: (fromX + toX) / 2, y: fromY - 6, anchor: 'middle' }
  }
  if (toX > fromX + 2) {
    const bendX = bendXOvr !== undefined ? bendXOvr : Math.round(fromX + (toX - fromX) * 0.4)
    const midY  = (fromY + toY) / 2
    return { x: bendX - 5, y: midY, anchor: 'end' }
  }
  const rx1    = fromX + 28
  const rx2    = toX  - 28
  const routeY = Math.min(fromY, toY) - 36
  return { x: (rx1 + rx2) / 2, y: routeY - 5, anchor: 'middle' }
}

export default function Wire({ wire, isTraced, onClick }) {
  const { fromX, fromY, toX, toY, net, _straight, _noLabel, _bendX } = wire
  const d     = _straight
    ? `M ${fromX} ${fromY} L ${toX} ${toY}`
    : buildPath(fromX, fromY, toX, toY, _bendX)
  const color = isTraced ? WIRE_TRACED : WIRE_COLOR
  const width = isTraced ? WIRE_W_TR   : WIRE_W
  const lp    = _noLabel ? null : labelPos(fromX, fromY, toX, toY, _bendX)

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

      {/* Net label — only on trunk / single-load wires */}
      {lp && (
        <text
          x={lp.x}
          y={lp.y}
          textAnchor={lp.anchor}
          fill={isTraced ? WIRE_TRACED : '#6b8caa'}
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
