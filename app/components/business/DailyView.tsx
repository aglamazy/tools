'use client'

import React from 'react'
import type { WeekEntry } from './timingTypes'
import type { CalendarEvent } from '@/app/services/googleCalendarService'
import HoursBar from './HoursBar'
import CalendarColumn from './CalendarColumn'
import {
  formatLocalDate,
  formatDisplayDate,
  getDayName,
  adjustDate,
  formatHours,
} from '@/app/lib/dateUtils'

type DailyViewProps = {
  selectedDate: string
  onDateChange: (date: string) => void
  weekEntries: WeekEntry[]
  weekTotal: number
  calendarConnected: boolean
  calendarEvents: CalendarEvent[]
  calendarLoading: boolean
  calendarError?: string
  onConnectCalendar: () => void
  onCalendarEventClick: (event: CalendarEvent) => void
  onEditEntry: (entry: WeekEntry) => void
  onStartFromEntry: (entry: WeekEntry) => void
  onEmptyClick: (hour?: number) => void
}

function EntryList({ entries, onEditEntry, onStartFromEntry }: {
  entries: WeekEntry[]
  onEditEntry: (entry: WeekEntry) => void
  onStartFromEntry: (entry: WeekEntry) => void
}) {
  const sorted = [...entries].sort((a, b) => {
    if (!a.startTime && !b.startTime) return 0
    if (!a.startTime) return 1
    if (!b.startTime) return -1
    return a.startTime.localeCompare(b.startTime)
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {sorted.map((entry) => (
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
              {entry.startTime && entry.endTime ? `${entry.startTime} - ${entry.endTime}` : formatHours(entry.hours) + ' שעות'}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontWeight: 600, fontSize: '1.1rem' }}>{formatHours(entry.hours)}</span>
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
  )
}

export default function DailyView({
  selectedDate, onDateChange, weekEntries, weekTotal,
  calendarConnected, calendarEvents, calendarLoading, calendarError,
  onConnectCalendar, onCalendarEventClick, onEditEntry, onStartFromEntry, onEmptyClick,
}: DailyViewProps) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            onClick={() => onDateChange(adjustDate(selectedDate, -1))}
            style={{
              padding: '0.5rem 0.75rem', background: '#f1f5f9', border: '1px solid #cbd5e1',
              borderRadius: '0.5rem', cursor: 'pointer', fontSize: '1rem',
            }}
            title="יום קודם"
          >→</button>
          <div style={{ position: 'relative' }}>
            <span
              onClick={() => {
                const input = document.getElementById('date-picker-input') as HTMLInputElement
                input?.showPicker()
              }}
              style={{
                padding: '0.5rem 0.75rem', border: '1px solid #cbd5e1', borderRadius: '0.5rem',
                fontSize: '0.9rem', cursor: 'pointer', display: 'inline-block', background: 'white',
              }}
            >
              {getDayName(selectedDate)} {formatDisplayDate(selectedDate)}
            </span>
            <input
              id="date-picker-input"
              type="date"
              value={selectedDate}
              onChange={(e) => onDateChange(e.target.value)}
              style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
            />
          </div>
          <button
            onClick={() => onDateChange(adjustDate(selectedDate, 1))}
            style={{
              padding: '0.5rem 0.75rem', background: '#f1f5f9', border: '1px solid #cbd5e1',
              borderRadius: '0.5rem', cursor: 'pointer', fontSize: '1rem',
            }}
            title="יום הבא"
          >←</button>
          <button
            onClick={() => onDateChange(formatLocalDate(new Date()))}
            style={{
              padding: '0.5rem 1rem', background: '#dbeafe', border: '1px solid #93c5fd',
              borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.9rem', color: '#1e40af',
            }}
          >היום</button>
          {!calendarConnected && (
            <button
              onClick={onConnectCalendar}
              style={{
                padding: '0.5rem 1rem', background: '#f0fdf4', border: '1px solid #86efac',
                borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.9rem', color: '#166534',
                display: 'flex', alignItems: 'center', gap: '0.375rem',
              }}
            ><span>📅</span>חבר יומן</button>
          )}
        </div>
        <span style={{ fontWeight: 500, color: '#64748b' }}>{formatHours(weekTotal)} שעות</span>
      </div>

      {calendarConnected ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem', fontWeight: 600, color: '#374151' }}>📅 יומן Google</h4>
            <CalendarColumn
              events={calendarEvents}
              loading={calendarLoading}
              error={calendarError}
              isConnected={calendarConnected}
              onConnectClick={onConnectCalendar}
              onEventClick={onCalendarEventClick}
            />
          </div>
          <div>
            <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem', fontWeight: 600, color: '#374151' }}>⏱️ רישומי זמן</h4>
            <HoursBar
              entries={weekEntries}
              onEntryClick={(entry) => {
                const full = weekEntries.find(e => e.id === entry.id)
                if (full) onEditEntry(full)
              }}
              onEmptyClick={(hour) => void onEmptyClick(hour)}
            />
            {weekEntries.length > 0 ? (
              <EntryList entries={weekEntries} onEditEntry={onEditEntry} onStartFromEntry={onStartFromEntry} />
            ) : (
              <div
                onClick={() => void onEmptyClick()}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  padding: '2rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.5rem',
                  minHeight: '200px', color: '#64748b', cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>⏱️</div>
                <p>אין רישומי זמן ביום זה — לחץ להוספה</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          <HoursBar
            entries={weekEntries}
            onEntryClick={(entry) => {
              const full = weekEntries.find(e => e.id === entry.id)
              if (full) onEditEntry(full)
            }}
            onEmptyClick={(hour) => void onEmptyClick(hour)}
          />
          {weekEntries.length > 0 ? (
            <EntryList entries={weekEntries} onEditEntry={onEditEntry} onStartFromEntry={onStartFromEntry} />
          ) : (
            <p
              onClick={() => void onEmptyClick()}
              style={{ color: '#64748b', textAlign: 'center', cursor: 'pointer' }}
            >אין רישומי זמן ביום זה — לחץ להוספה</p>
          )}
        </>
      )}
    </div>
  )
}
