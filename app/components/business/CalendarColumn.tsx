'use client'

import React from 'react'
import type { CalendarEvent } from '@/app/services/googleCalendarService'

type CalendarColumnProps = {
  events: CalendarEvent[]
  loading: boolean
  error?: string
  onEventClick?: (event: CalendarEvent) => void
  onConnectClick?: () => void
  isConnected: boolean
}

function timeToHours(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h + m / 60
}

export default function CalendarColumn({
  events,
  loading,
  error,
  onEventClick,
  onConnectClick,
  isConnected,
}: CalendarColumnProps) {
  // If not connected, show connect button
  if (!isConnected) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '0.5rem',
          minHeight: '200px',
        }}
      >
        <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>📅</div>
        <p style={{ color: '#64748b', marginBottom: '1rem', textAlign: 'center' }}>
          חבר את Google Calendar כדי לראות את האירועים שלך
        </p>
        <button
          onClick={onConnectClick}
          style={{
            padding: '0.75rem 1.5rem',
            background: '#4285f4',
            color: 'white',
            border: 'none',
            borderRadius: '0.5rem',
            cursor: 'pointer',
            fontSize: '0.95rem',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
          </svg>
          חבר לוח שנה
        </button>
      </div>
    )
  }

  // Loading state
  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '0.5rem',
          minHeight: '200px',
          color: '#64748b',
        }}
      >
        טוען אירועים...
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div
        style={{
          padding: '1rem',
          background: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '0.5rem',
          color: '#dc2626',
          textAlign: 'center',
        }}
      >
        <p style={{ marginBottom: '0.75rem' }}>{error}</p>
        <button
          onClick={onConnectClick}
          style={{
            padding: '0.5rem 1rem',
            background: '#dc2626',
            color: 'white',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: 'pointer',
            fontSize: '0.85rem',
          }}
        >
          התחבר מחדש
        </button>
      </div>
    )
  }

  // Filter events that have start and end times (not all-day events)
  const timedEvents = events.filter((e) => !e.isAllDay && e.startTime && e.endTime)
  const allDayEvents = events.filter((e) => e.isAllDay)

  // Empty state
  if (events.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '0.5rem',
          minHeight: '200px',
          color: '#64748b',
        }}
      >
        <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📅</div>
        <p>אין אירועים ביום זה</p>
      </div>
    )
  }

  // Calculate min/max hours from data, default to 8-18
  let minHour = 8
  let maxHour = 18

  timedEvents.forEach((event) => {
    const start = timeToHours(event.startTime)
    const end = timeToHours(event.endTime)
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
    <div>
      {/* All-day events */}
      {allDayEvents.length > 0 && (
        <div style={{ marginBottom: '0.75rem' }}>
          {allDayEvents.map((event) => (
            <div
              key={event.id}
              onClick={() => onEventClick?.(event)}
              style={{
                padding: '0.5rem 0.75rem',
                background: '#e0f2fe',
                border: '1px solid #7dd3fc',
                borderRadius: '0.375rem',
                marginBottom: '0.5rem',
                cursor: onEventClick ? 'pointer' : 'default',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>{event.summary}</span>
              <span style={{ color: '#0369a1', fontSize: '0.8rem' }}>כל היום</span>
            </div>
          ))}
        </div>
      )}

      {/* Timed events timeline */}
      {timedEvents.length > 0 && (
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
              background: '#f0fdf4',
              borderRadius: '0.5rem',
              border: '1px solid #bbf7d0',
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
                  background: idx === 0 ? 'transparent' : '#bbf7d0',
                }}
              />
            ))}

            {/* Event blocks */}
            {timedEvents.map((event) => {
              const start = timeToHours(event.startTime)
              const end = timeToHours(event.endTime)
              const top = (start - minHour) * HOUR_HEIGHT
              const height = (end - start) * HOUR_HEIGHT

              return (
                <div
                  key={event.id}
                  onClick={() => onEventClick?.(event)}
                  style={{
                    position: 'absolute',
                    top: `${top}px`,
                    left: '4px',
                    right: '4px',
                    height: `${Math.max(height, 40)}px`,
                    background: '#22c55e',
                    borderRadius: '0.375rem',
                    cursor: onEventClick ? 'pointer' : 'default',
                    padding: '0.5rem',
                    overflow: 'hidden',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                    transition: 'transform 0.1s, box-shadow 0.1s',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.02)'
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
                      textShadow: '0 1px 1px rgba(0,0,0,0.3)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {event.summary}
                  </div>
                  <div
                    style={{
                      color: 'rgba(255,255,255,0.9)',
                      fontSize: '0.75rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span>
                      {event.startTime} - {event.endTime}
                    </span>
                    {onEventClick && (
                      <span
                        style={{
                          background: 'rgba(255,255,255,0.2)',
                          padding: '0.125rem 0.375rem',
                          borderRadius: '0.25rem',
                          fontSize: '0.7rem',
                        }}
                      >
                        + צור רישום
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
