import React from 'react'

// Color themes per block kind
const THEME = {
  input_port:  { fill: '#0d2044', stroke: '#388bfd', label: '#388bfd', icon: '▶' },
  inout_port:  { fill: '#1a1a3e', stroke: '#bc8cff', label: '#bc8cff', icon: '↔' },
  output_port: { fill: '#0d2a1a', stroke: '#3fb950', label: '#3fb950', icon: '◀' },
  instance:    { fill: '#1c2128', stroke: '#d29922', label: '#e6edf3', icon: '□' },
}

const PIN_R = 4
const FONT_MONO = "'Fira Code','Cascadia Code','Consolas',monospace"

export default function Block({
  block,
  isTraced,      // block is driver/load of a traced net
  onDragStart,   // (blockId, e) => void
  onDoubleClick, // (block, e) => void
}) {
  const { id, kind, name, type, width, height, inPins, outPins, x, y, canEnter } = block
  const theme = THEME[kind] || THEME.instance

  const handleMouseDown = (e) => {
    if (e.button !== 0) return
    e.stopPropagation()
    onDragStart(id, e)
  }

  const handleDblClick = (e) => {
    e.stopPropagation()
    onDoubleClick(block, e)
  }

  return (
    <g
      transform={`translate(${x},${y})`}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDblClick}
      style={{ cursor: 'grab' }}
      data-block-id={id}
    >
      {/* Shadow */}
      <rect
        x={3} y={3}
        width={width} height={height}
        rx={6}
        fill="rgba(0,0,0,0.5)"
      />

      {/* Body */}
      <rect
        width={width} height={height}
        rx={6}
        fill={isTraced ? 'rgba(255,215,0,0.12)' : theme.fill}
        stroke={isTraced ? '#ffd700' : theme.stroke}
        strokeWidth={isTraced ? 2 : 1.5}
      />

      {/* Header stripe */}
      <rect
        width={width} height={20}
        rx={6}
        fill={theme.stroke}
        opacity={0.15}
      />
      <rect
        width={width} height={14}
        y={6}
        fill={theme.stroke}
        opacity={0.15}
      />

      {/* Instance type label */}
      {kind === 'instance' && (
        <text
          x={width / 2} y={13}
          textAnchor="middle"
          fill={theme.stroke}
          fontSize={9}
          fontFamily={FONT_MONO}
          opacity={0.9}
        >
          {type}
        </text>
      )}

      {/* Main label */}
      <text
        x={width / 2}
        y={kind === 'instance' ? height / 2 + 12 : height / 2 + 5}
        textAnchor="middle"
        fill={theme.label}
        fontSize={kind === 'instance' ? 13 : 12}
        fontWeight="600"
        fontFamily={FONT_MONO}
      >
        {name}
      </text>

      {/* "Enter" hint for instances with known hierarchy */}
      {canEnter && (
        <text
          x={width / 2} y={height - 6}
          textAnchor="middle"
          fill={theme.stroke}
          fontSize={8}
          opacity={0.6}
        >
          dbl-click to enter ▶
        </text>
      )}

      {/* Port kind icon for ports */}
      {kind !== 'instance' && (
        <text
          x={width / 2} y={height / 2 - 8}
          textAnchor="middle"
          fill={theme.stroke}
          fontSize={10}
          opacity={0.6}
        >
          {theme.icon} {kind.replace('_port', '')}
        </text>
      )}

      {/* Input pins (left side) */}
      {inPins.map((pin) => (
        <g key={pin.name} transform={`translate(${0},${pin.y - y})`}>
          <circle cx={0} cy={0} r={PIN_R} fill={theme.stroke} opacity={0.85} />
          <text
            x={6} y={4}
            fill="#8b949e"
            fontSize={9}
            fontFamily={FONT_MONO}
          >
            {pin.name}
          </text>
        </g>
      ))}

      {/* Output pins (right side) */}
      {outPins.map((pin) => (
        <g key={pin.name} transform={`translate(${width},${pin.y - y})`}>
          <circle cx={0} cy={0} r={PIN_R} fill={theme.stroke} opacity={0.85} />
          <text
            x={-6} y={4}
            textAnchor="end"
            fill="#8b949e"
            fontSize={9}
            fontFamily={FONT_MONO}
          >
            {pin.name}
          </text>
        </g>
      ))}
    </g>
  )
}
