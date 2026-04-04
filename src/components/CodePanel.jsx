import React, { useRef, useEffect } from 'react'
import { useSchematicStore } from '../store/useSchematicStore'

export default function CodePanel() {
  const { code, setCode, parseCode, parseError } = useSchematicStore()
  const fileRef = useRef(null)

  // Auto-parse on mount
  useEffect(() => { parseCode() }, [])

  const handleKeyDown = (e) => {
    // Ctrl+Enter → parse
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      parseCode()
    }
    // Tab → insert spaces
    if (e.key === 'Tab') {
      e.preventDefault()
      const ta = e.target
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const next = code.substring(0, start) + '  ' + code.substring(end)
      setCode(next)
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 2
      })
    }
  }

  const handleFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      setCode(ev.target.result)
      // Auto-parse after file load
      setTimeout(() => useSchematicStore.getState().parseCode(), 0)
    }
    reader.readAsText(file)
    e.target.value = ''  // allow re-uploading same file
  }

  return (
    <div className="code-panel">
      <div className="code-panel-header">
        <span>SOURCE</span>
        <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 11 }}>
          .v / .sv
        </span>
      </div>

      <textarea
        value={code}
        onChange={e => setCode(e.target.value)}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        placeholder="// Paste your Verilog / SystemVerilog here..."
        style={{ flex: 1, borderRadius: 0, border: 'none' }}
      />

      {parseError && (
        <div className="parse-error" title={parseError}>
          ⚠ {parseError}
        </div>
      )}

      <div className="code-panel-footer">
        <button className="primary" onClick={parseCode} style={{ flex: 1 }}>
          ▶ Render  <span style={{ opacity: 0.7, fontSize: 11 }}>(Ctrl+↵)</span>
        </button>
        <button onClick={() => fileRef.current.click()} title="Upload a Verilog file">
          ↑ Upload
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".v,.sv,.verilog"
          style={{ display: 'none' }}
          onChange={handleFile}
        />
      </div>
    </div>
  )
}
