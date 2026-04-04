import { create } from 'zustand'
import { parseVerilog } from '../parser/verilogParser'
import { computeLayout, computeWires } from '../layout/autoLayout'

const SAMPLE_CODE = `// RTL Schematic Viewer — Sample Design
// Edit here or upload a .v / .sv file!

module top (
  input        clk,
  input        rst_n,
  input  [7:0] data_in,
  output [7:0] data_out
);
  wire [7:0] mux_out;
  wire [7:0] pipe_q;

  mux2x1 u_mux (
    .sel (rst_n),
    .a   (data_in),
    .b   (8'h00),
    .y   (mux_out)
  );

  dff_8bit u_pipe (
    .clk (clk),
    .d   (mux_out),
    .q   (pipe_q)
  );

  assign data_out = pipe_q;

endmodule

module mux2x1 (
  input        sel,
  input  [7:0] a,
  input  [7:0] b,
  output [7:0] y
);
  assign y = sel ? a : b;
endmodule

module dff_8bit (
  input        clk,
  input  [7:0] d,
  output [7:0] q
);
  reg [7:0] q_r;
  always @(posedge clk)
    q_r <= d;
  assign q = q_r;
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
