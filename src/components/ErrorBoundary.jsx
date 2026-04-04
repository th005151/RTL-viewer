import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          padding: 32, color: '#f85149', background: '#0d1117',
          fontFamily: 'monospace', height: '100%', overflow: 'auto'
        }}>
          <h2 style={{ marginBottom: 16 }}>⚠ Render Error</h2>
          <pre style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>
            {this.state.error.toString()}
            {'\n\n'}
            {this.state.error.stack}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}
