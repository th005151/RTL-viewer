import React, { useRef, useState, useCallback, useEffect } from 'react'
import { useSchematicStore } from '../store/useSchematicStore'
import Block from './Block'
import Wire from './Wire'

const MIN_ZOOM = 0.1
const MAX_ZOOM = 4

export default function SchematicCanvas() {
  const { blocks, wires, tracedNets, traceNet, moveBlock, enterModule, hierarchyPath } = useSchematicStore()

  const svgRef = useRef(null)
  const [viewport, setViewport] = useState({ tx: 40, ty: 40, scale: 1 })
  const dragRef = useRef(null)   // block drag state
  const panRef  = useRef(null)   // canvas pan state

  // ── Coordinate helpers ──────────────────────────────────────

  const toCanvas = useCallback((screenX, screenY) => {
    const rect = svgRef.current.getBoundingClientRect()
    return {
      x: (screenX - rect.left - viewport.tx) / viewport.scale,
      y: (screenY - rect.top  - viewport.ty) / viewport.scale,
    }
  }, [viewport])

  // ── Fit all blocks in view ──────────────────────────────────

  const fitView = useCallback(() => {
    if (!blocks.length || !svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    blocks.forEach(b => {
      minX = Math.min(minX, b.x)
      minY = Math.min(minY, b.y)
      maxX = Math.max(maxX, b.x + b.width)
      maxY = Math.max(maxY, b.y + b.height)
    })
    const pad = 60
    const scaleX = rect.width  / (maxX - minX + pad * 2)
    const scaleY = rect.height / (maxY - minY + pad * 2)
    const scale  = Math.min(Math.min(scaleX, scaleY), 1)
    setViewport({
      scale,
      tx: -minX * scale + pad * scale,
      ty: -minY * scale + pad * scale,
    })
  }, [blocks])

  // Fit whenever module changes
  useEffect(() => { fitView() }, [hierarchyPath.length])

  // Listen to toolbar events (zoom in/out, fit)
  useEffect(() => {
    const onZoom = (e) => {
      setViewport(v => {
        const rect = svgRef.current?.getBoundingClientRect()
        if (!rect) return v
        const cx = rect.width / 2, cy = rect.height / 2
        const newScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.scale * e.detail))
        const ratio = newScale / v.scale
        return { scale: newScale, tx: cx - (cx - v.tx) * ratio, ty: cy - (cy - v.ty) * ratio }
      })
    }
    const onFit = () => fitView()
    window.addEventListener('rtl:zoom', onZoom)
    window.addEventListener('rtl:fit', onFit)
    return () => { window.removeEventListener('rtl:zoom', onZoom); window.removeEventListener('rtl:fit', onFit) }
  }, [fitView])

  // ── Zoom ────────────────────────────────────────────────────

  const onWheel = useCallback((e) => {
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
    const rect = svgRef.current.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    setViewport(v => {
      const newScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.scale * factor))
      const ratio = newScale / v.scale
      return {
        scale: newScale,
        tx: mx - (mx - v.tx) * ratio,
        ty: my - (my - v.ty) * ratio,
      }
    })
  }, [])

  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [onWheel])

  // ── Mouse events ────────────────────────────────────────────

  const onSvgMouseDown = useCallback((e) => {
    if (e.button !== 0) return
    if (dragRef.current) return  // already dragging a block

    // Start canvas pan
    panRef.current = { startX: e.clientX, startY: e.clientY, tx: viewport.tx, ty: viewport.ty }
    e.currentTarget.style.cursor = 'grabbing'
  }, [viewport])

  const onBlockDragStart = useCallback((blockId, e) => {
    const cvPt = toCanvas(e.clientX, e.clientY)
    const block = blocks.find(b => b.id === blockId)
    if (!block) return
    dragRef.current = {
      blockId,
      offsetX: cvPt.x - block.x,
      offsetY: cvPt.y - block.y,
    }
  }, [blocks, toCanvas])

  const onMouseMove = useCallback((e) => {
    if (dragRef.current) {
      const cvPt = toCanvas(e.clientX, e.clientY)
      moveBlock(
        dragRef.current.blockId,
        cvPt.x - dragRef.current.offsetX,
        cvPt.y - dragRef.current.offsetY,
      )
    } else if (panRef.current) {
      const dx = e.clientX - panRef.current.startX
      const dy = e.clientY - panRef.current.startY
      setViewport({ scale: viewport.scale, tx: panRef.current.tx + dx, ty: panRef.current.ty + dy })
    }
  }, [toCanvas, moveBlock, viewport.scale])

  const onMouseUp = useCallback((e) => {
    dragRef.current = null
    panRef.current  = null
    if (svgRef.current) svgRef.current.style.cursor = ''
  }, [])

  const onBlockDblClick = useCallback((block) => {
    if (block.kind === 'instance') {
      enterModule(block.name, block.type)
    }
  }, [enterModule])

  // ── Traced block detection ──────────────────────────────────

  const tracedBlockIds = new Set()
  if (tracedNets.size > 0) {
    wires.forEach(w => {
      if (tracedNets.has(w.net)) {
        tracedBlockIds.add(w.fromBlockId)
        tracedBlockIds.add(w.toBlockId)
      }
    })
  }

  // ── Render ──────────────────────────────────────────────────

  if (!blocks.length) {
    return (
      <div className="canvas-area">
        <div className="empty-canvas">
          <h2>No Schematic</h2>
          <p>Paste Verilog code and click <strong>▶ Render</strong></p>
        </div>
      </div>
    )
  }

  const transform = `translate(${viewport.tx},${viewport.ty}) scale(${viewport.scale})`

  return (
    <div className="canvas-area" style={{ position: 'relative' }}>
      <svg
        ref={svgRef}
        className="schematic-svg"
        onMouseDown={onSvgMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        {/* Grid background */}
        <defs>
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"
            patternTransform={`translate(${viewport.tx % 20},${viewport.ty % 20}) scale(${viewport.scale})`}>
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#1a2030" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />

        <g transform={transform}>
          {/* Wires (under blocks) */}
          {wires.map(w => (
            <Wire
              key={w.id}
              wire={w}
              isTraced={tracedNets.has(w.net)}
              onClick={traceNet}
            />
          ))}

          {/* Blocks (over wires) */}
          {blocks.map(b => (
            <Block
              key={b.id}
              block={b}
              isTraced={tracedBlockIds.has(b.id)}
              onDragStart={onBlockDragStart}
              onDoubleClick={onBlockDblClick}
            />
          ))}
        </g>
      </svg>

      {/* Zoom indicator */}
      <div style={{
        position: 'absolute', bottom: 12, left: 12,
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 6, padding: '4px 10px', fontSize: 12, color: 'var(--text-muted)',
        pointerEvents: 'none'
      }}>
        {Math.round(viewport.scale * 100)}%
      </div>

      {/* Fit button */}
      <div style={{ position: 'absolute', bottom: 12, left: 70 }}>
        <button onClick={fitView} style={{ fontSize: 12, padding: '4px 10px' }}>⬜ Fit</button>
      </div>

      {/* Legend */}
      <div className="legend">
        <div className="legend-row"><div className="legend-dot" style={{ background: '#388bfd' }} /> Input port</div>
        <div className="legend-row"><div className="legend-dot" style={{ background: '#3fb950' }} /> Output port</div>
        <div className="legend-row"><div className="legend-dot" style={{ background: '#d29922' }} /> Instance</div>
        <div className="legend-row"><div className="legend-dot" style={{ background: '#4a9eff' }} /> Wire (click to trace)</div>
        <div className="legend-row"><div className="legend-dot" style={{ background: '#ffd700' }} /> Traced net</div>
      </div>

      {/* Trace info */}
      {tracedNets.size > 0 && (
        <div style={{
          position: 'absolute', top: 8, right: 8,
          background: 'rgba(255,215,0,0.12)', border: '1px solid #ffd700',
          borderRadius: 6, padding: '6px 12px', fontSize: 12, color: '#ffd700'
        }}>
          Tracing: {[...tracedNets].join(', ')}
        </div>
      )}
    </div>
  )
}
