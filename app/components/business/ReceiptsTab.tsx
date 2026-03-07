'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { studentStore } from '@/app/stores/studentStore'
import { receiptStore } from '@/app/stores/receiptStore'
import { hasCalendarAccess, requestCalendarAccess, fetchCalendarEvents } from '@/app/services/googleCalendarService'
import type { Student } from '@/app/types/student'
import type { Receipt } from '@/app/types/receipt'

type ReceiptsTabProps = {
  businessId: number
}

function getDefaultDateRange(lastReceipt: Receipt | undefined): { start: string; end: string } {
  const now = new Date()
  let endYear = now.getFullYear()
  let endMonth = now.getMonth() // 0-based, current month
  // End of previous month
  if (endMonth === 0) {
    endMonth = 12
    endYear -= 1
  }
  // endMonth is now 1-based previous month
  const endDay = new Date(endYear, endMonth, 0).getDate()
  const end = `${endYear}-${String(endMonth).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`

  let start: string
  if (lastReceipt) {
    // Day after last receipt's periodEnd
    const lastEnd = new Date(lastReceipt.periodEnd)
    lastEnd.setDate(lastEnd.getDate() + 1)
    start = lastEnd.toISOString().split('T')[0]
  } else {
    // Start of previous month
    start = `${endYear}-${String(endMonth).padStart(2, '0')}-01`
  }

  return { start, end }
}

function getDaysInRange(start: string, end: string): string[] {
  const days: string[] = []
  const current = new Date(start)
  const endDate = new Date(end)
  while (current <= endDate) {
    days.push(current.toISOString().split('T')[0])
    current.setDate(current.getDate() + 1)
  }
  return days
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

export default function ReceiptsTab({ businessId }: ReceiptsTabProps) {
  const [students, setStudents] = useState<Student[]>([])
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null)
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [lessonCount, setLessonCount] = useState(0)
  const [nextReceiptNumber, setNextReceiptNumber] = useState(1)
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [loading, setLoading] = useState(false)
  const [countingLessons, setCountingLessons] = useState(false)
  const [calendarConnected, setCalendarConnected] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    setCalendarConnected(hasCalendarAccess())
  }, [])

  useEffect(() => {
    const loadStudents = async () => {
      const active = await studentStore.getActiveByBusinessId(businessId)
      setStudents(active)
    }
    void loadStudents()
  }, [businessId])

  const loadReceipts = useCallback(async (studentId: number) => {
    const all = await receiptStore.getByStudentId(studentId)
    setReceipts(all.sort((a, b) => b.periodEnd.localeCompare(a.periodEnd)))
  }, [])

  const countLessons = useCallback(async (studentName: string, start: string, end: string) => {
    if (!hasCalendarAccess()) return 0
    setCountingLessons(true)
    try {
      const days = getDaysInRange(start, end)
      let count = 0
      for (const day of days) {
        const result = await fetchCalendarEvents(day)
        if (result.error) {
          setError(result.error)
          setCountingLessons(false)
          return 0
        }
        for (const event of result.events) {
          if (event.isAllDay) continue
          const eventName = event.summary.trim().toLowerCase()
          const sName = studentName.trim().toLowerCase()
          if (eventName.includes(sName) || sName.includes(eventName)) {
            count++
          }
        }
      }
      setCountingLessons(false)
      return count
    } catch (err) {
      console.error('Error counting lessons:', err)
      setCountingLessons(false)
      return 0
    }
  }, [])

  const handleStudentSelect = useCallback(async (studentId: number) => {
    setSelectedStudentId(studentId)
    setError('')
    setSuccess('')
    setLoading(true)

    const lastReceipt = await receiptStore.getLastByStudentId(studentId)
    const { start, end } = getDefaultDateRange(lastReceipt)
    setPeriodStart(start)
    setPeriodEnd(end)

    const nextNum = await receiptStore.getNextReceiptNumber(businessId)
    setNextReceiptNumber(nextNum)

    await loadReceipts(studentId)

    const student = students.find(s => s.id === studentId)
    if (student && hasCalendarAccess()) {
      const count = await countLessons(student.name, start, end)
      setLessonCount(count)
    } else {
      setLessonCount(0)
    }

    setLoading(false)
  }, [businessId, students, loadReceipts, countLessons])

  const handleDateChange = useCallback(async (newStart: string, newEnd: string) => {
    setPeriodStart(newStart)
    setPeriodEnd(newEnd)
    const student = students.find(s => s.id === selectedStudentId)
    if (student && hasCalendarAccess() && newStart && newEnd) {
      const count = await countLessons(student.name, newStart, newEnd)
      setLessonCount(count)
    }
  }, [students, selectedStudentId, countLessons])

  const handleConnect = async () => {
    const result = await requestCalendarAccess()
    if (result.success) {
      setCalendarConnected(true)
    } else {
      setError(result.error || 'שגיאה בחיבור ללוח שנה')
    }
  }

  const handleCreateReceipt = async () => {
    if (!selectedStudentId) return
    const student = students.find(s => s.id === selectedStudentId)
    if (!student) return

    setError('')
    setSuccess('')

    const totalAmount = lessonCount * student.lessonRate

    const id = await receiptStore.add({
      businessId,
      studentId: selectedStudentId,
      receiptNumber: nextReceiptNumber,
      periodStart,
      periodEnd,
      lessonCount,
      lessonRate: student.lessonRate,
      totalAmount,
    })

    if (id) {
      setSuccess('קבלה נוצרה בהצלחה')
      setNextReceiptNumber(nextReceiptNumber + 1)
      await loadReceipts(selectedStudentId)
    } else {
      setError('שגיאה ביצירת קבלה')
    }
  }

  const selectedStudent = students.find(s => s.id === selectedStudentId)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Calendar connection */}
      {!calendarConnected && (
        <div style={{ padding: '1rem', textAlign: 'center', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '0.5rem' }}>
          <p style={{ color: '#92400e', marginBottom: '0.5rem' }}>חבר את לוח השנה של Google כדי לספור שיעורים</p>
          <button onClick={handleConnect} className="file-picker">
            התחבר ללוח שנה
          </button>
        </div>
      )}

      {/* Student selector */}
      <div>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem' }}>בחר תלמיד</label>
        <select
          value={selectedStudentId ?? ''}
          onChange={(e) => {
            const val = Number(e.target.value)
            if (val) void handleStudentSelect(val)
          }}
          style={{
            width: '100%',
            padding: '0.5rem',
            border: '1px solid #e2e8f0',
            borderRadius: '0.375rem',
            fontSize: '1rem',
            direction: 'rtl',
          }}
          data-testid="student-selector"
        >
          <option value="">-- בחר תלמיד --</option>
          {students.map(s => (
            <option key={s.id} value={s.id}>{s.name} (₪{s.lessonRate}/שיעור)</option>
          ))}
        </select>
      </div>

      {selectedStudent && !loading && (
        <>
          {/* Date range */}
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#64748b', marginBottom: '0.25rem' }}>מתאריך</label>
              <input
                type="date"
                value={periodStart}
                onChange={(e) => void handleDateChange(e.target.value, periodEnd)}
                style={{ padding: '0.4rem', border: '1px solid #e2e8f0', borderRadius: '0.375rem' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#64748b', marginBottom: '0.25rem' }}>עד תאריך</label>
              <input
                type="date"
                value={periodEnd}
                onChange={(e) => void handleDateChange(periodStart, e.target.value)}
                style={{ padding: '0.4rem', border: '1px solid #e2e8f0', borderRadius: '0.375rem' }}
              />
            </div>
            {countingLessons && (
              <span style={{ color: '#64748b', fontSize: '0.85rem', alignSelf: 'flex-end' }}>סופר שיעורים...</span>
            )}
          </div>

          {/* Summary card */}
          <div style={{
            padding: '1rem',
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: '0.75rem',
          }}>
            <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem' }}>סיכום קבלה</h3>
            <table style={{ width: '100%', fontSize: '0.95rem' }}>
              <tbody>
                <tr>
                  <td style={{ padding: '0.3rem 0', fontWeight: 500, color: '#64748b' }}>תלמיד</td>
                  <td style={{ padding: '0.3rem 0', fontWeight: 600 }}>{selectedStudent.name}</td>
                </tr>
                <tr>
                  <td style={{ padding: '0.3rem 0', fontWeight: 500, color: '#64748b' }}>תקופה</td>
                  <td style={{ padding: '0.3rem 0' }}>{formatDate(periodStart)} — {formatDate(periodEnd)}</td>
                </tr>
                <tr>
                  <td style={{ padding: '0.3rem 0', fontWeight: 500, color: '#64748b' }}>שיעורים</td>
                  <td style={{ padding: '0.3rem 0' }}>{lessonCount}</td>
                </tr>
                <tr>
                  <td style={{ padding: '0.3rem 0', fontWeight: 500, color: '#64748b' }}>מחיר לשיעור</td>
                  <td style={{ padding: '0.3rem 0' }}>₪{selectedStudent.lessonRate}</td>
                </tr>
                <tr style={{ borderTop: '2px solid #bbf7d0' }}>
                  <td style={{ padding: '0.5rem 0 0.3rem', fontWeight: 700 }}>סה"כ</td>
                  <td style={{ padding: '0.5rem 0 0.3rem', fontWeight: 700, color: '#059669', fontSize: '1.1rem' }}>
                    ₪{(lessonCount * selectedStudent.lessonRate).toLocaleString()}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '0.3rem 0', fontWeight: 500, color: '#64748b' }}>מספר קבלה</td>
                  <td style={{ padding: '0.3rem 0' }}>{nextReceiptNumber}</td>
                </tr>
              </tbody>
            </table>

            <button
              onClick={handleCreateReceipt}
              disabled={lessonCount === 0}
              style={{
                marginTop: '1rem',
                padding: '0.6rem 1.5rem',
                background: lessonCount > 0 ? '#059669' : '#94a3b8',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                fontSize: '1rem',
                fontWeight: 600,
                cursor: lessonCount > 0 ? 'pointer' : 'not-allowed',
                width: '100%',
              }}
            >
              צור קבלה
            </button>
          </div>

          {error && (
            <div style={{ padding: '0.75rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', color: '#dc2626' }}>
              {error}
            </div>
          )}

          {success && (
            <div style={{ padding: '0.75rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '0.5rem', color: '#059669' }}>
              {success}
            </div>
          )}

          {/* Receipt history */}
          {receipts.length > 0 && (
            <div style={{ marginTop: '0.5rem' }}>
              <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem' }}>היסטוריית קבלות</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {receipts.map((r) => (
                  <div
                    key={r.id}
                    style={{
                      padding: '0.6rem 1rem',
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '0.5rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '0.5rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <span style={{ fontWeight: 600, color: '#334155' }}>#{r.receiptNumber}</span>
                      <span style={{ color: '#64748b', fontSize: '0.85rem' }}>
                        {formatDate(r.periodStart)} — {formatDate(r.periodEnd)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <span style={{ fontSize: '0.85rem', color: '#64748b' }}>{r.lessonCount} שיעורים</span>
                      <span style={{ fontWeight: 600, color: '#059669' }}>₪{r.totalAmount.toLocaleString()}</span>
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                        {new Date(r.createdAt).toLocaleDateString('he-IL')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {loading && (
        <p style={{ textAlign: 'center', color: '#64748b' }}>טוען...</p>
      )}
    </div>
  )
}
