import React, { useCallback } from 'react'
import Toolbar from './components/Toolbar'
import CodePanel from './components/CodePanel'
import SchematicCanvas from './components/SchematicCanvas'
import Breadcrumb from './components/Breadcrumb'
import ErrorBoundary from './components/ErrorBoundary'

export default function App() {
  // Toolbar zoom/fit handlers are passed down as callbacks
  // The actual implementation lives in SchematicCanvas via a shared ref
  // We use a simple event bus via window custom events to avoid prop-drilling
  const zoomIn  = () => window.dispatchEvent(new CustomEvent('rtl:zoom', { detail: 1.2 }))
  const zoomOut = () => window.dispatchEvent(new CustomEvent('rtl:zoom', { detail: 1 / 1.2 }))
  const fit     = () => window.dispatchEvent(new CustomEvent('rtl:fit'))

  return (
    <ErrorBoundary>
      <div className="app">
        <Toolbar onZoomIn={zoomIn} onZoomOut={zoomOut} onFit={fit} />
        <div className="main">
          <CodePanel />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <Breadcrumb />
            <ErrorBoundary>
              <SchematicCanvasWithEvents />
            </ErrorBoundary>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  )
}

// Thin wrapper that wires up the window event bus to SchematicCanvas callbacks
function SchematicCanvasWithEvents() {
  return <SchematicCanvas />
}
