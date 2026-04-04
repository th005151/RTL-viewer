import React from 'react'
import { useSchematicStore } from '../store/useSchematicStore'

export default function Toolbar({ onZoomIn, onZoomOut, onFit }) {
  const { parseCode, clearTrace, resetLayout, tracedNets, blocks } = useSchematicStore()

  return (
    <div className="toolbar">
      <span className="toolbar-title">⬛ RTL Schematic Viewer</span>
      <div className="toolbar-sep" />

      <button className="primary" onClick={parseCode} title="Parse the Verilog code and render schematic (Ctrl+Enter)">
        ▶ Render
      </button>

      <div className="toolbar-sep" />

      <button onClick={onZoomIn}  title="Zoom in">＋</button>
      <button onClick={onZoomOut} title="Zoom out">－</button>
      <button onClick={onFit}     title="Fit to screen">⬜ Fit</button>
      <button onClick={resetLayout} title="Reset block positions to auto-layout">↺ Reset Layout</button>

      {tracedNets.size > 0 && (
        <button onClick={clearTrace} style={{ color: 'var(--yellow)' }} title="Clear net trace highlight">
          ✕ Clear Trace
        </button>
      )}

      <span className="toolbar-hint">
        Drag blocks · Scroll to zoom · Double-click instance to enter · Click wire to trace
      </span>
    </div>
  )
}
