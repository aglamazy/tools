'use client'

import React from 'react'
import type { UnknownName } from '@/app/services/billing/monthScan'

export type StudentForm = {
  name: string
  email: string
  lessonRate: string
}

export const emptyStudentForm: StudentForm = { name: '', email: '', lessonRate: '' }

type UnmatchedLessonsProps = {
  unknown: UnknownName[]
  creatingKey: string | null
  form: StudentForm
  formError: string
  saving: boolean
  onFormChange: (form: StudentForm) => void
  onStartCreate: (group: UnknownName) => void
  onCancel: () => void
  onSave: () => void
}

const inputStyle: React.CSSProperties = { padding: '0.3rem 0.5rem', fontSize: '0.8rem', border: '1px solid #e2e8f0', borderRadius: '0.25rem' }

/**
 * Names from the month's calendar that no student matches (aglamazo#431),
 * each with its lesson count and a one-click inline create-student form
 * prefilled with the name and the business default lesson rate.
 */
export default function UnmatchedLessons({
  unknown, creatingKey, form, formError, saving, onFormChange, onStartCreate, onCancel, onSave,
}: UnmatchedLessonsProps) {
  if (unknown.length === 0) return null

  return (
    <div style={{ padding: '1rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '0.75rem' }}>
      <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', color: '#92400e' }}>שמות שאינם משויכים לתלמיד</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {unknown.map(group => (
          <div
            key={group.key}
            style={{ padding: '0.5rem 0.75rem', background: '#fff', border: '1px solid #fde68a', borderRadius: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
              <span style={{ fontWeight: 500 }}>{group.name}</span>
              <span style={{ color: '#64748b', fontSize: '0.85rem' }}>
                {group.lessons.length === 1 ? 'שיעור אחד' : `${group.lessons.length} שיעורים`}
              </span>
            </div>
            {creatingKey === group.key ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', minWidth: '250px' }}>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => onFormChange({ ...form, name: e.target.value })}
                  style={{ ...inputStyle, direction: 'rtl' }}
                  placeholder="שם התלמיד"
                  autoFocus
                />
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <input
                    type="number"
                    value={form.lessonRate}
                    onChange={(e) => onFormChange({ ...form, lessonRate: e.target.value })}
                    style={{ ...inputStyle, width: '80px' }}
                    placeholder="מחיר"
                    min="0"
                  />
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => onFormChange({ ...form, email: e.target.value })}
                    style={{ ...inputStyle, flex: 1 }}
                    placeholder="אימייל (אופציונלי)"
                    dir="ltr"
                  />
                </div>
                {formError && (
                  <span style={{ color: '#dc2626', fontSize: '0.75rem' }}>{formError}</span>
                )}
                <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'flex-end' }}>
                  <button
                    onClick={onCancel}
                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.25rem', cursor: 'pointer', color: '#64748b' }}
                  >
                    ביטול
                  </button>
                  <button
                    onClick={onSave}
                    disabled={saving}
                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: '#f0fdf4', border: '1px solid #10b981', borderRadius: '0.25rem', cursor: saving ? 'wait' : 'pointer', color: '#059669' }}
                  >
                    שמירה
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => onStartCreate(group)}
                style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem', background: '#fffbeb', border: '1px solid #f59e0b', borderRadius: '0.375rem', cursor: 'pointer', color: '#92400e', whiteSpace: 'nowrap' }}
              >
                יצירת תלמיד
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
