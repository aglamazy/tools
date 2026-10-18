'use client'

import React, { useEffect, useState } from 'react'
import { studentStore } from '@/app/stores/studentStore'
import type { Student } from '@/app/types/student'
import { studentInvoiceBlocker } from '@/app/services/billing/studentBillingContact'

type StudentsTabProps = {
  businessId: string
}

type StudentForm = {
  name: string
  email: string
  lessonRate: string
  contactBusinessID: string
  contactPhone: string
}

const emptyForm: StudentForm = { name: '', email: '', lessonRate: '', contactBusinessID: '', contactPhone: '' }

const inputStyle: React.CSSProperties = { width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #e2e8f0', fontSize: '0.95rem' }
const labelStyle: React.CSSProperties = { display: 'block', marginBottom: '0.25rem', fontWeight: 600, fontSize: '0.9rem' }

export default function StudentsTab({ businessId }: StudentsTabProps) {
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<StudentForm>(emptyForm)
  const [error, setError] = useState('')

  useEffect(() => {
    loadStudents()
  }, [businessId])

  const loadStudents = async () => {
    const all = await studentStore.getByBusinessId(businessId)
    setStudents(all.filter(s => !s.archived).sort((a, b) => a.name.localeCompare(b.name, 'he')))
    setLoading(false)
  }

  const handleAdd = () => {
    setForm(emptyForm)
    setEditingId(null)
    setShowForm(true)
    setError('')
  }

  const handleEdit = (student: Student) => {
    setForm({
      name: student.name,
      email: student.email || '',
      lessonRate: String(student.lessonRate),
      contactBusinessID: student.contactBusinessID || '',
      contactPhone: student.contactPhone || '',
    })
    setEditingId(student.id!)
    setShowForm(true)
    setError('')
  }

  const handleSave = async () => {
    if (!form.name.trim()) {
      setError('שם התלמיד נדרש')
      return
    }
    const rate = Number(form.lessonRate)
    if (!rate || rate <= 0) {
      setError('מחיר שיעור נדרש')
      return
    }

    const email = form.email.trim()
    const contactBusinessID = form.contactBusinessID.trim()
    const contactPhone = form.contactPhone.trim()

    try {
      if (editingId) {
        // Strings only — never undefined: Dexie update({k: undefined}) deletes k.
        // A cleared field is saved as '' (same as a Project's contact fields).
        await studentStore.update(editingId, {
          name: form.name.trim(),
          email,
          lessonRate: rate,
          contactBusinessID,
          contactPhone,
        })
      } else {
        await studentStore.add({
          businessId,
          name: form.name.trim(),
          lessonRate: rate,
          ...(email ? { email } : {}),
          ...(contactBusinessID ? { contactBusinessID } : {}),
          ...(contactPhone ? { contactPhone } : {}),
        })
      }
      setShowForm(false)
      setEditingId(null)
      setForm(emptyForm)
      setError('')
      await loadStudents()
    } catch (err) {
      console.error('Error saving student:', err)
      setError('שגיאה בשמירת תלמיד')
    }
  }

  const handleArchive = async (id: number) => {
    await studentStore.archive(id)
    await loadStudents()
  }

  if (loading) {
    return <p>טוען...</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: '1.1rem' }}>תלמידים</h2>
        <button onClick={handleAdd} className="file-picker">
          + הוסף תלמיד
        </button>
      </div>

      {error && (
        <div style={{ padding: '0.75rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', color: '#dc2626' }}>
          {error}
        </div>
      )}

      {showForm && (
        <div style={{ padding: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.75rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600, fontSize: '0.9rem' }}>שם התלמיד</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #e2e8f0', fontSize: '0.95rem', direction: 'rtl' }}
                placeholder="לדוגמה: משה לוי"
                autoFocus
              />
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600, fontSize: '0.9rem' }}>מחיר שיעור (₪)</label>
                <input
                  type="number"
                  value={form.lessonRate}
                  onChange={(e) => setForm({ ...form, lessonRate: e.target.value })}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #e2e8f0', fontSize: '0.95rem' }}
                  placeholder="150"
                  min="0"
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>אימייל המשלם (נדרש להפקת חשבונית)</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #e2e8f0', fontSize: '0.95rem' }}
                  placeholder="email@example.com"
                  dir="ltr"
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>ח.פ / ת.ז (אופציונלי)</label>
                <input
                  type="text"
                  value={form.contactBusinessID}
                  onChange={(e) => setForm({ ...form, contactBusinessID: e.target.value })}
                  style={inputStyle}
                  placeholder="123456789"
                  dir="ltr"
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>טלפון (אופציונלי)</label>
                <input
                  type="tel"
                  value={form.contactPhone}
                  onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
                  style={inputStyle}
                  placeholder="050-1234567"
                  dir="ltr"
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setShowForm(false); setEditingId(null); setError('') }}
                className="upload-another-btn"
              >
                ביטול
              </button>
              <button onClick={handleSave} className="file-picker">
                שמור
              </button>
            </div>
          </div>
        </div>
      )}

      {students.length === 0 && !showForm && (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: '0.75rem', border: '1px dashed #cbd5e1' }}>
          <p>אין תלמידים. הוסף תלמיד חדש כדי להתחיל.</p>
        </div>
      )}

      {students.map((student) => (
        <div
          key={student.id}
          style={{ padding: '0.75rem 1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ fontWeight: 600 }}>{student.name}</span>
            <span style={{ color: '#059669', fontSize: '0.9rem' }}>₪{student.lessonRate}</span>
            {student.email && (
              <span style={{ color: '#64748b', fontSize: '0.85rem' }}>{student.email}</span>
            )}
            {student.contactPhone && (
              <span style={{ color: '#64748b', fontSize: '0.85rem' }} dir="ltr">{student.contactPhone}</span>
            )}
            {student.contactBusinessID && (
              <span style={{ color: '#64748b', fontSize: '0.85rem' }}>ח.פ {student.contactBusinessID}</span>
            )}
            {studentInvoiceBlocker(student) && (
              <button
                onClick={() => handleEdit(student)}
                style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '0.375rem', cursor: 'pointer', color: '#92400e' }}
              >
                ⚠ {studentInvoiceBlocker(student)} — הוספת אימייל
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => handleEdit(student)}
              style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem', background: 'transparent', border: '1px solid #cbd5e1', borderRadius: '0.375rem', cursor: 'pointer', color: '#475569' }}
            >
              ערוך
            </button>
            <button
              onClick={() => handleArchive(student.id!)}
              style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem', background: 'transparent', border: '1px solid #fecaca', borderRadius: '0.375rem', cursor: 'pointer', color: '#dc2626' }}
            >
              ארכיון
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
