'use client'

import React from 'react'
import type { WeekEntry } from './timingTypes'
import { formatDisplayDate, formatHours } from '@/app/lib/dateUtils'

type RecentViewProps = {
  weekEntries: WeekEntry[]
  weekTotal: number
  onEditEntry: (entry: WeekEntry) => void
}

export default function RecentView({ weekEntries, weekTotal, onEditEntry }: RecentViewProps) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>רישומים אחרונים</h3>
        <span style={{ fontWeight: 500, color: '#64748b' }}>{formatHours(weekTotal)} שעות</span>
      </div>
      {weekEntries.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {weekEntries.map((entry) => (
            <div key={entry.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0',
              borderRadius: '0.5rem', fontSize: '0.95rem',
            }}>
              <div onClick={() => onEditEntry(entry)} style={{ flex: 1, cursor: 'pointer' }}>
                <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                  {entry.projectName}
                  <span style={{ color: '#64748b', margin: '0 0.5rem' }}>›</span>
                  {entry.taskName}
                </div>
                <div style={{ color: '#64748b', fontSize: '0.85rem' }}>
                  {formatDisplayDate(entry.date)}
                  {entry.startTime && entry.endTime ? ` · ${entry.startTime} - ${entry.endTime}` : ''}
                  {' · '}{formatHours(entry.hours)} שעות
                </div>
              </div>
              <span style={{ fontWeight: 600, fontSize: '1.1rem' }}>{formatHours(entry.hours)}</span>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ color: '#64748b', textAlign: 'center' }}>אין רישומי זמן</p>
      )}
    </div>
  )
}
