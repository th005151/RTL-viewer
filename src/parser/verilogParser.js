/**
 * Lightweight Verilog/SystemVerilog parser.
 * Handles ANSI-style port declarations, wire/reg decls, named-port instantiations.
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

  // Match module...endmodule blocks
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

  // Second pass: infer instance port directions
  inferPortDirections(modules)

  return modules
}

function parseModuleBody(name, portDecl, body) {
  const ports = parsePorts(portDecl, body)
  const instances = parseInstances(body)
  const wires = parseWireDecls(body)
  const assigns = parseAssigns(body)
  return { name, ports, instances, wires, assigns }
}

function parsePorts(portDecl, body) {
  const ports = []
  const seen = new Set()

  // Match: input/output/inout [wire|reg|logic] [signed] [width] name, name2
  const re = /\b(input|output|inout)\s+(?:(?:wire|reg|logic|signed|unsigned)\s+)*(?:\[(\d+)\s*:\s*(\d+)\]\s+)?(\w+(?:\s*,\s*\w+)*)/g

  // Search both port declaration section and body (handles non-ANSI style too)
  const area = portDecl + '\n' + body
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

  // Pattern: TypeName [#(...)] InstName (.port(net), ...);
  // We match: word word (...); where neither word is a keyword
  const re = /\b(\w+)\s+(?:#\s*\([^)]*\)\s+)?(\w+)\s*\(\s*([\s\S]*?)\)\s*;/g
  let m
  while ((m = re.exec(body)) !== null) {
    const [, type, instName, connStr] = m
    if (SV_KEYWORDS.has(type) || SV_KEYWORDS.has(instName)) continue
    // Must have at least one named connection to distinguish from function calls
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
    const [, port, net] = m
    conns[port] = net.trim()
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

/**
 * Determine whether each instance port is input or output.
 * If the instantiated module is in the netlist, use its port definitions.
 * Otherwise, infer from net connectivity (greedy: first-seen driver wins).
 */
function inferPortDirections(modules) {
  Object.values(modules).forEach(mod => {
    // Nets driven by this module's inputs are "already driven"
    const drivenNets = new Set(
      mod.ports.filter(p => p.dir === 'input').map(p => p.name)
    )
    // Also treat assign targets as driven
    mod.assigns.forEach(a => drivenNets.add(a.target))

    mod.instances.forEach(inst => {
      const instMod = modules[inst.type]

      if (instMod) {
        // Known module — use its port definitions directly
        const portDirMap = {}
        instMod.ports.forEach(p => { portDirMap[p.name] = p.dir })
        inst.portDirs = portDirMap
      } else {
        // Black-box: infer from connectivity
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

/** Extract the base signal name from an expression like "wire[3:0]" → "wire" */
function getBaseName(expr) {
  if (!expr) return ''
  const m = expr.match(/^(\w+)/)
  return m ? m[1] : ''
}
