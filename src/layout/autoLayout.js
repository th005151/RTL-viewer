/**
 * Auto-layout engine for RTL block diagrams.
 * Produces x,y coordinates for blocks and absolute pin positions.
 * Uses a simple hierarchical left-to-right layout:
 *   Level 0 (left)  → input ports
 *   Level 1 (mid)   → module instances (topologically sorted)
 *   Level 2 (right) → output ports
 */

const BLOCK_W = 150
const BLOCK_H_MIN = 64
const PIN_SPACING = 26
const H_GAP = 180
const V_GAP = 36
const MARGIN = 80

export function computeLayout(moduleData, netlist, savedPositions = {}) {
  const blocks = []

  const inputs  = moduleData.ports.filter(p => p.dir === 'input')
  const outputs = moduleData.ports.filter(p => p.dir === 'output')
  const inouts  = moduleData.ports.filter(p => p.dir === 'inout')

  // ── Input ports ──────────────────────────────────────────────
  inputs.forEach((port, i) => {
    blocks.push(makePortBlock('input', port, i, 0))
  })
  inouts.forEach((port, i) => {
    blocks.push(makePortBlock('inout', port, inputs.length + i, 0))
  })

  // ── Instances (topologically sorted by data flow) ─────────────
  const sortedInsts = topoSortInstances(moduleData)
  sortedInsts.forEach((inst, i) => {
    const instMod = netlist[inst.type]
    const portDirs = inst.portDirs || {}

    const inPins  = Object.keys(inst.connections).filter(p => portDirs[p] !== 'output')
    const outPins = Object.keys(inst.connections).filter(p => portDirs[p] === 'output')

    const h = blockHeight(Math.max(inPins.length, outPins.length))
    const id = `inst_${inst.name}`

    blocks.push({
      id,
      kind: 'instance',
      name: inst.name,
      type: inst.type,
      connections: inst.connections,
      portDirs,
      width: BLOCK_W,
      height: h,
      inPins:  inPins.map(p => ({ name: p })),
      outPins: outPins.map(p => ({ name: p })),
      level: 1,
      levelIndex: i,
      canEnter: !!netlist[inst.type],  // double-click available
    })
  })

  // ── Output ports ─────────────────────────────────────────────
  outputs.forEach((port, i) => {
    blocks.push(makePortBlock('output', port, i, 2))
  })

  // ── Assign target as output blocks (simple assigns only) ──────
  // Already handled via output ports; complex assigns shown as wires

  // ── Position blocks ───────────────────────────────────────────
  const colCounts = [0, 0, 0]
  const levelX    = [MARGIN, MARGIN + BLOCK_W + H_GAP, MARGIN + 2 * (BLOCK_W + H_GAP)]

  blocks.forEach(b => {
    const idx = colCounts[b.level]++
    const key = b.id
    if (savedPositions[key]) {
      b.x = savedPositions[key].x
      b.y = savedPositions[key].y
    } else {
      b.x = levelX[b.level]
      b.y = MARGIN + idx * (BLOCK_H_MIN + V_GAP)
    }
  })

  // ── Compute absolute pin positions ────────────────────────────
  blocks.forEach(b => setPinPositions(b))

  return blocks
}

/** Build wire objects by joining drivers to loads via net name */
export function computeWires(blocks, moduleData) {
  // Build pin lookup: net → { drivers, loads }
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
        if (!net) return
        ensure(net)
        const isOut = b.portDirs[portName] === 'output'
        const pinList = isOut ? b.outPins : b.inPins
        const pin = pinList.find(p => p.name === portName)
        if (!pin) return
        if (isOut) netMap[net].drivers.push({ blockId: b.id, pin })
        else       netMap[net].loads.push({ blockId: b.id, pin })
      })
    }
  })

  // Handle simple assign statements: assign target = src
  if (moduleData.assigns) {
    moduleData.assigns.forEach(({ target, expr }) => {
      const src = baseName(expr)
      if (!src) return
      ensure(src)
      ensure(target)
      // Create a virtual "pass-through": src drivers → target loads
      // This is done by merging: target loads will be driven by src drivers
      // We handle this at wire-building time below
      netMap[target]._assignSrc = src
    })
  }

  // Build wire segments
  const wires = []
  const seen = new Set()

  Object.entries(netMap).forEach(([net, { drivers, loads, _assignSrc }]) => {
    let actualDrivers = drivers
    if (_assignSrc && netMap[_assignSrc]) {
      actualDrivers = [...drivers, ...netMap[_assignSrc].drivers]
    }

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
          toX: load.pin.x,
          toY: load.pin.y,
          fromBlockId: driver.blockId,
          toBlockId: load.blockId,
        })
      })
    })
  })

  return wires
}

// ── Helpers ────────────────────────────────────────────────────

function makePortBlock(dirKind, port, index, level) {
  const isInput = dirKind === 'input' || dirKind === 'inout'
  const kind = `${dirKind}_port`
  return {
    id: `port_${dirKind}_${port.name}`,
    kind,
    name: port.name,
    width: BLOCK_W,
    height: BLOCK_H_MIN,
    inPins:  isInput ? [] : [{ name: port.name }],
    outPins: isInput ? [{ name: port.name }] : [],
    level,
    levelIndex: index,
  }
}

function blockHeight(maxPins) {
  return Math.max(BLOCK_H_MIN, maxPins * PIN_SPACING + 24)
}

function setPinPositions(block) {
  const { x, y, height, inPins, outPins, width } = block

  inPins.forEach((pin, i) => {
    pin.x = x
    pin.y = y + height * (i + 1) / (inPins.length + 1)
  })
  outPins.forEach((pin, i) => {
    pin.x = x + width
    pin.y = y + height * (i + 1) / (outPins.length + 1)
  })
}

/** Simple topological sort of instances by data-flow dependency */
function topoSortInstances(moduleData) {
  const insts = moduleData.instances
  if (insts.length <= 1) return insts

  // Build driven-net sets for each instance (output nets)
  const instOutputNets = insts.map(inst =>
    new Set(
      Object.entries(inst.connections)
        .filter(([p]) => inst.portDirs[p] === 'output')
        .map(([, v]) => baseName(v))
        .filter(Boolean)
    )
  )

  const order = []
  const visited = new Set()
  const visiting = new Set()

  const visit = (i) => {
    if (visited.has(i)) return
    if (visiting.has(i)) return // cycle — skip
    visiting.add(i)

    // Find dependencies: instances whose outputs feed into inst[i]'s inputs
    const inputNets = new Set(
      Object.entries(insts[i].connections)
        .filter(([p]) => insts[i].portDirs[p] !== 'output')
        .map(([, v]) => baseName(v))
        .filter(Boolean)
    )

    insts.forEach((_, j) => {
      if (j === i) return
      for (const net of instOutputNets[j]) {
        if (inputNets.has(net)) { visit(j); break }
      }
    })

    visiting.delete(i)
    visited.add(i)
    order.push(insts[i])
  }

  insts.forEach((_, i) => visit(i))
  return order
}

function baseName(expr) {
  if (!expr) return ''
  const m = expr.match(/^(\w+)/)
  return m ? m[1] : ''
}
