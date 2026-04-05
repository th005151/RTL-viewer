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
  const ports     = parsePorts(portDecl, body)
  const instances = parseInstances(body)
  const wires     = parseWireDecls(body)

  // Parse always blocks first (DFF + comb MUX)
  const { synthDFFs, synthMuxes: alwaysMuxes } = parseAlwaysBlocks(body)

  // Parse every assign expression via the recursive-descent expression parser.
  // This handles arbitrarily nested expressions:
  //   assign out = sel ? diff : sum + bitand;
  //   assign z   = (a & b) | ~c;   etc.
  const { gates: exprGates, muxes: exprMuxes, wireThrus } = parseAllAssignExprs(body)

  // Merge muxes: always-comb muxes + assign-expression muxes, dedup by id
  const muxById = {}
  ;[...alwaysMuxes, ...exprMuxes].forEach(mx => { muxById[mx.id] = mx })
  const synthMuxes = Object.values(muxById)

  const synthGates = exprGates
  const assigns    = wireThrus   // simple wire-throughs: assign a = b

  return { name, ports, instances, wires, assigns, synthDFFs, synthMuxes, synthGates }
}

// ── Port / instance / wire / assign parsers ─────────────────────────────────

function parsePorts(portDecl, body) {
  const ports = []
  const seen  = new Set()
  const re    = /\b(input|output|inout)\s+(?:(?:wire|reg|logic|signed|unsigned)\s+)*(?:\[(\d+)\s*:\s*(\d+)\]\s+)?(\w+(?:[ \t]*,[ \t]*\w+)*)/g
  const area  = portDecl + '\n' + body
  let m
  while ((m = re.exec(area)) !== null) {
    const [, dir, msb = '0', lsb = '0', names] = m
    const width = Math.abs(parseInt(msb) - parseInt(lsb)) + 1
    names.split(',').map(s => s.trim()).filter(Boolean).forEach(portName => {
      if (!seen.has(portName) && !SV_KEYWORDS.has(portName)) {
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

// Operator → gate-type mapping (used by astToBlocks)
const OP_TO_GATE = {
  '&': 'and', '&&': 'and',
  '|': 'or',  '||': 'or',
  '^': 'xor',
  '~^': 'xnor', '^~': 'xnor',
  '~&': 'nand', '~|': 'nor',
  '~': 'not',   '!': 'not',
  '+': 'add',
  '-': 'sub',
  '*': 'mul',
  '/': 'div',
  '==': 'eq',  '===': 'eq',
  '!=': 'neq', '!==': 'neq',
  '<':  'lt',  '>':   'gt',
  '<=': 'leq', '>=':  'geq',
  '<<': 'shl', '<<<': 'shl',
  '>>': 'shr', '>>>': 'shr',
}

// ── Expression tokenizer ─────────────────────────────────────────────────────

// Multi-character operators must be checked before their single-char prefixes
const MULTI_OPS = [
  '===','!==','<<<','>>>','~^','^~','~&','~|','<=','>=','<<','>>','==','!=','&&','||',
]

function tokenizeExpr(expr) {
  // Strip part-select subscripts (e.g. a[3:0] → a) so they don't confuse
  // the ':' splitting in ternary expressions.
  const cleaned = expr.replace(/\[[\s\S]*?\]/g, '')
  const tokens  = []
  let i = 0
  while (i < cleaned.length) {
    if (/\s/.test(cleaned[i])) { i++; continue }
    let matched = false
    for (const op of MULTI_OPS) {
      if (cleaned.startsWith(op, i)) {
        tokens.push({ type: 'op', value: op }); i += op.length; matched = true; break
      }
    }
    if (matched) continue
    const ch = cleaned[i]
    if (/[A-Za-z_]/.test(ch)) {
      const s = cleaned.slice(i).match(/^[A-Za-z_]\w*/)[0]
      tokens.push({ type: 'id', value: s }); i += s.length
    } else if (/\d/.test(ch)) {
      const s = cleaned.slice(i).match(/^\d[\w']*/)[0]
      tokens.push({ type: 'num', value: s }); i += s.length
    } else if ('()?:~!&|^+-*/{}[]<>'.includes(ch)) {
      tokens.push({ type: 'op', value: ch }); i++
    } else {
      i++
    }
  }
  return tokens
}

// ── Recursive-descent expression parser ──────────────────────────────────────
// Verilog operator precedence (low → high):
//   ?: | || | && | | | ^ ~^ | & | == != | < > <= >= | << >> | + - | * / | unary | primary

function parseExprTokens(tokens) {
  let pos = 0
  const peek    = ()    => tokens[pos]
  const consume = ()    => tokens[pos++]
  const match   = (val) => peek()?.value === val ? (consume(), true) : false

  function parseTernary() {
    const cond = parseLogOr()
    if (!match('?')) return cond
    const thenE = parseTernary()
    match(':')
    const elseE = parseTernary()
    return { type: 'ternary', cond, then: thenE, else: elseE }
  }

  function parseBinary(ops, next) {
    let left = next()
    let tok
    while ((tok = peek()) && ops.includes(tok.value)) {
      consume()
      left = { type: 'binary', op: tok.value, left, right: next() }
    }
    return left
  }

  const parseLogOr  = () => parseBinary(['||'],                       parseLogAnd)
  const parseLogAnd = () => parseBinary(['&&'],                       parseBitOr)
  const parseBitOr  = () => parseBinary(['|'],                        parseBitXor)
  const parseBitXor = () => parseBinary(['^', '~^', '^~'],            parseBitAnd)
  const parseBitAnd = () => parseBinary(['&'],                        parseEq)
  const parseEq     = () => parseBinary(['==','!=','===','!=='],      parseCmp)
  const parseCmp    = () => parseBinary(['<','>','<=','>='],          parseShift)
  const parseShift  = () => parseBinary(['<<','>>','<<<','>>>'],      parseAdd)
  const parseAdd    = () => parseBinary(['+','-'],                    parseMul)
  const parseMul    = () => parseBinary(['*','/'],                    parseUnary)

  function parseUnary() {
    const tok = peek()
    if (tok && (tok.value === '~' || tok.value === '!')) {
      consume()
      return { type: 'unary', op: tok.value, operand: parseUnary() }
    }
    return parsePrimary()
  }

  function parsePrimary() {
    const tok = peek()
    if (!tok) return { type: 'num', value: '0' }
    if (tok.value === '(') {
      consume()
      const inner = parseTernary()
      match(')')
      return inner
    }
    if (tok.value === '{') {
      // Concatenation — treat as opaque (skip to matching brace)
      consume(); let depth = 1
      while (pos < tokens.length && depth > 0) {
        const t = consume(); if (t.value === '{') depth++; else if (t.value === '}') depth--
      }
      return { type: 'num', value: '0' }
    }
    consume()
    return tok.type === 'id' ? { type: 'id', name: tok.value } : { type: 'num', value: tok.value }
  }

  try { return parseTernary() }
  catch (_) { return { type: 'num', value: '0' } }
}

// ── AST → gate / mux blocks ──────────────────────────────────────────────────

/**
 * Recursively convert an expression AST into gate and mux block descriptors.
 *
 * @param ast      - Expression node
 * @param outNet   - Net name for this node's output (null → auto-generate)
 * @param gates    - Accumulator for gate blocks
 * @param muxes    - Accumulator for mux blocks
 * @param counter  - Shared { n } counter for synthetic net names
 * @returns  The net name driven by this node, or null for constants
 */
function astToBlocks(ast, outNet, gates, muxes, counter) {
  if (!ast) return null
  if (ast.type === 'id')  return ast.name      // leaf: existing net
  if (ast.type === 'num') return null           // constant: no net

  const net = outNet ?? `_e${counter.n++}`

  if (ast.type === 'unary') {
    const opNet = astToBlocks(ast.operand, null, gates, muxes, counter)
    if (!opNet) return null
    const gateType = OP_TO_GATE[ast.op]
    if (!gateType) return opNet                 // unknown unary — pass through
    gates.push({ id: `_gate_${net}`, kind: 'gate', gateType, inputs: [opNet], outNet: net })
    return net
  }

  if (ast.type === 'binary') {
    const lNet = astToBlocks(ast.left,  null, gates, muxes, counter)
    const rNet = astToBlocks(ast.right, null, gates, muxes, counter)
    const validInputs = [lNet, rNet].filter(Boolean)
    if (validInputs.length === 0) return null
    const gateType = OP_TO_GATE[ast.op]
    if (!gateType) return validInputs[0]        // unknown binary — pass first operand through
    gates.push({ id: `_gate_${net}`, kind: 'gate', gateType, inputs: validInputs, outNet: net })
    return net
  }

  if (ast.type === 'ternary') {
    const condNet = astToBlocks(ast.cond,  null, gates, muxes, counter)
    const thenNet = astToBlocks(ast.then,  null, gates, muxes, counter)
    const elseNet = astToBlocks(ast.else,  null, gates, muxes, counter)
    const inputs  = [thenNet, elseNet].filter(Boolean)
    if (!condNet || inputs.length === 0) return condNet ?? inputs[0] ?? null
    muxes.push({ id: `_mux_${net}`, kind: 'mux', selNet: condNet, inputs, outNet: net })
    return net
  }

  return null
}

// ── Main assign expression parser ────────────────────────────────────────────

/**
 * Parse every `assign target = expr;` in the body.
 *
 * Complex expressions are fully decomposed into an operator tree;
 * each interior node becomes a gate or mux block.
 * Simple wire-throughs (`assign a = b`) are returned separately.
 *
 * Returns { gates, muxes, wireThrus }
 */
function parseAllAssignExprs(body) {
  const gates     = []
  const muxes     = []
  const wireThrus = []
  const counter   = { n: 0 }

  const re = /\bassign\s+(\w+)\s*=\s*([^;]+);/g
  let m
  while ((m = re.exec(body)) !== null) {
    const target  = m[1].trim()
    const exprStr = m[2].trim()
    const ast     = parseExprTokens(tokenizeExpr(exprStr))
    const result  = astToBlocks(ast, target, gates, muxes, counter)

    if (result === null) {
      // Entirely constant — skip
    } else if (result === target) {
      // Root was a gate/mux written directly to target — nothing extra needed
    } else {
      // Root was a plain identifier — wire-through
      wireThrus.push({ target, expr: result })
    }
  }

  return { gates, muxes, wireThrus }
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
    mod.synthGates?.forEach(g  => drivenNets.add(g.outNet))

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
