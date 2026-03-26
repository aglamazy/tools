'use client'

import { useState, useEffect } from 'react'
import Modal from '@/app/components/Modal'
import { taskSubjectStore } from '@/app/stores/taskSubjectStore'
import type { SubjectData, SubjectType, ApplicationProfile } from '@/app/types/subject'
import { LANGUAGE_LABELS } from '@/app/types/subject'

type Props = {
  subjectName: string | null
  onClose: () => void
  onSaved: () => void
}

const EMPTY_PROFILE: ApplicationProfile = {
  fullName: '',
  fieldOfStudy: '',
  institution: '',
  cvGist: '',
  defaultLanguage: 'en',
}

export default function SubjectEditorModal({ subjectName, onClose, onSaved }: Props) {
  const [type, setType] = useState<SubjectType>('general')
  const [profile, setProfile] = useState<ApplicationProfile>(EMPTY_PROFILE)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!subjectName) return
    taskSubjectStore.get(subjectName).then(data => {
      if (data) {
        setType(data.type)
        if (data.application) setProfile(data.application)
      }
    })
  }, [subjectName])

  if (!subjectName) return null

  const handleSave = async () => {
    setSaving(true)
    const data: SubjectData = {
      name: subjectName,
      type,
      ...(type === 'application' ? { application: profile } : {}),
      createdAt: new Date().toISOString(),
    }
    await taskSubjectStore.save(data)
    setSaving(false)
    onSaved()
    onClose()
  }

  const updateProfile = (field: keyof ApplicationProfile, value: string) => {
    setProfile(prev => ({ ...prev, [field]: value }))
  }

  return (
    <Modal isOpen={!!subjectName} onClose={onClose} maxWidth="500px">
      <div dir="rtl" style={{ padding: '0.5rem' }}>
        <h3 style={{ margin: '0 0 1.5rem', textAlign: 'center', fontSize: '1.1rem' }}>
          הגדרות נושא: {subjectName}
        </h3>

        {/* Subject type */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ fontSize: '0.85rem', color: '#374151', fontWeight: 500 }}>סוג</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as SubjectType)}
            style={inputStyle}
          >
            <option value="general">כללי</option>
            <option value="application">מכתב/הגשה</option>
          </select>
        </div>

        {/* Application profile */}
        {type === 'application' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <Field label="שם מלא" value={profile.fullName} onChange={v => updateProfile('fullName', v)} />
            <Field label="תחום לימוד" value={profile.fieldOfStudy} onChange={v => updateProfile('fieldOfStudy', v)} />
            <Field label="מוסד לימודים" value={profile.institution} onChange={v => updateProfile('institution', v)} />

            <div>
              <label style={labelStyle}>שפת ברירת מחדל</label>
              <select
                value={profile.defaultLanguage}
                onChange={(e) => updateProfile('defaultLanguage', e.target.value)}
                style={inputStyle}
              >
                {Object.entries(LANGUAGE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>גוף המכתב (תבנית)</label>
              <textarea
                value={profile.cvGist}
                onChange={(e) => updateProfile('cvGist', e.target.value)}
                placeholder="תיאור הלימודים, ניסיון, מוטיבציה..."
                rows={5}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
              <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>
                טקסט זה ישמש כגוף המכתב — ייכתב בשפה שנבחרה
              </span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-start', marginTop: '1.5rem' }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '0.6rem 1.25rem', background: '#3b82f6', color: 'white',
              border: 'none', borderRadius: '0.375rem', cursor: 'pointer', fontWeight: 500,
            }}
          >
            {saving ? 'שומר...' : 'שמור'}
          </button>
          <button onClick={onClose} style={{
            padding: '0.6rem 1.25rem', background: '#f1f5f9',
            border: '1px solid #d1d5db', borderRadius: '0.375rem', cursor: 'pointer',
          }}>
            ביטול
          </button>
        </div>
      </div>
    </Modal>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.85rem', color: '#374151', fontWeight: 500, marginBottom: '0.25rem',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.5rem', borderRadius: '0.375rem',
  border: '1px solid #d1d5db', fontSize: '0.875rem', boxSizing: 'border-box',
}
