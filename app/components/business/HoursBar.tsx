'use client'

import React from 'react'

type TimeEntry = {
  id?: number
  startTime: string // HH:MM
  endTime: string // HH:MM
  projectName: string
  taskName: string
  projectColor: string
  hours: number
}

type HoursBarProps = {
  entries: TimeEntry[]
  onEntryClick?: (entry: TimeEntry) => void
}

function timeToHours(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h + m / 60
}

export default function HoursBar({ entries, onEntryClick }: HoursBarProps) {
  // Filter entries that have start and end times
  const timedEntries = entries.filter(e => e.startTime && e.endTime)

  if (timedEntries.length === 0) {
    return null
  }

  // Sort by start time
  const sortedEntries = [...timedEntries].sort((a, b) =>
    a.startTime.localeCompare(b.startTime)
  )

  // Calculate min/max hours from data, default to 8-16
  let minHour = 8
  let maxHour = 16

  sortedEntries.forEach(entry => {
    const start = timeToHours(entry.startTime)
    const end = timeToHours(entry.endTime)
    if (start < minHour) minHour = Math.floor(start)
    if (end > maxHour) maxHour = Math.ceil(end)
  })

  minHour = Math.max(0, minHour)
  maxHour = Math.min(24, maxHour)

  const totalHours = maxHour - minHour
  const hourLabels: number[] = []
  for (let h = minHour; h <= maxHour; h++) {
    hourLabels.push(h)
  }

  const HOUR_HEIGHT = 60 // pixels per hour

  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', direction: 'ltr' }}>
        {/* Hour labels column */}
        <div
          style={{
            width: '40px',
            flexShrink: 0,
            position: 'relative',
            height: `${totalHours * HOUR_HEIGHT}px`,
          }}
        >
          {hourLabels.map((h, idx) => (
            <div
              key={h}
              style={{
                position: 'absolute',
                top: `${idx * HOUR_HEIGHT}px`,
                right: '8px',
                fontSize: '0.75rem',
                color: '#64748b',
                transform: 'translateY(-50%)',
              }}
            >
              {h.toString().padStart(2, '0')}:00
            </div>
          ))}
        </div>

        {/* Timeline column */}
        <div
          style={{
            flex: 1,
            position: 'relative',
            height: `${totalHours * HOUR_HEIGHT}px`,
            background: '#f8fafc',
            borderRadius: '0.5rem',
            border: '1px solid #e2e8f0',
            overflow: 'hidden',
          }}
        >
          {/* Hour grid lines */}
          {hourLabels.map((h, idx) => (
            <div
              key={h}
              style={{
                position: 'absolute',
                top: `${idx * HOUR_HEIGHT}px`,
                left: 0,
                right: 0,
                height: '1px',
                background: idx === 0 ? 'transparent' : '#e2e8f0',
              }}
            />
          ))}

          {/* Task blocks */}
          {sortedEntries.map((entry, idx) => {
            const start = timeToHours(entry.startTime)
            const end = timeToHours(entry.endTime)
            const top = (start - minHour) * HOUR_HEIGHT
            const height = (end - start) * HOUR_HEIGHT

            return (
              <div
                key={entry.id || idx}
                onClick={() => onEntryClick?.(entry)}
                style={{
                  position: 'absolute',
                  top: `${top}px`,
                  left: '4px',
                  right: '4px',
                  height: `${Math.max(height, 24)}px`,
                  background: entry.projectColor,
                  borderRadius: '0.375rem',
                  cursor: onEntryClick ? 'pointer' : 'default',
                  padding: '0.5rem',
                  overflow: 'hidden',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                  transition: 'transform 0.1s, box-shadow 0.1s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.01)'
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)'
                  e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)'
                }}
              >
                <div
                  style={{
                    color: 'white',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    textShadow: '0 1px 1px rgba(0,0,0,0.5), 0 0 4px rgba(0,0,0,0.3)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {entry.projectName} › {entry.taskName}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
