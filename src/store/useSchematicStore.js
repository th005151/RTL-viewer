import { create } from 'zustand'
import { parseVerilog } from '../parser/verilogParser'
import { computeLayout, computeWires } from '../layout/autoLayout'

const SAMPLE_CODE = `// RTL Schematic Viewer — Gate Icon Demo
// Each assign with a simple operator renders as its own icon:
//   &/| /^/~/!  →  AND / OR / XOR / NOT gate shape
//   + / - / *   →  ADD / SUB / MUL block
//   == / != / < →  comparator block
//   << / >>      →  shift block
//   ? :          →  MUX trapezoid
//   always@posedge → DFF rectangle with clock symbol
// Double-click any instance to enter its hierarchy.

// ── Top: filter-pipeline ───────────────────────────────────────
module top (
  input        clk,
  input  [7:0] a,
  input  [7:0] b,
  input        sel,
  output [7:0] result,
  output       flag
);
  wire [7:0] mux_out;
  wire [7:0] shifted;
  wire [7:0] pipe_out;
  reg  [7:0] pipe_r;

  alu u_alu (.a(a), .b(b), .sel(sel), .out(mux_out));

  // Shift block icon
  assign shifted = mux_out >> a;

  // DFF — pipeline register
  always @(posedge clk)
    pipe_r <= shifted;

  assign pipe_out = pipe_r;

  // Comparator icon
  assign flag   = pipe_out == b;
  assign result = pipe_out;

endmodule

// ── ALU: arithmetic + logic + MUX ─────────────────────────────
module alu (
  input  [7:0] a,
  input  [7:0] b,
  input        sel,
  output [7:0] out
);
  wire [7:0] sum;
  wire [7:0] diff;
  wire [7:0] bitand;
  wire [7:0] bitor;

  // Arithmetic gate icons
  assign sum    = a + b;
  assign diff   = a - b;

  // Logic gate icons
  assign bitand = a & b;
  assign bitor  = a | b;

  // MUX trapezoid selects result
  assign out = sel ? diff : sum;

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
  junctions: [],

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
      const { wires, junctions } = computeWires(blocks, moduleData)
      set({ blocks, wires, junctions, parseError: null })
    } catch (e) {
      console.error('Layout error:', e)
      set({ parseError: `Layout error: ${e.message}` })
    }
  },
}))
