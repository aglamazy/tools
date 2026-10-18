'use client'

import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { studentStore } from '@/app/stores/studentStore'
import { hasCalendarAccess, requestCalendarAccess, fetchMonthEvents, type CalendarEvent } from '@/app/services/googleCalendarService'
import { businessStore } from '@/app/stores/businessStore'
import type { Student } from '@/app/types/student'
import { studentInvoiceBlocker } from '@/app/services/billing/studentBillingContact'
import { scanMonth, type UnknownName } from '@/app/services/billing/monthScan'
import { getPrefilledLessonRate } from '@/app/utils/studentDefaults'
import UnmatchedLessons, { emptyStudentForm, type StudentForm } from './UnmatchedLessons'
import CustomerInvoices from './CustomerInvoices'

type AccountingTabProps = {
  businessId: string
}

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

function formatMonthLabel(year: number, month: number): string {
  const months = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']
  return `${months[month - 1]} ${year}`
}

export default function AccountingTab({ businessId }: AccountingTabProps) {
  const prev = getPreviousMonth()
  const [year, setYear] = useState(prev.year)
  const [month, setMonth] = useState(prev.month)
  const [monthEvents, setMonthEvents] = useState<CalendarEvent[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(false)
  const [calendarConnected, setCalendarConnected] = useState(false)
  const [error, setError] = useState('')
  const [creatingKey, setCreatingKey] = useState<string | null>(null)
  const [form, setForm] = useState<StudentForm>(emptyStudentForm)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    hasCalendarAccess().then(setCalendarConnected)
  }, [])

  const loadStudents = useCallback(async () => {
    return await studentStore.getActiveByBusinessId(businessId)
  }, [businessId])

  // The month's lessons matched to students by name. Re-runs whenever the students change,
  // so a student created from an unknown name takes its lessons in place — aglamazo#431
  const scan = useMemo(() => scanMonth(monthEvents, students), [monthEvents, students])

  const loadEvents = useCallback(async () => {
    if (!(await hasCalendarAccess())) return

    setLoading(true)
    setError('')
    try {
      const activeStudents = await loadStudents()
      setStudents(activeStudents)

      // One ranged read of the business's chosen billing calendar ('primary' when unset) — aglamazo#430
      const business = await businessStore.getBySyncId(businessId)
      const result = await fetchMonthEvents(year, month, business?.billingCalendarId)
      if (result.error) {
        setError(result.error)
        setLoading(false)
        return
      }
      setMonthEvents(result.events)
    } catch (err) {
      console.error('Error loading calendar events:', err)
      setError('שגיאה בטעינת אירועים מלוח שנה')
    }
    setLoading(false)
  }, [year, month, loadStudents, businessId])

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

  const handleStartCreate = async (group: UnknownName) => {
    setForm({ name: group.name, email: '', lessonRate: '' })
    setCreatingKey(group.key)
    setFormError('')
    const lessonRate = await getPrefilledLessonRate(businessId)
    // Only fill the rate if the teacher has not started typing one meanwhile.
    setForm(f => (f.lessonRate === '' ? { ...f, lessonRate } : f))
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

    setSaving(true)
    try {
      const email = form.email.trim()
      const newId = await studentStore.add({
        businessId,
        name: form.name.trim(),
        ...(email ? { email } : {}),
        lessonRate: rate,
      })
      // studentStore.add logs and returns null on a failed write — show it, never treat it as saved.
      if (newId === null) throw new Error('studentStore.add returned null')
      setCreatingKey(null)
      setForm(emptyStudentForm)
      setFormError('')
      // Re-match the month already in hand: the new student's lessons move onto it in place.
      setStudents(await loadStudents())
    } catch (err) {
      console.error('Error creating student:', err)
      setFormError('שגיאה ביצירת תלמיד')
    }
    setSaving(false)
  }

  const handleCancelCreate = () => {
    setCreatingKey(null)
    setFormError('')
  }

  // Summary per student: lesson count × the student's rate
  const summary = scan.matched.map(({ student, lessons }) => ({
    student,
    lessons: lessons.length,
    total: lessons.length * student.lessonRate,
  }))

  const grandTotal = summary.reduce((sum, s) => sum + s.total, 0)
  const matchedCount = summary.reduce((sum, s) => sum + s.lessons, 0)
  const unmatchedCount = scan.lessons.length - matchedCount

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
          {scan.lessons.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: '0.75rem', border: '1px dashed #cbd5e1' }}>
              <p>אין אירועים בחודש זה</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {scan.lessons.map((lesson) => (
                <div
                  key={`${lesson.eventId}-${lesson.date}`}
                  style={{
                    padding: '0.6rem 1rem',
                    background: lesson.student ? '#f0fdf4' : '#fffbeb',
                    border: `1px solid ${lesson.student ? '#bbf7d0' : '#fde68a'}`,
                    borderRadius: '0.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                  }}
                >
                  <span style={{ color: '#64748b', fontSize: '0.85rem', minWidth: '80px' }}>
                    {lesson.date.split('-').reverse().join('/')}
                  </span>
                  <span style={{ color: '#64748b', fontSize: '0.85rem', minWidth: '50px' }}>
                    {lesson.startTime}
                  </span>
                  <span style={{ fontWeight: 500 }}>{lesson.title}</span>
                  {lesson.student && (
                    <span style={{ color: '#059669', fontSize: '0.85rem' }}>
                      ← {lesson.student.name} (₪{lesson.student.lessonRate})
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Unknown names → one-click create-student (aglamazo#431) */}
          <UnmatchedLessons
            unknown={scan.unknown}
            creatingKey={creatingKey}
            form={form}
            formError={formError}
            saving={saving}
            onFormChange={setForm}
            onStartCreate={(group) => void handleStartCreate(group)}
            onCancel={handleCancelCreate}
            onSave={() => void handleSaveStudent()}
          />

          {/* Monthly summary */}
          {summary.length > 0 && (
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
                  {[...summary]
                    .sort((a, b) => a.student.name.localeCompare(b.student.name, 'he'))
                    .map(({ student, lessons, total }) => (
                      <tr key={student.syncId ?? student.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '0.5rem', fontWeight: 500 }}>
                          {student.name}
                          {studentInvoiceBlocker(student) && (
                            <div style={{ fontSize: '0.8rem', fontWeight: 400, color: '#92400e' }}>
                              ⚠ {studentInvoiceBlocker(student)} (בלשונית תלמידים)
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '0.5rem', textAlign: 'center' }}>{lessons}</td>
                        <td style={{ padding: '0.5rem', textAlign: 'center' }}>₪{student.lessonRate}</td>
                        <td style={{ padding: '0.5rem', textAlign: 'left', fontWeight: 600 }}>₪{total.toLocaleString()}</td>
                      </tr>
                    ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid #e2e8f0' }}>
                    <td style={{ padding: '0.5rem', fontWeight: 700 }}>סה"כ</td>
                    <td style={{ padding: '0.5rem', textAlign: 'center', fontWeight: 600 }}>{matchedCount}</td>
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

          {/* One invoice per paying customer (email), one line per student — aglamazo#432 */}
          <CustomerInvoices businessId={businessId} matched={scan.matched} year={year} month={month} />
        </>
      )}
    </div>
  )
}
