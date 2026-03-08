'use client'

import React from 'react'
import type { WeekEntry } from './timingTypes'
import {
  formatLocalDate,
  formatDisplayDate,
  formatHours,
  getWeekDates,
  formatWeekRange,
  DAY_NAMES_HE,
} from '@/app/lib/dateUtils'

type WeeklyViewProps = {
  weekOffset: number
  onWeekOffsetChange: (offset: number) => void
  weekEntries: WeekEntry[]
  weekTotal: number
  onEditEntry: (entry: WeekEntry) => void
  onStartFromEntry: (entry: WeekEntry) => void
}

export default function WeeklyView({
  weekOffset, onWeekOffsetChange, weekEntries, weekTotal, onEditEntry, onStartFromEntry,
}: WeeklyViewProps) {
  const { days } = getWeekDates(weekOffset)
  const isCurrentWeek = weekOffset === 0

  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            onClick={() => onWeekOffsetChange(weekOffset - 1)}
            style={{
              padding: '0.25rem 0.5rem', background: '#f1f5f9', border: '1px solid #cbd5e1',
              borderRadius: '0.25rem', cursor: 'pointer', fontSize: '0.9rem',
            }}
          >►</button>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
            {isCurrentWeek ? 'השבוע הנוכחי' : formatWeekRange(days)}
          </h3>
          <button
            onClick={() => onWeekOffsetChange(weekOffset + 1)}
            disabled={isCurrentWeek}
            style={{
              padding: '0.25rem 0.5rem', background: '#f1f5f9', border: '1px solid #cbd5e1',
              borderRadius: '0.25rem', cursor: isCurrentWeek ? 'not-allowed' : 'pointer',
              fontSize: '0.9rem', opacity: isCurrentWeek ? 0.5 : 1,
            }}
          >◄</button>
          {!isCurrentWeek && (
            <button
              onClick={() => onWeekOffsetChange(0)}
              style={{
                padding: '0.25rem 0.5rem', background: '#dbeafe', border: '1px solid #93c5fd',
                borderRadius: '0.25rem', cursor: 'pointer', fontSize: '0.8rem', color: '#1e40af',
              }}
            >היום</button>
          )}
        </div>
        <span style={{ fontWeight: 500, color: '#64748b' }}>{formatHours(weekTotal)} שעות</span>
      </div>

      {/* Week days grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.5rem', marginBottom: '1rem' }}>
        {days.map((day, i) => {
          const dayEntries = weekEntries.filter(e => e.date === day)
          const dayTotal = dayEntries.reduce((sum, e) => sum + e.hours, 0)
          const isToday = day === formatLocalDate(new Date())
          return (
            <div key={day} style={{
              padding: '0.5rem', background: isToday ? '#dbeafe' : '#f8fafc',
              border: `1px solid ${isToday ? '#93c5fd' : '#e2e8f0'}`, borderRadius: '0.5rem', textAlign: 'center',
            }}>
              <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{DAY_NAMES_HE[i]}</div>
              <div style={{ fontSize: '1rem', fontWeight: 600 }}>{dayTotal > 0 ? formatHours(dayTotal) : '-'}</div>
            </div>
          )
        })}
      </div>

      {/* Entries list */}
      {weekEntries.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {weekEntries.map((entry) => (
            <div key={entry.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '0.75rem', background: '#f8fafc', border: '1px solid #e2e8f0',
              borderRadius: '0.5rem', fontSize: '0.9rem',
            }}>
              <div onClick={() => onEditEntry(entry)} style={{ flex: 1, cursor: 'pointer' }}>
                <span style={{ fontWeight: 500 }}>{entry.projectName}</span>
                <span style={{ color: '#64748b', margin: '0 0.5rem' }}>›</span>
                <span>{entry.taskName}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ color: '#64748b' }}>{formatDisplayDate(entry.date)}</span>
                <span style={{ fontWeight: 600 }}>{formatHours(entry.hours)}</span>
                <button
                  onClick={() => void onStartFromEntry(entry)}
                  title="התחל טיימר עם אותו פרויקט ומשימה"
                  style={{
                    padding: '0.25rem 0.5rem', fontSize: '0.8rem', background: '#ecfdf5',
                    border: '1px solid #6ee7b7', borderRadius: '0.25rem', cursor: 'pointer', color: '#059669',
                  }}
                >▶</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ color: '#64748b', textAlign: 'center' }}>אין רישומי זמן השבוע</p>
      )}
    </div>
  )
}
