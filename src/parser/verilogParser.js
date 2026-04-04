/**
 * Lightweight Verilog/SystemVerilog parser.
 * Handles ANSI-style port declarations, wire/reg decls, named-port instantiations,
 * ternary-assign → MUX, always@posedge → DFF, always@* case → MUX.
 */

const SV_KEYWORDS = new Set([
  'module','endmodule','input','output','inout','wire','reg','logic',
  'assign','always','initial','begin','end','if','else','case','endcase',
  'for','while','function','endfunction','task','endtask',
  'generate','endgenerate','parameter','localparam','posedge','negedge',
  'and','or','not','nand','nor','xor','xnor','buf','bufif0','bufif1',
  'always_ff','always_comb','always_latch','unique','priority','typedef',
  'struct','union','enum','interface','endinterface','modport',
])

function stripComments(code) {
  return code
    .replace(/\/\/[^\n]*/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
}

/** Parse all modules in a Verilog file. Returns { moduleName: moduleData } */
export function parseVerilog(code) {
  const clean = stripComments(code)
  const modules = {}

  const modRe = /\bmodule\s+(\w+)\s*(?:#\s*\([^)]*\)\s*)?\s*\(([\s\S]*?)\)\s*;([\s\S]*?)\bendmodule\b/g
  let m
  while ((m = modRe.exec(clean)) !== null) {
    const [, name, portDecl, body] = m
    try {
      modules[name] = parseModuleBody(name, portDecl, body)
    } catch (e) {
      console.warn(`Parse warning for module "${name}":`, e.message)
    }
  }

  if (Object.keys(modules).length === 0) {
    throw new Error('No modules found. Check your Verilog syntax.')
  }

  inferPortDirections(modules)
  return modules
}

function parseModuleBody(name, portDecl, body) {
  const ports    = parsePorts(portDecl, body)
  const instances = parseInstances(body)
  const wires    = parseWireDecls(body)

  // Parse always blocks first (DFF + comb MUX)
  const { synthDFFs, synthMuxes: alwaysMuxes } = parseAlwaysBlocks(body)

  // Parse ternary assigns → MUX
  const ternaryMuxes = parseTernaryAssigns(body)

  // Merge muxes, dedup by id (ternary wins over always-comb for same net)
  const muxById = {}
  ;[...alwaysMuxes, ...ternaryMuxes].forEach(mx => { muxById[mx.id] = mx })
  const synthMuxes = Object.values(muxById)

  // Simple assigns (exclude ternary, which became MUX blocks)
  const assigns = parseAssigns(body).filter(({ expr }) => !expr.includes('?'))

  return { name, ports, instances, wires, assigns, synthDFFs, synthMuxes }
}

// ── Port / instance / wire / assign parsers ─────────────────────────────────

function parsePorts(portDecl, body) {
  const ports = []
  const seen  = new Set()
  const re    = /\b(input|output|inout)\s+(?:(?:wire|reg|logic|signed|unsigned)\s+)*(?:\[(\d+)\s*:\s*(\d+)\]\s+)?(\w+(?:\s*,\s*\w+)*)/g
  const area  = portDecl + '\n' + body
  let m
  while ((m = re.exec(area)) !== null) {
    const [, dir, msb = '0', lsb = '0', names] = m
    const width = Math.abs(parseInt(msb) - parseInt(lsb)) + 1
    names.split(',').map(s => s.trim()).filter(Boolean).forEach(portName => {
      if (!seen.has(portName)) {
        seen.add(portName)
        ports.push({ name: portName, dir, width })
      }
    })
  }
  return ports
}

function parseInstances(body) {
  const instances = []
  const re = /\b(\w+)\s+(?:#\s*\([^)]*\)\s+)?(\w+)\s*\(\s*([\s\S]*?)\)\s*;/g
  let m
  while ((m = re.exec(body)) !== null) {
    const [, type, instName, connStr] = m
    if (SV_KEYWORDS.has(type) || SV_KEYWORDS.has(instName)) continue
    if (!connStr.includes('.')) continue
    const connections = parseConnections(connStr)
    if (Object.keys(connections).length === 0) continue
    instances.push({ name: instName, type, connections, portDirs: {} })
  }
  return instances
}

function parseConnections(connStr) {
  const conns = {}
  const re = /\.(\w+)\s*\(\s*([^)]*?)\s*\)/g
  let m
  while ((m = re.exec(connStr)) !== null) {
    conns[m[1]] = m[2].trim()
  }
  return conns
}

function parseWireDecls(body) {
  const wires = []
  const re = /\b(?:wire|reg|logic)\s+(?:signed\s+)?(?:\[[\d\s:]+\]\s+)?(\w+(?:\s*,\s*\w+)*)\s*(?:=\s*[^;]+)?;/g
  let m
  while ((m = re.exec(body)) !== null) {
    m[1].split(',').map(s => s.trim()).filter(Boolean).forEach(w => {
      if (!wires.includes(w)) wires.push(w)
    })
  }
  return wires
}

function parseAssigns(body) {
  const assigns = []
  const re = /\bassign\s+(\w+)\s*=\s*([^;]+);/g
  let m
  while ((m = re.exec(body)) !== null) {
    assigns.push({ target: m[1].trim(), expr: m[2].trim() })
  }
  return assigns
}

// ── Synthetic block parsers ──────────────────────────────────────────────────

/** assign out = sel ? a : b  →  MUX block */
function parseTernaryAssigns(body) {
  const muxes = []
  const re = /\bassign\s+(\w+)\s*=\s*([A-Za-z_]\w*)\s*\?\s*([A-Za-z_]\w*)\s*:\s*([A-Za-z_]\w*)\s*;/g
  let m
  while ((m = re.exec(body)) !== null) {
    const [, outNet, selNet, a, b] = m
    muxes.push({ id: `_mux_${outNet}`, kind: 'mux', selNet, inputs: [a, b], outNet })
  }
  return muxes
}

/** Parse all always blocks → synthDFFs + synthMuxes */
function parseAlwaysBlocks(body) {
  const synthDFFs  = []
  const synthMuxes = []

  extractAlwaysSegments(body).forEach(({ sensType, clkNet, bodyStr }) => {
    if (sensType === 'ff' && clkNet) {
      // Non-blocking assignments  reg <= expr
      const nbRe   = /\b(\w+)\s*<=\s*([^;]+);/g
      const regMap = {}
      let nb
      while ((nb = nbRe.exec(bodyStr)) !== null) {
        const regName = nb[1].trim()
        const dNet    = bName(nb[2].trim())
        if (dNet) regMap[regName] = dNet   // last valid wins (handles if/else reset)
      }
      Object.entries(regMap).forEach(([regName, dNet]) => {
        synthDFFs.push({ id: `_dff_${regName}`, kind: 'dff', regName, clkNet, dNet })
      })
    } else {
      // Combinational — look for case statements
      const caseRe = /\bcase\s*\(\s*(\w+)\s*\)\s*([\s\S]*?)\bendcase\b/g
      let cs
      while ((cs = caseRe.exec(bodyStr)) !== null) {
        const [, selNet, caseBody] = cs
        const armRe = /:\s*(\w+)\s*=\s*([A-Za-z_]\w*)\s*;/g
        let arm, outNet = null
        const inputs = []
        while ((arm = armRe.exec(caseBody)) !== null) {
          const [, lhs, rhs] = arm
          if (!outNet) outNet = lhs
          if (outNet === lhs) inputs.push(bName(rhs))
        }
        if (outNet && inputs.filter(Boolean).length > 1) {
          synthMuxes.push({
            id: `_mux_${outNet}`, kind: 'mux',
            selNet, inputs: inputs.filter(Boolean), outNet,
          })
        }
      }
    }
  })

  return { synthDFFs, synthMuxes }
}

// ── always-block extractor ───────────────────────────────────────────────────

function extractAlwaysSegments(body) {
  const results = []
  const re = /\b(always(?:_ff|_comb|_latch)?)\b/g
  let m

  while ((m = re.exec(body)) !== null) {
    let pos = m.index + m[0].length
    while (pos < body.length && /\s/.test(body[pos])) pos++

    let sensType = m[1] === 'always_ff' ? 'ff' : 'comb'
    let clkNet   = null

    if (body[pos] === '@') {
      pos++
      while (pos < body.length && /\s/.test(body[pos])) pos++
      if (body[pos] === '(') {
        const closeIdx = findCloseParen(body, pos)
        const sens = body.slice(pos + 1, closeIdx)
        if (/posedge|negedge/.test(sens)) {
          sensType = 'ff'
          const cm = /(?:posedge|negedge)\s+(\w+)/.exec(sens)
          if (cm) clkNet = cm[1]
        }
        pos = closeIdx + 1
      } else if (body[pos] === '*') {
        pos++
      }
      while (pos < body.length && /\s/.test(body[pos])) pos++
    }

    let bodyStr, endPos
    if (/^begin\b/.test(body.slice(pos))) {
      const r = extractBeginEnd(body, pos)
      bodyStr = r.content
      endPos  = r.end
    } else {
      const semiIdx = body.indexOf(';', pos)
      if (semiIdx === -1) continue
      bodyStr = body.slice(pos, semiIdx + 1)
      endPos  = semiIdx + 1
    }

    results.push({ sensType, clkNet, bodyStr })
    re.lastIndex = endPos
  }

  return results
}

function findCloseParen(str, openPos) {
  let depth = 0
  for (let i = openPos; i < str.length; i++) {
    if (str[i] === '(') depth++
    else if (str[i] === ')') { depth--; if (depth === 0) return i }
  }
  return str.length - 1
}

function extractBeginEnd(str, beginPos) {
  let depth = 1
  let i = beginPos + 5  // skip 'begin'
  while (i < str.length && depth > 0) {
    const rest = str.slice(i)
    if (/^begin\b/.test(rest)) { depth++; i += 5 }
    else if (/^end\b/.test(rest)) {
      depth--
      if (depth === 0) return { content: str.slice(beginPos + 5, i).trim(), end: i + 3 }
      i += 3
    } else { i++ }
  }
  return { content: str.slice(beginPos + 5).trim(), end: str.length }
}

/** Extract the leading identifier from an expression (skips numeric constants) */
function bName(expr) {
  if (!expr) return ''
  const m = expr.match(/^([A-Za-z_]\w*)/)
  return m ? m[1] : ''
}

// ── Port direction inference ─────────────────────────────────────────────────

function inferPortDirections(modules) {
  Object.values(modules).forEach(mod => {
    const drivenNets = new Set(
      mod.ports.filter(p => p.dir === 'input').map(p => p.name)
    )
    mod.assigns.forEach(a => drivenNets.add(a.target))
    mod.synthDFFs?.forEach(d  => drivenNets.add(d.regName))
    mod.synthMuxes?.forEach(mx => drivenNets.add(mx.outNet))

    mod.instances.forEach(inst => {
      const instMod = modules[inst.type]
      if (instMod) {
        const portDirMap = {}
        instMod.ports.forEach(p => { portDirMap[p.name] = p.dir })
        inst.portDirs = portDirMap
      } else {
        inst.portDirs = {}
        Object.entries(inst.connections).forEach(([port, netExpr]) => {
          const net = getBaseName(netExpr)
          if (!net) return
          if (drivenNets.has(net)) {
            inst.portDirs[port] = 'input'
          } else {
            inst.portDirs[port] = 'output'
            drivenNets.add(net)
          }
        })
      }
    })
  })
}

function getBaseName(expr) {
  if (!expr) return ''
  const m = expr.match(/^(\w+)/)
  return m ? m[1] : ''
}
