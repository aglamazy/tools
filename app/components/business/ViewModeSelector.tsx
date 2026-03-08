'use client'

import React from 'react'
import type { ViewMode } from './timingTypes'

type ViewModeSelectorProps = {
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
}

const LABELS: Record<ViewMode, string> = {
  daily: 'יומי',
  weekly: 'שבועי',
  monthly: 'חודשי',
  recent: 'אחרונים',
}

export default function ViewModeSelector({ viewMode, onViewModeChange }: ViewModeSelectorProps) {
  return (
    <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
      {(['daily', 'weekly', 'monthly', 'recent'] as const).map((mode) => (
        <button
          key={mode}
          onClick={() => onViewModeChange(mode)}
          style={{
            padding: '0.5rem 1rem',
            background: viewMode === mode ? '#3b82f6' : '#f1f5f9',
            color: viewMode === mode ? 'white' : '#475569',
            border: `1px solid ${viewMode === mode ? '#3b82f6' : '#cbd5e1'}`,
            borderRadius: '0.5rem',
            cursor: 'pointer',
            fontSize: '0.9rem',
            fontWeight: viewMode === mode ? 600 : 400,
          }}
        >
          {LABELS[mode]}
        </button>
      ))}
    </div>
  )
}
