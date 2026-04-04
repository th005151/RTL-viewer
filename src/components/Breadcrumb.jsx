import React from 'react'
import { useSchematicStore } from '../store/useSchematicStore'

export default function Breadcrumb() {
  const { hierarchyPath, navigateTo } = useSchematicStore()

  if (hierarchyPath.length === 0) return null

  return (
    <div className="breadcrumb">
      <span style={{ color: 'var(--text-muted)', marginRight: 4 }}>Hierarchy:</span>
      {hierarchyPath.map((entry, i) => {
        const isLast = i === hierarchyPath.length - 1
        const label = entry.instanceName
          ? `${entry.instanceName} (${entry.moduleName})`
          : entry.moduleName
        return (
          <React.Fragment key={i}>
            {i > 0 && <span className="breadcrumb-sep"> / </span>}
            <span
              className={`breadcrumb-item${isLast ? ' active' : ''}`}
              onClick={() => !isLast && navigateTo(i)}
              title={isLast ? undefined : `Go up to ${entry.moduleName}`}
            >
              {label}
            </span>
          </React.Fragment>
        )
      })}
    </div>
  )
}
