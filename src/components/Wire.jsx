import React from 'react'

const WIRE_COLOR = '#4a9eff'
const WIRE_TRACED = '#ffd700'
const WIRE_WIDTH = 1.5
const WIRE_TRACED_WIDTH = 2.5

export default function Wire({ wire, isTraced, onClick }) {
  const { fromX, fromY, toX, toY, net } = wire

  // Bezier control points for smooth S-curve
  const dx = Math.abs(toX - fromX)
  const cp = Math.max(40, dx * 0.5)
  const cpX1 = fromX + cp
  const cpX2 = toX - cp
  const d = `M ${fromX} ${fromY} C ${cpX1} ${fromY}, ${cpX2} ${toY}, ${toX} ${toY}`

  const color = isTraced ? WIRE_TRACED : WIRE_COLOR
  const width = isTraced ? WIRE_TRACED_WIDTH : WIRE_WIDTH

  return (
    <g onClick={() => onClick(net)} style={{ cursor: 'pointer' }}>
      {/* Wider invisible hit area */}
      <path
        d={d}
        fill="none"
        stroke="transparent"
        strokeWidth={12}
      />
      {/* Visible wire */}
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={width}
        opacity={isTraced ? 1 : 0.7}
      />
      {/* Net label at midpoint */}
      {isTraced && (
        <text
          x={(fromX + toX) / 2}
          y={(fromY + toY) / 2 - 6}
          textAnchor="middle"
          fill={WIRE_TRACED}
          fontSize={9}
          fontFamily="'Fira Code','Consolas',monospace"
          style={{ pointerEvents: 'none' }}
        >
          {net}
        </text>
      )}
      {/* Dot at endpoints */}
      {isTraced && (
        <>
          <circle cx={fromX} cy={fromY} r={3} fill={WIRE_TRACED} />
          <circle cx={toX} cy={toY} r={3} fill={WIRE_TRACED} />
        </>
      )}
    </g>
  )
}
