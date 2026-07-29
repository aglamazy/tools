'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { studentStore } from '@/app/stores/studentStore'
import { hasCalendarAccess, requestCalendarAccess, fetchCalendarEvents, type CalendarEvent } from '@/app/services/googleCalendarService'
import type { Student } from '@/app/types/student'

type AccountingTabProps = {
  businessId: string
}

type MatchedEvent = CalendarEvent & {
  date: string // YYYY-MM-DD
  student?: Student
}

type StudentForm = {
  name: string
  email: string
  lessonRate: string
}

const emptyForm: StudentForm = { name: '', email: '', lessonRate: '' }

function getPreviousMonth(): { year: number; month: number } {
  const now = new Date()
  let month = now.getMonth() // 0-based
  let year = now.getFullYear()
  if (month === 0) {
    month = 12
    year -= 1
  }
  return { year, month } // month is 1-based now
}

function getDaysInMonth(year: number, month: number): string[] {
  const days: string[] = []
  const daysCount = new Date(year, month, 0).getDate()
  for (let d = 1; d <= daysCount; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    days.push(dateStr)
  }
  return days
}

function formatMonthLabel(year: number, month: number): string {
  const months = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']
  return `${months[month - 1]} ${year}`
}

export default function AccountingTab({ businessId }: AccountingTabProps) {
  const prev = getPreviousMonth()
  const [year, setYear] = useState(prev.year)
  const [month, setMonth] = useState(prev.month)
  const [events, setEvents] = useState<MatchedEvent[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(false)
  const [calendarConnected, setCalendarConnected] = useState(false)
  const [error, setError] = useState('')
  const [creatingForEvent, setCreatingForEvent] = useState<string | null>(null)
  const [form, setForm] = useState<StudentForm>(emptyForm)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    hasCalendarAccess().then(setCalendarConnected)
  }, [])

  const loadStudents = useCallback(async () => {
    return await studentStore.getActiveByBusinessId(businessId)
  }, [businessId])

  const matchEvents = useCallback((allEvents: CalendarEvent[], allStudents: Student[], days: string[]): MatchedEvent[] => {
    const matched: MatchedEvent[] = []
    // Group events by day
    for (let i = 0; i < days.length; i++) {
      const dayEvents = allEvents.filter((_, idx) => {
        // Events are batched per day in order
        return true // We pass them already tagged
      })
    }
    // Actually we receive events already tagged with date
    return allEvents.map(event => {
      const eventDate = event.start.split('T')[0]
      const student = allStudents.find(s => {
        const eventName = event.summary.trim().toLowerCase()
        const studentName = s.name.trim().toLowerCase()
        return eventName.includes(studentName) || studentName.includes(eventName)
      })
      return { ...event, date: eventDate, student }
    })
  }, [])

  const loadEvents = useCallback(async () => {
    if (!(await hasCalendarAccess())) return

    setLoading(true)
    setError('')
    try {
      const activeStudents = await loadStudents()
      setStudents(activeStudents)

      const days = getDaysInMonth(year, month)
      const allEvents: MatchedEvent[] = []

      // Fetch events for each day of the month
      for (const day of days) {
        const result = await fetchCalendarEvents(day)
        if (result.error) {
          setError(result.error)
          setLoading(false)
          return
        }
        for (const event of result.events) {
          if (event.isAllDay) continue // Skip all-day events
          const student = activeStudents.find(s => {
            const eventName = event.summary.trim().toLowerCase()
            const studentName = s.name.trim().toLowerCase()
            return eventName.includes(studentName) || studentName.includes(eventName)
          })
          allEvents.push({ ...event, date: day, student })
        }
      }

      setEvents(allEvents)
    } catch (err) {
      console.error('Error loading calendar events:', err)
      setError('שגיאה בטעינת אירועים מלוח שנה')
    }
    setLoading(false)
  }, [year, month, loadStudents])

  useEffect(() => {
    if (calendarConnected) {
      void loadEvents()
    }
  }, [calendarConnected, year, month, loadEvents])

  const handleConnect = async () => {
    const result = await requestCalendarAccess()
    if (result.success) {
      setCalendarConnected(true)
    } else {
      setError(result.error || 'שגיאה בחיבור ללוח שנה')
    }
  }

  const handlePrevMonth = () => {
    if (month === 1) {
      setMonth(12)
      setYear(year - 1)
    } else {
      setMonth(month - 1)
    }
  }

  const handleNextMonth = () => {
    if (month === 12) {
      setMonth(1)
      setYear(year + 1)
    } else {
      setMonth(month + 1)
    }
  }

  const handleCreateStudent = (eventSummary: string, eventId: string) => {
    setForm({ name: eventSummary, email: '', lessonRate: '' })
    setCreatingForEvent(eventId)
    setFormError('')
  }

  const handleSaveStudent = async () => {
    if (!form.name.trim()) {
      setFormError('שם התלמיד נדרש')
      return
    }
    const rate = Number(form.lessonRate)
    if (!rate || rate <= 0) {
      setFormError('מחיר שיעור נדרש')
      return
    }

    try {
      await studentStore.add({
        businessId,
        name: form.name.trim(),
        email: form.email.trim() || undefined,
        lessonRate: rate,
      })
      setCreatingForEvent(null)
      setForm(emptyForm)
      setFormError('')
      // Refresh to re-match events
      await loadEvents()
    } catch (err) {
      console.error('Error creating student:', err)
      setFormError('שגיאה ביצירת תלמיד')
    }
  }

  // Calculate summary per student
  const summary = events.reduce((acc, event) => {
    if (!event.student) return acc
    const id = event.student.id!
    if (!acc[id]) {
      acc[id] = { student: event.student, lessons: 0, total: 0 }
    }
    acc[id].lessons += 1
    acc[id].total = acc[id].lessons * event.student.lessonRate
    return acc
  }, {} as Record<number, { student: Student; lessons: number; total: number }>)

  const grandTotal = Object.values(summary).reduce((sum, s) => sum + s.total, 0)
  const unmatchedCount = events.filter(e => !e.student).length

  if (!calendarConnected) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p style={{ color: '#64748b', marginBottom: '1rem' }}>חבר את לוח השנה של Google כדי לראות שיעורים</p>
        <button onClick={handleConnect} className="file-picker">
          התחבר ללוח שנה
        </button>
        {error && (
          <p style={{ color: '#dc2626', marginTop: '0.75rem', fontSize: '0.9rem' }}>{error}</p>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Month selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', justifyContent: 'center' }}>
        <button
          onClick={handlePrevMonth}
          style={{ padding: '0.4rem 0.8rem', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '1rem' }}
        >
          ◀
        </button>
        <span style={{ fontWeight: 600, fontSize: '1.1rem', minWidth: '150px', textAlign: 'center' }}>
          {formatMonthLabel(year, month)}
        </span>
        <button
          onClick={handleNextMonth}
          style={{ padding: '0.4rem 0.8rem', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '1rem' }}
        >
          ▶
        </button>
      </div>

      {error && (
        <div style={{ padding: '0.75rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', color: '#dc2626' }}>
          {error}
        </div>
      )}

      {loading ? (
        <p style={{ textAlign: 'center', color: '#64748b' }}>טוען אירועים...</p>
      ) : (
        <>
          {/* Events list */}
          {events.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: '0.75rem', border: '1px dashed #cbd5e1' }}>
              <p>אין אירועים בחודש זה</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {events.map((event) => (
                <div
                  key={`${event.id}-${event.date}`}
                  style={{
                    padding: '0.6rem 1rem',
                    background: event.student ? '#f0fdf4' : '#fffbeb',
                    border: `1px solid ${event.student ? '#bbf7d0' : '#fde68a'}`,
                    borderRadius: '0.5rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ color: '#64748b', fontSize: '0.85rem', minWidth: '80px' }}>
                      {event.date.split('-').reverse().join('/')}
                    </span>
                    <span style={{ color: '#64748b', fontSize: '0.85rem', minWidth: '50px' }}>
                      {event.startTime}
                    </span>
                    <span style={{ fontWeight: 500 }}>{event.summary}</span>
                    {event.student && (
                      <span style={{ color: '#059669', fontSize: '0.85rem' }}>
                        ← {event.student.name} (₪{event.student.lessonRate})
                      </span>
                    )}
                  </div>
                  {!event.student && (
                    creatingForEvent === event.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', minWidth: '250px' }}>
                        <input
                          type="text"
                          value={form.name}
                          onChange={(e) => setForm({ ...form, name: e.target.value })}
                          style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem', border: '1px solid #e2e8f0', borderRadius: '0.25rem', direction: 'rtl' }}
                          placeholder="שם התלמיד"
                          autoFocus
                        />
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <input
                            type="number"
                            value={form.lessonRate}
                            onChange={(e) => setForm({ ...form, lessonRate: e.target.value })}
                            style={{ width: '80px', padding: '0.3rem 0.5rem', fontSize: '0.8rem', border: '1px solid #e2e8f0', borderRadius: '0.25rem' }}
                            placeholder="מחיר"
                            min="0"
                          />
                          <input
                            type="email"
                            value={form.email}
                            onChange={(e) => setForm({ ...form, email: e.target.value })}
                            style={{ flex: 1, padding: '0.3rem 0.5rem', fontSize: '0.8rem', border: '1px solid #e2e8f0', borderRadius: '0.25rem' }}
                            placeholder="אימייל (אופציונלי)"
                            dir="ltr"
                          />
                        </div>
                        {formError && (
                          <span style={{ color: '#dc2626', fontSize: '0.75rem' }}>{formError}</span>
                        )}
                        <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => { setCreatingForEvent(null); setFormError('') }}
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.25rem', cursor: 'pointer', color: '#64748b' }}
                          >
                            ביטול
                          </button>
                          <button
                            onClick={handleSaveStudent}
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: '#f0fdf4', border: '1px solid #10b981', borderRadius: '0.25rem', cursor: 'pointer', color: '#059669' }}
                          >
                            שמור
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleCreateStudent(event.summary, event.id)}
                        style={{
                          padding: '0.3rem 0.6rem',
                          fontSize: '0.8rem',
                          background: '#fffbeb',
                          border: '1px solid #f59e0b',
                          borderRadius: '0.375rem',
                          cursor: 'pointer',
                          color: '#92400e',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        צור תלמיד
                      </button>
                    )
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Monthly summary */}
          {Object.keys(summary).length > 0 && (
            <div style={{ marginTop: '1rem', padding: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.75rem' }}>
              <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem' }}>סיכום חודשי</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                    <th style={{ padding: '0.5rem', textAlign: 'right' }}>תלמיד</th>
                    <th style={{ padding: '0.5rem', textAlign: 'center' }}>שיעורים</th>
                    <th style={{ padding: '0.5rem', textAlign: 'center' }}>מחיר לשיעור</th>
                    <th style={{ padding: '0.5rem', textAlign: 'left' }}>סה"כ</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.values(summary)
                    .sort((a, b) => a.student.name.localeCompare(b.student.name, 'he'))
                    .map(({ student, lessons, total }) => (
                      <tr key={student.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '0.5rem', fontWeight: 500 }}>{student.name}</td>
                        <td style={{ padding: '0.5rem', textAlign: 'center' }}>{lessons}</td>
                        <td style={{ padding: '0.5rem', textAlign: 'center' }}>₪{student.lessonRate}</td>
                        <td style={{ padding: '0.5rem', textAlign: 'left', fontWeight: 600 }}>₪{total.toLocaleString()}</td>
                      </tr>
                    ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid #e2e8f0' }}>
                    <td style={{ padding: '0.5rem', fontWeight: 700 }}>סה"כ</td>
                    <td style={{ padding: '0.5rem', textAlign: 'center', fontWeight: 600 }}>{events.filter(e => e.student).length}</td>
                    <td></td>
                    <td style={{ padding: '0.5rem', textAlign: 'left', fontWeight: 700, color: '#059669' }}>₪{grandTotal.toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
              {unmatchedCount > 0 && (
                <p style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#92400e' }}>
                  {unmatchedCount} אירועים לא משויכים לתלמידים
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
