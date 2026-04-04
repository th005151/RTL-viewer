import { create } from 'zustand'
import { parseVerilog } from '../parser/verilogParser'
import { computeLayout, computeWires } from '../layout/autoLayout'

const SAMPLE_CODE = `// RTL Schematic Viewer — Pipeline ALU Demo
// Demonstrates: sub-modules, DFF (always@posedge), MUX (ternary + case)
//
// Double-click any instance block to enter its hierarchy.

// ── Top level: pipelined ALU ────────────────────────────────────
module cpu_pipe (
  input        clk,
  input  [7:0] a,
  input  [7:0] b,
  input        op,
  output [7:0] result,
  output       zero
);
  wire [7:0] alu_out;
  reg  [7:0] pipe_r;

  // ALU computes combinationally
  alu u_alu (
    .a   (a),
    .b   (b),
    .op  (op),
    .out (alu_out)
  );

  // Pipeline register — renders as DFF with clock pin
  always @(posedge clk)
    pipe_r <= alu_out;

  assign result = pipe_r;
  assign zero   = op ? pipe_r : alu_out;

endmodule

// ── ALU: add or subtract selected by op ────────────────────────
module alu (
  input  [7:0] a,
  input  [7:0] b,
  input        op,
  output [7:0] out
);
  wire [7:0] add_out;
  wire [7:0] sub_out;

  adder      u_add (.a(a), .b(b), .s(add_out));
  subtractor u_sub (.a(a), .b(b), .d(sub_out));

  // Ternary MUX — renders as trapezoid
  assign out = op ? sub_out : add_out;

endmodule

// ── Adder ───────────────────────────────────────────────────────
module adder (
  input  [7:0] a,
  input  [7:0] b,
  output [7:0] s
);
  assign s = a + b;
endmodule

// ── Subtractor ──────────────────────────────────────────────────
module subtractor (
  input  [7:0] a,
  input  [7:0] b,
  output [7:0] d
);
  assign d = a - b;
endmodule`

export const useSchematicStore = create((set, get) => ({
  // ── Source ─────────────────────────────────────────────────
  code: SAMPLE_CODE,

  // ── Parsed netlist ─────────────────────────────────────────
  netlist: {},
  parseError: null,

  // ── Hierarchy navigation ───────────────────────────────────
  // Each entry: { moduleName: string, instanceName: string | null }
  hierarchyPath: [],

  // ── Persistent block positions: { `scope::blockId` → {x,y} } ─
  blockPositions: {},

  // ── Computed layout (current view) ────────────────────────
  blocks: [],
  wires: [],

  // ── Interaction ────────────────────────────────────────────
  tracedNets: new Set(),   // nets highlighted by trace

  // ── Actions ────────────────────────────────────────────────

  setCode: (code) => set({ code }),

  parseCode: () => {
    const { code } = get()
    try {
      const netlist = parseVerilog(code)
      const topModule = Object.keys(netlist)[0]
      set({
        netlist,
        parseError: null,
        hierarchyPath: [{ moduleName: topModule, instanceName: null }],
        tracedNets: new Set(),
      })
      get()._recomputeLayout()
    } catch (e) {
      set({ parseError: e.message })
    }
  },

  /** Double-click on an instance block to enter its hierarchy */
  enterModule: (instanceName, moduleType) => {
    const { netlist } = get()
    if (!netlist[moduleType]) return  // black box — can't enter
    set(s => ({
      hierarchyPath: [...s.hierarchyPath, { moduleName: moduleType, instanceName }],
      tracedNets: new Set(),
    }))
    get()._recomputeLayout()
  },

  /** Breadcrumb click — navigate up to a specific level */
  navigateTo: (index) => {
    set(s => ({
      hierarchyPath: s.hierarchyPath.slice(0, index + 1),
      tracedNets: new Set(),
    }))
    get()._recomputeLayout()
  },

  /** Called when user drags a block to a new position */
  moveBlock: (blockId, x, y) => {
    const { hierarchyPath } = get()
    const scope = hierarchyPath[hierarchyPath.length - 1]?.moduleName ?? 'top'
    const key = `${scope}::${blockId}`
    set(s => ({ blockPositions: { ...s.blockPositions, [key]: { x, y } } }))
    get()._recomputeLayout()
  },

  /** Click on a wire to toggle tracing of its net */
  traceNet: (net) => {
    set(s => {
      const traced = new Set(s.tracedNets)
      if (traced.has(net)) traced.delete(net)
      else traced.add(net)
      return { tracedNets: traced }
    })
  },

  clearTrace: () => set({ tracedNets: new Set() }),

  /** Reset all block positions for current module (re-auto-layout) */
  resetLayout: () => {
    const { hierarchyPath } = get()
    const scope = hierarchyPath[hierarchyPath.length - 1]?.moduleName
    if (!scope) return
    set(s => {
      const next = { ...s.blockPositions }
      Object.keys(next).forEach(k => { if (k.startsWith(`${scope}::`)) delete next[k] })
      return { blockPositions: next }
    })
    get()._recomputeLayout()
  },

  // ── Internal ───────────────────────────────────────────────

  _recomputeLayout: () => {
    const { netlist, hierarchyPath, blockPositions } = get()
    if (hierarchyPath.length === 0) return

    const scope = hierarchyPath[hierarchyPath.length - 1].moduleName
    const moduleData = netlist[scope]
    if (!moduleData) return

    const prefix = `${scope}::`
    const saved = {}
    Object.entries(blockPositions).forEach(([k, v]) => {
      if (k.startsWith(prefix)) saved[k.slice(prefix.length)] = v
    })

    try {
      const blocks = computeLayout(moduleData, netlist, saved)
      const wires  = computeWires(blocks, moduleData)
      set({ blocks, wires, parseError: null })
    } catch (e) {
      console.error('Layout error:', e)
      set({ parseError: `Layout error: ${e.message}` })
    }
  },
}))
