import React from 'react'

// ── Colour themes ────────────────────────────────────────────────────────────
const THEME = {
  input_port:  { fill: '#0d2044', stroke: '#388bfd', label: '#388bfd' },
  inout_port:  { fill: '#1a1a3e', stroke: '#bc8cff', label: '#bc8cff' },
  output_port: { fill: '#0d2a1a', stroke: '#3fb950', label: '#3fb950' },
  instance:    { fill: '#1c2128', stroke: '#d29922', label: '#e6edf3' },
  dff:         { fill: '#0f1f35', stroke: '#58a6ff', label: '#e6edf3' },
  mux:         { fill: '#1a1030', stroke: '#bc8cff', label: '#e6edf3' },
  // gate categories
  gate_logic:  { fill: '#071e28', stroke: '#38bdf8', label: '#e6edf3' },  // sky-blue — AND/OR/XOR/NOT…
  gate_arith:  { fill: '#071e14', stroke: '#4ade80', label: '#e6edf3' },  // green    — +/−/×/÷
  gate_cmp:    { fill: '#160a2c', stroke: '#c084fc', label: '#e6edf3' },  // purple   — ==/!=/</>/…
  gate_shift:  { fill: '#1e1700', stroke: '#facc15', label: '#e6edf3' },  // yellow   — <</>>
}

const GATE_LOGIC_TYPES = new Set(['and','or','xor','nand','nor','xnor','not','buf'])
const GATE_ARITH_TYPES = new Set(['add','sub','mul','div'])
const GATE_CMP_TYPES   = new Set(['eq','neq','lt','gt','leq','geq'])

function gateTheme(gateType) {
  if (GATE_LOGIC_TYPES.has(gateType)) return THEME.gate_logic
  if (GATE_ARITH_TYPES.has(gateType)) return THEME.gate_arith
  if (GATE_CMP_TYPES.has(gateType))   return THEME.gate_cmp
  return THEME.gate_shift
}

// Operator symbols shown inside arithmetic / comparison / shift blocks
const GATE_SYMBOL = {
  add: '+',  sub: '−',  mul: '×',  div: '÷',
  eq:  '=',  neq: '≠',  lt:  '<',  gt:  '>',  leq: '≤',  geq: '≥',
  shl: '≪',  shr: '≫',
}

const PIN_R = 4
const FONT  = "'Fira Code','Cascadia Code','Consolas',monospace"

// ── Gate SVG body shapes ─────────────────────────────────────────────────────
// All paths assume origin (0,0) = top-left of the block bounding box.
// W / H come from the block's width / height props (set in autoLayout).

/**
 * Render only the gate body polygon/path.  Pin circles are added separately.
 * Returns one or more SVG elements (no <g> wrapper).
 */
function GateShape({ gateType, width: W, height: H, fill, stroke, isTraced }) {
  const sw  = isTraced ? 2   : 1.5
  const f   = isTraced ? 'rgba(255,215,0,0.12)' : fill
  const s   = isTraced ? '#ffd700' : stroke

  const bubble = (cx, cy, r = 5) => (
    <circle key="bubble" cx={cx} cy={cy} r={r}
      fill={f} stroke={s} strokeWidth={sw} />
  )

  // ── Standard logic gates (H=52 family) ──────────────────────────────
  if (gateType === 'and') return (
    // Straight left edge + D-shaped right
    <path d={`M 0 0 L 0 ${H} L ${H*0.69} ${H} C ${W} ${H} ${W} 0 ${H*0.69} 0 Z`}
      fill={f} stroke={s} strokeWidth={sw} />
  )

  if (gateType === 'nand') {
    const bw = W - 12   // body stops before bubble
    return <>
      <path d={`M 0 0 L 0 ${H} L ${H*0.69} ${H} C ${bw} ${H} ${bw} 0 ${H*0.69} 0 Z`}
        fill={f} stroke={s} strokeWidth={sw} />
      {bubble(W - 5, H / 2)}
    </>
  }

  if (gateType === 'or') return (
    // Concave left, pointed right
    <path d={`M 0 0 Q ${W*0.44} 0 ${W} ${H/2} Q ${W*0.44} ${H} 0 ${H} Q ${H*0.27} ${H/2} 0 0 Z`}
      fill={f} stroke={s} strokeWidth={sw} />
  )

  if (gateType === 'nor') {
    const bw = W - 12
    return <>
      <path d={`M 0 0 Q ${bw*0.52} 0 ${bw} ${H/2} Q ${bw*0.52} ${H} 0 ${H} Q ${H*0.27} ${H/2} 0 0 Z`}
        fill={f} stroke={s} strokeWidth={sw} />
      {bubble(W - 5, H / 2)}
    </>
  }

  if (gateType === 'xor') return (
    // OR body shifted 4px right + extra input curve
    <>
      <path d={`M 4 0 Q ${W*0.44} 0 ${W} ${H/2} Q ${W*0.44} ${H} 4 ${H} Q ${H*0.27+4} ${H/2} 4 0 Z`}
        fill={f} stroke={s} strokeWidth={sw} />
      <path d={`M 0 0 Q ${H*0.23} ${H/2} 0 ${H}`}
        fill="none" stroke={s} strokeWidth={sw} />
    </>
  )

  if (gateType === 'xnor') {
    const bw = W - 12
    return <>
      <path d={`M 4 0 Q ${bw*0.52} 0 ${bw} ${H/2} Q ${bw*0.52} ${H} 4 ${H} Q ${H*0.27+4} ${H/2} 4 0 Z`}
        fill={f} stroke={s} strokeWidth={sw} />
      <path d={`M 0 0 Q ${H*0.23} ${H/2} 0 ${H}`}
        fill="none" stroke={s} strokeWidth={sw} />
      {bubble(W - 5, H / 2)}
    </>
  }

  if (gateType === 'not') return (
    // Triangle + bubble
    <>
      <path d={`M 0 0 L 0 ${H} L ${W-10} ${H/2} Z`}
        fill={f} stroke={s} strokeWidth={sw} />
      {bubble(W - 5, H / 2)}
    </>
  )

  if (gateType === 'buf') return (
    <path d={`M 0 0 L 0 ${H} L ${W} ${H/2} Z`}
      fill={f} stroke={s} strokeWidth={sw} />
  )

  // ── Arithmetic / comparison / shift — rounded rectangle ──────────────
  return (
    <rect width={W} height={H} rx={10}
      fill={f} stroke={s} strokeWidth={sw} />
  )
}

// ── GateBlock component ──────────────────────────────────────────────────────
function GateBlock({ block, isTraced, onDragStart, onDoubleClick }) {
  const { id, kind, gateType, outNet, width: W, height: H,
          inPins, outPins, x, y } = block
  const theme = gateTheme(gateType)

  const handleMouseDown = e => { if (e.button !== 0) return; e.stopPropagation(); onDragStart(id, e) }
  const handleDblClick  = e => { e.stopPropagation(); onDoubleClick(block, e) }

  const isLogic = GATE_LOGIC_TYPES.has(gateType)
  const sym     = GATE_SYMBOL[gateType]

  return (
    <g transform={`translate(${x},${y})`}
      onMouseDown={handleMouseDown} onDoubleClick={handleDblClick}
      style={{ cursor: 'grab' }} data-block-id={id}>

      {/* Drop shadow */}
      <g transform="translate(3,3)" opacity={0.4}>
        <GateShape gateType={gateType} width={W} height={H}
          fill="#000" stroke="#000" isTraced={false} />
      </g>

      {/* Gate body */}
      <GateShape gateType={gateType} width={W} height={H}
        fill={theme.fill} stroke={theme.stroke} isTraced={isTraced} />

      {/* Operator symbol (arithmetic / comparison / shift) */}
      {sym && (
        <>
          <text x={W / 2} y={H * 0.56} textAnchor="middle"
            fill={isTraced ? '#ffd700' : theme.stroke}
            fontSize={22} fontWeight="700" fontFamily={FONT}
            style={{ pointerEvents: 'none' }}>
            {sym}
          </text>
          {/* output net name, small label below symbol */}
          <text x={W / 2} y={H - 7} textAnchor="middle"
            fill="#8b949e" fontSize={8} fontFamily={FONT}
            style={{ pointerEvents: 'none' }}>
            {outNet}
          </text>
        </>
      )}

      {/* For logic gates: tiny gate-type label top-left + output net name */}
      {isLogic && (
        <>
          <text x={isTraced ? W/2 : 6} y={10} textAnchor={isTraced ? 'middle' : 'start'}
            fill={isTraced ? '#ffd700' : theme.stroke}
            fontSize={8} fontFamily={FONT} opacity={0.85}
            style={{ pointerEvents: 'none' }}>
            {gateType.toUpperCase()}
          </text>
          <text x={W / 2} y={H - 7} textAnchor="middle"
            fill="#8b949e" fontSize={8} fontFamily={FONT}
            style={{ pointerEvents: 'none' }}>
            {outNet}
          </text>
        </>
      )}

      {/* Input pin circles */}
      {inPins.map((pin, i) => (
        <circle key={`in${i}`}
          cx={0} cy={pin.y - y} r={PIN_R}
          fill={isTraced ? '#ffd700' : theme.stroke} opacity={0.9} />
      ))}

      {/* Output pin circle */}
      {outPins[0] && (
        <circle cx={W} cy={outPins[0].y - y} r={PIN_R}
          fill={isTraced ? '#ffd700' : theme.stroke} opacity={0.9} />
      )}
    </g>
  )
}

// ── Main Block dispatcher ─────────────────────────────────────────────────────
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

  // ── Gate block ────────────────────────────────────────────────────────
  if (kind === 'gate') {
    return <GateBlock block={block} isTraced={isTraced}
             onDragStart={onDragStart} onDoubleClick={onDoubleClick} />
  }

  // ── DFF ──────────────────────────────────────────────────────────────
  if (kind === 'dff') {
    const dPin   = inPins[0]
    const qPin   = outPins[0]
    const clkPin = block.clkPins?.[0]
    const dLocalY   = dPin   ? dPin.y   - y : height * 0.33
    const clkLocalY = clkPin ? clkPin.y - y : height * 0.72
    const qLocalY   = qPin   ? qPin.y   - y : height * 0.5

    return (
      <g transform={`translate(${x},${y})`}
        onMouseDown={handleMouseDown} onDoubleClick={handleDblClick}
        style={{ cursor: 'grab' }} data-block-id={id}>

        <rect x={3} y={3} width={width} height={height} rx={5} fill="rgba(0,0,0,0.45)" />
        <rect width={width} height={height} rx={5}
          fill={isTraced ? 'rgba(255,215,0,0.10)' : theme.fill}
          stroke={isTraced ? '#ffd700' : theme.stroke}
          strokeWidth={isTraced ? 2 : 1.5} />
        <rect width={width} height={18} rx={5} fill={theme.stroke} opacity={0.18} />
        <rect width={width} height={12} y={6}  fill={theme.stroke} opacity={0.18} />

        <text x={width / 2} y={13} textAnchor="middle"
          fill={theme.stroke} fontSize={9} fontFamily={FONT} opacity={0.9}>DFF</text>

        <text x={width / 2} y={height / 2 + 8} textAnchor="middle"
          fill={theme.label} fontSize={13} fontWeight="600" fontFamily={FONT}>{name}</text>

        <text x={8} y={dLocalY + 4} fill="#8b949e" fontSize={9} fontFamily={FONT}>D</text>
        <text x={width - 8} y={qLocalY + 4} textAnchor="end"
          fill="#8b949e" fontSize={9} fontFamily={FONT}>Q</text>

        {/* Clock triangle symbol */}
        <path d={`M 0 ${clkLocalY - 7} L 9 ${clkLocalY} L 0 ${clkLocalY + 7}`}
          fill="none" stroke={theme.stroke} strokeWidth={1.5} />

        {dPin   && <circle cx={0}     cy={dLocalY}   r={PIN_R} fill={theme.stroke} opacity={0.85} />}
        {clkPin && <circle cx={0}     cy={clkLocalY} r={PIN_R} fill={theme.stroke} opacity={0.85} />}
        {qPin   && <circle cx={width} cy={qLocalY}   r={PIN_R} fill={theme.stroke} opacity={0.85} />}
      </g>
    )
  }

  // ── MUX (trapezoid) ───────────────────────────────────────────────────
  if (kind === 'mux') {
    const selPin    = block.selPins?.[0]
    const yPin      = outPins[0]
    const selLocalY = selPin ? selPin.y - y : height * 0.12
    const yLocalY   = yPin   ? yPin.y  - y : height * 0.5
    const rTop = height * 0.2
    const rBot = height * 0.8
    const trapPoints = `0,0 ${width},${rTop} ${width},${rBot} 0,${height}`

    return (
      <g transform={`translate(${x},${y})`}
        onMouseDown={handleMouseDown} onDoubleClick={handleDblClick}
        style={{ cursor: 'grab' }} data-block-id={id}>

        <polygon
          points={`3,3 ${width+3},${rTop+3} ${width+3},${rBot+3} 3,${height+3}`}
          fill="rgba(0,0,0,0.45)" />
        <polygon points={trapPoints}
          fill={isTraced ? 'rgba(255,215,0,0.10)' : theme.fill}
          stroke={isTraced ? '#ffd700' : theme.stroke}
          strokeWidth={isTraced ? 2 : 1.5} />

        <text x={width * 0.5} y={height / 2 + 5} textAnchor="middle"
          fill={theme.label} fontSize={11} fontWeight="700" fontFamily={FONT}>MUX</text>
        <text x={6} y={selLocalY - 6} fill={theme.stroke} fontSize={8} fontFamily={FONT} opacity={0.85}>sel</text>

        {selPin && <circle cx={0} cy={selLocalY} r={PIN_R} fill={theme.stroke} opacity={0.85} />}
        {inPins.map((pin, i) => (
          <g key={pin.name}>
            <circle cx={0} cy={pin.y - y} r={PIN_R} fill={theme.stroke} opacity={0.85} />
            <text x={6} y={pin.y - y + 4} fill="#8b949e" fontSize={8} fontFamily={FONT}>{i}</text>
          </g>
        ))}
        {yPin && <circle cx={width} cy={yLocalY} r={PIN_R} fill={theme.stroke} opacity={0.85} />}
      </g>
    )
  }

  // ── Port blocks & instance blocks ────────────────────────────────────
  return (
    <g transform={`translate(${x},${y})`}
      onMouseDown={handleMouseDown} onDoubleClick={handleDblClick}
      style={{ cursor: 'grab' }} data-block-id={id}>

      <rect x={3} y={3} width={width} height={height} rx={6} fill="rgba(0,0,0,0.5)" />
      <rect width={width} height={height} rx={6}
        fill={isTraced ? 'rgba(255,215,0,0.12)' : theme.fill}
        stroke={isTraced ? '#ffd700' : theme.stroke}
        strokeWidth={isTraced ? 2 : 1.5} />
      <rect width={width} height={20} rx={6} fill={theme.stroke} opacity={0.15} />
      <rect width={width} height={14} y={6}  fill={theme.stroke} opacity={0.15} />

      {kind === 'instance' && (
        <text x={width / 2} y={13} textAnchor="middle"
          fill={theme.stroke} fontSize={9} fontFamily={FONT} opacity={0.9}>{type}</text>
      )}
      {kind !== 'instance' && (
        <text x={width / 2} y={height / 2 - 8} textAnchor="middle"
          fill={theme.stroke} fontSize={10} opacity={0.6}>
          {kind === 'input_port' ? '▶ input' : kind === 'output_port' ? '◀ output' : '↔ inout'}
        </text>
      )}

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

      {canEnter && (
        <text x={width / 2} y={height - 6} textAnchor="middle"
          fill={theme.stroke} fontSize={8} opacity={0.6}>dbl-click to enter ▶</text>
      )}

      {inPins.map(pin => (
        <g key={pin.name} transform={`translate(0,${pin.y - y})`}>
          <circle cx={0} cy={0} r={PIN_R} fill={theme.stroke} opacity={0.85} />
          <text x={6} y={4} fill="#8b949e" fontSize={9} fontFamily={FONT}>{pin.name}</text>
        </g>
      ))}
      {outPins.map(pin => (
        <g key={pin.name} transform={`translate(${width},${pin.y - y})`}>
          <circle cx={0} cy={0} r={PIN_R} fill={theme.stroke} opacity={0.85} />
          <text x={-6} y={4} textAnchor="end" fill="#8b949e" fontSize={9} fontFamily={FONT}>{pin.name}</text>
        </g>
      ))}
    </g>
  )
}
