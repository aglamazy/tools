'use client'

import React from 'react'
import { formatHours } from '@/app/lib/dateUtils'
import { type WeekEntry, calculateProjectSummaries } from './timingTypes'

type ProjectSummaryProps = {
  weekEntries: WeekEntry[]
}

export default function ProjectSummary({ weekEntries }: ProjectSummaryProps) {
  if (weekEntries.length === 0) return null

  return (
    <div style={{
      background: '#fef3c7',
      border: '1px solid #fbbf24',
      borderRadius: '0.5rem',
      padding: '1rem',
      marginBottom: '1.5rem',
    }}>
      <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem', fontWeight: 600, color: '#92400e' }}>
        סיכום לפי פרויקט
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {calculateProjectSummaries(weekEntries).map(summary => (
          <div
            key={summary.projectName}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '0.5rem 0.75rem',
              background: 'white',
              borderRadius: '0.375rem',
              fontSize: '0.9rem',
            }}
          >
            <span style={{ fontWeight: 500 }}>{summary.projectName}</span>
            <span style={{ fontWeight: 600, color: '#92400e' }}>
              {formatHours(summary.totalHours)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
