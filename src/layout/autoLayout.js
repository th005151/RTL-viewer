/**
 * Auto-layout engine for RTL block diagrams.
 * Computes per-instance "depth" (topological column) so wires always flow left → right.
 *
 * Column assignment:
 *   col 0         → module input ports
 *   col 1..N      → instances, grouped by data-flow depth
 *   col N+1       → module output ports
 */

const BLOCK_W     = 150
const BLOCK_H_MIN = 64
const PIN_SPACING = 26
const H_GAP       = 160   // horizontal gap between columns
const V_GAP       = 36    // vertical gap between blocks in same column
const MARGIN      = 80

// ── Public API ─────────────────────────────────────────────────

export function computeLayout(moduleData, netlist, savedPositions = {}) {
  const blocks = []

  const inputs  = moduleData.ports.filter(p => p.dir === 'input')
  const outputs = moduleData.ports.filter(p => p.dir === 'output')
  const inouts  = moduleData.ports.filter(p => p.dir === 'inout')

  // Compute per-instance column depth
  const depthMap = computeInstanceDepths(moduleData)
  const maxDepth = moduleData.instances.length > 0
    ? Math.max(...Object.values(depthMap), 1)
    : 0

  // Total columns: input(0) + depths(1..maxDepth) + output(maxDepth+1)
  const outputCol  = maxDepth + 1
  const colX = (col) => MARGIN + col * (BLOCK_W + H_GAP)

  // ── Input ports (col 0) ─────────────────────────────────────
  inputs.forEach((port, i) => {
    blocks.push(makePortBlock('input', port, 0, i))
  })
  inouts.forEach((port, i) => {
    blocks.push(makePortBlock('inout', port, 0, inputs.length + i))
  })

  // ── Instances (col = their depth) ───────────────────────────
  // Group by column, track per-column index for y-stacking
  const colCount = {}
  moduleData.instances.forEach(inst => {
    const col = depthMap[inst.name] ?? 1
    const colIdx = colCount[col] ?? 0
    colCount[col] = colIdx + 1

    const portDirs = inst.portDirs || {}
    const inPins  = Object.keys(inst.connections).filter(p => portDirs[p] !== 'output')
    const outPins = Object.keys(inst.connections).filter(p => portDirs[p] === 'output')
    const h = blockHeight(Math.max(inPins.length, outPins.length))
    const id = `inst_${inst.name}`

    blocks.push({
      id,
      kind:        'instance',
      name:        inst.name,
      type:        inst.type,
      connections: inst.connections,
      portDirs,
      width:       BLOCK_W,
      height:      h,
      inPins:      inPins.map(p => ({ name: p })),
      outPins:     outPins.map(p => ({ name: p })),
      _col:        col,
      _colIdx:     colIdx,
      canEnter:    !!netlist[inst.type],
    })
  })

  // ── Output ports (last col) ──────────────────────────────────
  outputs.forEach((port, i) => {
    blocks.push(makePortBlock('output', port, outputCol, i))
  })

  // ── Assign x, y (saved positions override auto) ──────────────
  // Track per-column y cursor for auto-stacking
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

  // ── Compute absolute pin positions ────────────────────────────
  blocks.forEach(b => setPinPositions(b))

  return blocks
}

export function computeWires(blocks, moduleData) {
  const netMap = {}   // net → { drivers: [], loads: [] }
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
        if (!net || /^\d/.test(net)) return   // skip numeric constants
        ensure(net)
        const isOut = b.portDirs[portName] === 'output'
        const pin   = (isOut ? b.outPins : b.inPins).find(p => p.name === portName)
        if (!pin) return
        if (isOut) netMap[net].drivers.push({ blockId: b.id, pin })
        else       netMap[net].loads.push({ blockId: b.id, pin })
      })
    }
  })

  // Simple assign: treat as wire-through (src drivers → target loads)
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
        })
      })
    })
  })

  return wires
}

// ── Layout helpers ──────────────────────────────────────────────

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
  inPins.forEach((pin, i) => {
    pin.x = x
    pin.y = y + height * (i + 1) / (inPins.length + 1)
  })
  outPins.forEach((pin, i) => {
    pin.x = x + width
    pin.y = y + height * (i + 1) / (outPins.length + 1)
  })
}

// ── Topological depth computation ──────────────────────────────
/**
 * Assigns each instance a column depth (1, 2, 3, ...) based on
 * how many "hops" away from the module inputs it is.
 * Instances fed directly by module inputs → depth 1.
 * Instances fed by depth-1 instances → depth 2. Etc.
 */
function computeInstanceDepths(moduleData) {
  const insts   = moduleData.instances
  const depthOf = {}   // instName → depth
  const netDepth = {}  // net → depth it becomes available

  // Module input ports are available at depth 0
  moduleData.ports.filter(p => p.dir === 'input' || p.dir === 'inout')
    .forEach(p => { netDepth[p.name] = 0 })

  // Assigns: if src is known, target becomes available at same depth
  // (handled iteratively below)

  // Iterative relaxation (handles chains of any length)
  let changed = true
  let guard   = 0
  while (changed && guard++ < 200) {
    changed = false
    insts.forEach(inst => {
      const portDirs = inst.portDirs || {}

      // Depths of all nets feeding into this instance's inputs
      const inputDepths = Object.entries(inst.connections)
        .filter(([p]) => portDirs[p] !== 'output')
        .map(([, v]) => {
          const net = baseName(v)
          return (net && !(/^\d/.test(net)) && netDepth[net] !== undefined)
            ? netDepth[net]
            : null
        })
        .filter(d => d !== null)

      // Depth of this instance = max(input depths) + 1, min 1
      const myDepth = inputDepths.length > 0
        ? Math.max(...inputDepths) + 1
        : 1

      if (depthOf[inst.name] !== myDepth) {
        depthOf[inst.name] = myDepth
        changed = true
      }

      // Instance output nets become available at this depth
      Object.entries(inst.connections)
        .filter(([p]) => portDirs[p] === 'output')
        .forEach(([, v]) => {
          const net = baseName(v)
          if (net && !(/^\d/.test(net))) {
            if (netDepth[net] === undefined || netDepth[net] < myDepth) {
              netDepth[net] = myDepth
              changed = true
            }
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

  // Default depth 1 for anything still unresolved
  insts.forEach(inst => {
    if (depthOf[inst.name] === undefined) depthOf[inst.name] = 1
  })

  return depthOf
}

function baseName(expr) {
  if (!expr) return ''
  const m = expr.match(/^([A-Za-z_]\w*)/)  // must start with letter/_
  return m ? m[1] : ''
}
