import React from 'react'

const THEME = {
  input_port:  { fill: '#0d2044', stroke: '#388bfd', label: '#388bfd' },
  inout_port:  { fill: '#1a1a3e', stroke: '#bc8cff', label: '#bc8cff' },
  output_port: { fill: '#0d2a1a', stroke: '#3fb950', label: '#3fb950' },
  instance:    { fill: '#1c2128', stroke: '#d29922', label: '#e6edf3' },
  dff:         { fill: '#0f1f35', stroke: '#58a6ff', label: '#e6edf3' },
  mux:         { fill: '#1a1030', stroke: '#bc8cff', label: '#e6edf3' },
}

const PIN_R    = 4
const FONT     = "'Fira Code','Cascadia Code','Consolas',monospace"

export default function Block({ block, isTraced, onDragStart, onDoubleClick }) {
  const { id, kind, name, type, width, height, inPins, outPins, x, y, canEnter } = block
  const theme = THEME[kind] || THEME.instance

  const handleMouseDown = e => {
    if (e.button !== 0) return
    e.stopPropagation()
    onDragStart(id, e)
  }
  const handleDblClick = e => {
    e.stopPropagation()
    onDoubleClick(block, e)
  }

  // ── DFF ──────────────────────────────────────────────────────────
  if (kind === 'dff') {
    const dPin   = inPins[0]
    const qPin   = outPins[0]
    const clkPin = block.clkPins?.[0]
    // local y coords (relative to block origin)
    const dLocalY   = dPin   ? dPin.y   - y : height * 0.33
    const clkLocalY = clkPin ? clkPin.y - y : height * 0.72
    const qLocalY   = qPin   ? qPin.y   - y : height * 0.5

    return (
      <g transform={`translate(${x},${y})`}
        onMouseDown={handleMouseDown} onDoubleClick={handleDblClick}
        style={{ cursor: 'grab' }} data-block-id={id}>

        {/* Shadow */}
        <rect x={3} y={3} width={width} height={height} rx={5} fill="rgba(0,0,0,0.45)" />

        {/* Body */}
        <rect width={width} height={height} rx={5}
          fill={isTraced ? 'rgba(255,215,0,0.10)' : theme.fill}
          stroke={isTraced ? '#ffd700' : theme.stroke}
          strokeWidth={isTraced ? 2 : 1.5} />

        {/* Header */}
        <rect width={width} height={18} rx={5} fill={theme.stroke} opacity={0.18} />
        <rect width={width} height={12} y={6}  fill={theme.stroke} opacity={0.18} />

        {/* Type label */}
        <text x={width / 2} y={13} textAnchor="middle"
          fill={theme.stroke} fontSize={9} fontFamily={FONT} opacity={0.9}>
          DFF
        </text>

        {/* Register name */}
        <text x={width / 2} y={height / 2 + 8} textAnchor="middle"
          fill={theme.label} fontSize={13} fontWeight="600" fontFamily={FONT}>
          {name}
        </text>

        {/* D label */}
        <text x={8} y={dLocalY + 4} fill="#8b949e" fontSize={9} fontFamily={FONT}>D</text>

        {/* Q label */}
        <text x={width - 8} y={qLocalY + 4} textAnchor="end"
          fill="#8b949e" fontSize={9} fontFamily={FONT}>Q</text>

        {/* Clock triangle symbol */}
        <path
          d={`M 0 ${clkLocalY - 7} L 9 ${clkLocalY} L 0 ${clkLocalY + 7}`}
          fill="none" stroke={theme.stroke} strokeWidth={1.5} />

        {/* D pin */}
        {dPin && <circle cx={0} cy={dLocalY} r={PIN_R} fill={theme.stroke} opacity={0.85} />}

        {/* CLK pin */}
        {clkPin && <circle cx={0} cy={clkLocalY} r={PIN_R} fill={theme.stroke} opacity={0.85} />}

        {/* Q pin */}
        {qPin && <circle cx={width} cy={qLocalY} r={PIN_R} fill={theme.stroke} opacity={0.85} />}
      </g>
    )
  }

  // ── MUX (trapezoid) ───────────────────────────────────────────────
  if (kind === 'mux') {
    const selPin = block.selPins?.[0]
    const yPin   = outPins[0]
    const selLocalY = selPin ? selPin.y - y : height * 0.12
    const yLocalY   = yPin   ? yPin.y  - y : height * 0.5

    // Trapezoid: full height on left, narrows to 60% on right
    const rTop = height * 0.2
    const rBot = height * 0.8
    const trapPoints = `0,0 ${width},${rTop} ${width},${rBot} 0,${height}`

    return (
      <g transform={`translate(${x},${y})`}
        onMouseDown={handleMouseDown} onDoubleClick={handleDblClick}
        style={{ cursor: 'grab' }} data-block-id={id}>

        {/* Shadow */}
        <polygon
          points={`3,3 ${width + 3},${rTop + 3} ${width + 3},${rBot + 3} 3,${height + 3}`}
          fill="rgba(0,0,0,0.45)" />

        {/* Trapezoid body */}
        <polygon points={trapPoints}
          fill={isTraced ? 'rgba(255,215,0,0.10)' : theme.fill}
          stroke={isTraced ? '#ffd700' : theme.stroke}
          strokeWidth={isTraced ? 2 : 1.5} />

        {/* MUX label */}
        <text x={width * 0.5} y={height / 2 + 5} textAnchor="middle"
          fill={theme.label} fontSize={11} fontWeight="700" fontFamily={FONT}>
          MUX
        </text>

        {/* Sel label */}
        <text x={6} y={selLocalY - 6} fill={theme.stroke} fontSize={8} fontFamily={FONT} opacity={0.85}>
          sel
        </text>

        {/* Sel pin */}
        {selPin && <circle cx={0} cy={selLocalY} r={PIN_R} fill={theme.stroke} opacity={0.85} />}

        {/* Data input pins */}
        {inPins.map((pin, i) => (
          <g key={pin.name}>
            <circle cx={0} cy={pin.y - y} r={PIN_R} fill={theme.stroke} opacity={0.85} />
            <text x={6} y={pin.y - y + 4} fill="#8b949e" fontSize={8} fontFamily={FONT}>
              {i}
            </text>
          </g>
        ))}

        {/* Y output pin */}
        {yPin && <circle cx={width} cy={yLocalY} r={PIN_R} fill={theme.stroke} opacity={0.85} />}
      </g>
    )
  }

  // ── Port blocks & instance blocks ────────────────────────────────
  return (
    <g transform={`translate(${x},${y})`}
      onMouseDown={handleMouseDown} onDoubleClick={handleDblClick}
      style={{ cursor: 'grab' }} data-block-id={id}>

      {/* Shadow */}
      <rect x={3} y={3} width={width} height={height} rx={6} fill="rgba(0,0,0,0.5)" />

      {/* Body */}
      <rect width={width} height={height} rx={6}
        fill={isTraced ? 'rgba(255,215,0,0.12)' : theme.fill}
        stroke={isTraced ? '#ffd700' : theme.stroke}
        strokeWidth={isTraced ? 2 : 1.5} />

      {/* Header stripe */}
      <rect width={width} height={20} rx={6} fill={theme.stroke} opacity={0.15} />
      <rect width={width} height={14} y={6}  fill={theme.stroke} opacity={0.15} />

      {/* Instance type label */}
      {kind === 'instance' && (
        <text x={width / 2} y={13} textAnchor="middle"
          fill={theme.stroke} fontSize={9} fontFamily={FONT} opacity={0.9}>
          {type}
        </text>
      )}

      {/* Port kind hint */}
      {kind !== 'instance' && (
        <text x={width / 2} y={height / 2 - 8} textAnchor="middle"
          fill={theme.stroke} fontSize={10} opacity={0.6}>
          {kind === 'input_port'  ? '▶ input'  :
           kind === 'output_port' ? '◀ output' : '↔ inout'}
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
        fontFamily={FONT}>
        {name}
      </text>

      {/* Enter hint */}
      {canEnter && (
        <text x={width / 2} y={height - 6} textAnchor="middle"
          fill={theme.stroke} fontSize={8} opacity={0.6}>
          dbl-click to enter ▶
        </text>
      )}

      {/* Input pins (left) */}
      {inPins.map(pin => (
        <g key={pin.name} transform={`translate(0,${pin.y - y})`}>
          <circle cx={0} cy={0} r={PIN_R} fill={theme.stroke} opacity={0.85} />
          <text x={6} y={4} fill="#8b949e" fontSize={9} fontFamily={FONT}>{pin.name}</text>
        </g>
      ))}

      {/* Output pins (right) */}
      {outPins.map(pin => (
        <g key={pin.name} transform={`translate(${width},${pin.y - y})`}>
          <circle cx={0} cy={0} r={PIN_R} fill={theme.stroke} opacity={0.85} />
          <text x={-6} y={4} textAnchor="end" fill="#8b949e" fontSize={9} fontFamily={FONT}>
            {pin.name}
          </text>
        </g>
      ))}
    </g>
  )
}
