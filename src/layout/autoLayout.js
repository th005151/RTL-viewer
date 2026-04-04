/**
 * Auto-layout engine for RTL block diagrams.
 * Supports: module input/output ports, instances, synthetic DFF, synthetic MUX.
 *
 * Column assignment:
 *   col 0     → module input ports
 *   col 1..N  → instances / DFF / MUX, ordered by data-flow depth
 *   col N+1   → module output ports
 */

const BLOCK_W    = 150
const BLOCK_H_MIN = 64
const DFF_W      = 140
const DFF_H      = 88
const MUX_W      = 100
const PIN_SPACING = 26
const H_GAP      = 160
const V_GAP      = 36
const MARGIN     = 80

// ── Public API ──────────────────────────────────────────────────────────────

export function computeLayout(moduleData, netlist, savedPositions = {}) {
  const blocks = []

  const inputs  = moduleData.ports.filter(p => p.dir === 'input')
  const outputs = moduleData.ports.filter(p => p.dir === 'output')
  const inouts  = moduleData.ports.filter(p => p.dir === 'inout')

  // Unified depth map for instances + synthDFFs + synthMuxes
  const depthOf  = computeAllDepths(moduleData)
  const maxDepth = Object.values(depthOf).length > 0
    ? Math.max(...Object.values(depthOf), 1)
    : 0

  const outputCol = maxDepth + 1
  const colX = col => MARGIN + col * (BLOCK_W + H_GAP)

  // ── Input ports (col 0) ──────────────────────────────────────────
  inputs.forEach((port, i) => blocks.push(makePortBlock('input', port, 0, i)))
  inouts.forEach((port, i) => blocks.push(makePortBlock('inout', port, 0, inputs.length + i)))

  // ── Instances ────────────────────────────────────────────────────
  const colCount = {}
  const bump = col => { const n = colCount[col] ?? 0; colCount[col] = n + 1; return n }

  moduleData.instances.forEach(inst => {
    const col    = depthOf[`inst_${inst.name}`] ?? 1
    const colIdx = bump(col)
    const portDirs = inst.portDirs || {}
    const inPins  = Object.keys(inst.connections).filter(p => portDirs[p] !== 'output')
    const outPins = Object.keys(inst.connections).filter(p => portDirs[p] === 'output')
    const h       = blockHeight(Math.max(inPins.length, outPins.length))

    blocks.push({
      id: `inst_${inst.name}`,
      kind: 'instance',
      name: inst.name,
      type: inst.type,
      connections: inst.connections,
      portDirs,
      width:   BLOCK_W,
      height:  h,
      inPins:  inPins.map(p => ({ name: p })),
      outPins: outPins.map(p => ({ name: p })),
      _col: col, _colIdx: colIdx,
      canEnter: !!netlist[inst.type],
    })
  })

  // ── Synthetic DFF blocks ─────────────────────────────────────────
  moduleData.synthDFFs?.forEach(dff => {
    const col    = depthOf[dff.id] ?? 1
    const colIdx = bump(col)
    blocks.push({
      id: dff.id,
      kind:    'dff',
      name:    dff.regName,
      dNet:    dff.dNet,
      clkNet:  dff.clkNet,
      regName: dff.regName,
      width:   DFF_W,
      height:  DFF_H,
      inPins:  [{ name: 'd' }],
      clkPins: [{ name: 'clk' }],
      outPins: [{ name: 'q' }],
      _col: col, _colIdx: colIdx,
      canEnter: false,
    })
  })

  // ── Synthetic MUX blocks ─────────────────────────────────────────
  moduleData.synthMuxes?.forEach(mux => {
    const col    = depthOf[mux.id] ?? 1
    const colIdx = bump(col)
    const muxH   = Math.max(BLOCK_H_MIN, (mux.inputs.length + 1) * PIN_SPACING + 24)
    blocks.push({
      id:      mux.id,
      kind:    'mux',
      name:    'mux',
      selNet:  mux.selNet,
      inputs:  mux.inputs,
      outNet:  mux.outNet,
      width:   MUX_W,
      height:  muxH,
      inPins:  mux.inputs.map((_, i) => ({ name: `in${i}` })),
      selPins: [{ name: 'sel' }],
      outPins: [{ name: 'y' }],
      _col: col, _colIdx: colIdx,
      canEnter: false,
    })
  })

  // ── Output ports (last col) ──────────────────────────────────────
  outputs.forEach((port, i) => blocks.push(makePortBlock('output', port, outputCol, i)))

  // ── Assign x, y ─────────────────────────────────────────────────
  const colY = {}
  blocks.forEach(b => {
    const key = b.id
    if (savedPositions[key]) {
      b.x = savedPositions[key].x
      b.y = savedPositions[key].y
    } else {
      const col    = b._col ?? (b.kind === 'output_port' ? outputCol : 0)
      const startY = colY[col] ?? MARGIN
      b.x = colX(col)
      b.y = startY
      colY[col] = startY + b.height + V_GAP
    }
    delete b._col
    delete b._colIdx
  })

  blocks.forEach(b => setPinPositions(b))
  return blocks
}

export function computeWires(blocks, moduleData) {
  const netMap = {}
  const ensure = net => { if (!netMap[net]) netMap[net] = { drivers: [], loads: [] } }

  blocks.forEach(b => {
    if (b.kind === 'input_port' || b.kind === 'inout_port') {
      ensure(b.name)
      const pin = b.outPins[0]
      if (pin) netMap[b.name].drivers.push({ blockId: b.id, pin })

    } else if (b.kind === 'output_port') {
      ensure(b.name)
      const pin = b.inPins[0]
      if (pin) netMap[b.name].loads.push({ blockId: b.id, pin })

    } else if (b.kind === 'instance') {
      Object.entries(b.connections).forEach(([portName, netExpr]) => {
        const net = baseName(netExpr)
        if (!net || /^\d/.test(net)) return
        ensure(net)
        const isOut = b.portDirs[portName] === 'output'
        const pin   = (isOut ? b.outPins : b.inPins).find(p => p.name === portName)
        if (!pin) return
        if (isOut) netMap[net].drivers.push({ blockId: b.id, pin })
        else       netMap[net].loads.push({ blockId: b.id, pin })
      })

    } else if (b.kind === 'dff') {
      // D input
      ensure(b.dNet)
      const dPin = b.inPins[0]
      if (dPin) netMap[b.dNet].loads.push({ blockId: b.id, pin: dPin })
      // CLK input
      if (b.clkNet) {
        ensure(b.clkNet)
        const clkPin = b.clkPins?.[0]
        if (clkPin) netMap[b.clkNet].loads.push({ blockId: b.id, pin: clkPin })
      }
      // Q output (= regName net)
      ensure(b.regName)
      const qPin = b.outPins[0]
      if (qPin) netMap[b.regName].drivers.push({ blockId: b.id, pin: qPin })

    } else if (b.kind === 'mux') {
      // Data inputs
      b.inputs.forEach((net, i) => {
        if (!net || /^\d/.test(net)) return
        ensure(net)
        const pin = b.inPins[i]
        if (pin) netMap[net].loads.push({ blockId: b.id, pin })
      })
      // Sel input
      if (b.selNet) {
        ensure(b.selNet)
        const selPin = b.selPins?.[0]
        if (selPin) netMap[b.selNet].loads.push({ blockId: b.id, pin: selPin })
      }
      // Y output
      ensure(b.outNet)
      const yPin = b.outPins[0]
      if (yPin) netMap[b.outNet].drivers.push({ blockId: b.id, pin: yPin })
    }
  })

  // Simple assign wire-throughs
  moduleData.assigns?.forEach(({ target, expr }) => {
    const src = baseName(expr)
    if (!src || /^\d/.test(src)) return
    ensure(src)
    ensure(target)
    netMap[target]._assignSrc = src
  })

  // Build wire segments
  const wires = []
  const seen  = new Set()

  Object.entries(netMap).forEach(([net, { drivers, loads, _assignSrc }]) => {
    const actualDrivers = _assignSrc && netMap[_assignSrc]
      ? [...drivers, ...netMap[_assignSrc].drivers]
      : drivers

    actualDrivers.forEach(driver => {
      loads.forEach(load => {
        const id = `${net}__${driver.blockId}__${load.blockId}`
        if (seen.has(id)) return
        seen.add(id)
        wires.push({
          id,
          net,
          fromX: driver.pin.x,
          fromY: driver.pin.y,
          toX:   load.pin.x,
          toY:   load.pin.y,
          fromBlockId: driver.blockId,
          toBlockId:   load.blockId,
          isClk: net === load.pin?.name && load.pin?.name === 'clk',
        })
      })
    })
  })

  return wires
}

// ── Layout helpers ──────────────────────────────────────────────────────────

function makePortBlock(dirKind, port, col, rowIndex) {
  const isInput = dirKind !== 'output'
  return {
    id:      `port_${dirKind}_${port.name}`,
    kind:    `${dirKind}_port`,
    name:    port.name,
    width:   BLOCK_W,
    height:  BLOCK_H_MIN,
    inPins:  isInput ? [] : [{ name: port.name }],
    outPins: isInput ? [{ name: port.name }] : [],
    _col:    col,
    _colIdx: rowIndex,
  }
}

function blockHeight(maxPins) {
  return Math.max(BLOCK_H_MIN, maxPins * PIN_SPACING + 24)
}

function setPinPositions(block) {
  const { x, y, height, width, inPins, outPins } = block

  if (block.kind === 'dff') {
    // D pin: left side, upper third
    const dPin = inPins[0]
    if (dPin) { dPin.x = x; dPin.y = y + height * 0.33 }
    // CLK pin: left side, lower area
    const clkPin = block.clkPins?.[0]
    if (clkPin) { clkPin.x = x; clkPin.y = y + height * 0.72 }
    // Q pin: right side, center
    const qPin = outPins[0]
    if (qPin) { qPin.x = x + width; qPin.y = y + height * 0.5 }
    return
  }

  if (block.kind === 'mux') {
    // Sel pin: left side, top area
    const selPin = block.selPins?.[0]
    if (selPin) { selPin.x = x; selPin.y = y + height * 0.12 }
    // Data input pins: left side, distributed below sel
    const n = inPins.length
    inPins.forEach((pin, i) => {
      pin.x = x
      pin.y = y + height * (0.25 + (i + 1) * 0.65 / (n + 1))
    })
    // Y output: right edge center (trapezoid narrows to center on right)
    const yPin = outPins[0]
    if (yPin) { yPin.x = x + width; yPin.y = y + height * 0.5 }
    return
  }

  // Default: distribute evenly on left/right
  inPins.forEach((pin, i) => {
    pin.x = x
    pin.y = y + height * (i + 1) / (inPins.length + 1)
  })
  outPins.forEach((pin, i) => {
    pin.x = x + width
    pin.y = y + height * (i + 1) / (outPins.length + 1)
  })
}

// ── Unified topological depth ────────────────────────────────────────────────

/**
 * Compute column depth for every block (instances, DFFs, MUXes).
 * Returns { blockId → depth } where depth ≥ 1.
 */
function computeAllDepths(moduleData) {
  // Build a unified list of virtual instances
  const vInsts = []

  moduleData.instances.forEach(inst => {
    const portDirs = inst.portDirs || {}
    vInsts.push({
      id: `inst_${inst.name}`,
      inputNets: Object.entries(inst.connections)
        .filter(([p]) => portDirs[p] !== 'output')
        .map(([, v]) => baseName(v)).filter(n => n && !/^\d/.test(n)),
      outputNets: Object.entries(inst.connections)
        .filter(([p]) => portDirs[p] === 'output')
        .map(([, v]) => baseName(v)).filter(n => n && !/^\d/.test(n)),
    })
  })

  moduleData.synthDFFs?.forEach(dff => {
    vInsts.push({
      id: dff.id,
      inputNets:  [dff.dNet, dff.clkNet].filter(n => n && !/^\d/.test(n)),
      outputNets: [dff.regName].filter(Boolean),
    })
  })

  moduleData.synthMuxes?.forEach(mux => {
    vInsts.push({
      id: mux.id,
      inputNets:  [...mux.inputs, mux.selNet].filter(n => n && !/^\d/.test(n)),
      outputNets: [mux.outNet].filter(Boolean),
    })
  })

  // Iterative relaxation
  const depthOf  = {}
  const netDepth = {}

  moduleData.ports.filter(p => p.dir === 'input' || p.dir === 'inout')
    .forEach(p => { netDepth[p.name] = 0 })

  let changed = true, guard = 0
  while (changed && guard++ < 200) {
    changed = false

    vInsts.forEach(vi => {
      const inputDepths = vi.inputNets
        .map(n => netDepth[n]).filter(d => d !== undefined)

      const myDepth = inputDepths.length > 0 ? Math.max(...inputDepths) + 1 : 1

      if (depthOf[vi.id] !== myDepth) {
        depthOf[vi.id] = myDepth
        changed = true
      }

      vi.outputNets.forEach(n => {
        const cur = netDepth[n]
        if (cur === undefined || cur < myDepth) {
          netDepth[n] = myDepth
          changed = true
        }
      })
    })

    // Propagate simple assigns
    moduleData.assigns?.forEach(({ target, expr }) => {
      const src = baseName(expr)
      if (src && netDepth[src] !== undefined && netDepth[target] === undefined) {
        netDepth[target] = netDepth[src]
        changed = true
      }
    })
  }

  vInsts.forEach(vi => { if (depthOf[vi.id] === undefined) depthOf[vi.id] = 1 })
  return depthOf
}

function baseName(expr) {
  if (!expr) return ''
  const m = expr.match(/^([A-Za-z_]\w*)/)
  return m ? m[1] : ''
}
