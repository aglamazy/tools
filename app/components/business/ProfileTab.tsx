'use client'

import React, { useEffect, useState, useRef } from 'react'
import { profileQAStore } from '@/app/stores/profileQAStore'
import type { ProfileQA, ProfileQAAnswerType } from '@/app/types/profileQA'
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { LocaleDateInput } from '@/app/components/LocaleInputs'

type ProfileTabProps = {
  businessId: string
}

type QAForm = {
  question: string
  answerType: ProfileQAAnswerType
  isArray: boolean
  answer: string | string[]
  tags: string
}

const emptyForm: QAForm = {
  question: '',
  answerType: 'word',
  isArray: false,
  answer: '',
  tags: '',
}

const ANSWER_TYPE_LABELS: Record<ProfileQAAnswerType, string> = {
  word: 'טקסט קצר',
  date: 'תאריך',
  paragraph: 'פסקה',
  photo: 'תמונה',
  file: 'קובץ',
}

const ANSWER_TYPE_BADGE_COLORS: Record<ProfileQAAnswerType, { bg: string; color: string }> = {
  word: { bg: '#dbeafe', color: '#1e40af' },
  date: { bg: '#fef3c7', color: '#92400e' },
  paragraph: { bg: '#dcfce7', color: '#166534' },
  photo: { bg: '#ede9fe', color: '#5b21b6' },
  file: { bg: '#fee2e2', color: '#991b1b' },
}

export default function ProfileTab({ businessId }: ProfileTabProps) {
  const [qas, setQAs] = useState<ProfileQA[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<QAForm>(emptyForm)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadQAs()
  }, [businessId])

  const loadQAs = async () => {
    const all = await profileQAStore.getByBusinessId(businessId)
    setQAs(all.sort((a, b) => a.createdAt.localeCompare(b.createdAt)))
    setLoading(false)
  }

  const handleAdd = () => {
    setForm(emptyForm)
    setEditingId(null)
    setShowForm(true)
    setError('')
  }

  const handleEdit = (qa: ProfileQA) => {
    setForm({
      question: qa.question,
      answerType: qa.answerType,
      isArray: qa.isArray,
      answer: qa.answer,
      tags: qa.tags?.join(', ') || '',
    })
    setEditingId(qa.id!)
    setShowForm(true)
    setError('')
  }

  const handleDelete = async (id: number) => {
    await profileQAStore.delete(id)
    await loadQAs()
  }

  const uploadFile = async (file: File): Promise<string> => {
    const storage = getStorage()
    const storageRef = ref(storage, `profiles/${businessId}/${file.name}`)
    await uploadBytes(storageRef, file)
    return await getDownloadURL(storageRef)
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setUploading(true)
    try {
      const file = files[0]
      const url = await uploadFile(file)
      if (form.isArray) {
        const currentArr = Array.isArray(form.answer) ? form.answer : form.answer ? [form.answer] : []
        setForm({ ...form, answer: [...currentArr, url] })
      } else {
        setForm({ ...form, answer: url })
      }
    } catch (err) {
      console.error('Error uploading file:', err)
      setError('שגיאה בהעלאת קובץ')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleSave = async () => {
    if (!form.question.trim()) {
      setError('שאלה נדרשת')
      return
    }

    const tags = form.tags.trim()
      ? form.tags.split(',').map(t => t.trim()).filter(Boolean)
      : undefined

    try {
      if (editingId) {
        await profileQAStore.update(editingId, {
          question: form.question.trim(),
          answerType: form.answerType,
          isArray: form.isArray,
          answer: form.answer,
          tags,
        })
      } else {
        await profileQAStore.add({
          businessId,
          question: form.question.trim(),
          answerType: form.answerType,
          isArray: form.isArray,
          answer: form.isArray ? (Array.isArray(form.answer) ? form.answer : []) : (typeof form.answer === 'string' ? form.answer : ''),
          tags,
        })
      }
      setShowForm(false)
      setEditingId(null)
      setForm(emptyForm)
      setError('')
      await loadQAs()
    } catch (err) {
      console.error('Error saving profileQA:', err)
      setError('שגיאה בשמירה')
    }
  }

  const handleCancel = () => {
    setShowForm(false)
    setEditingId(null)
    setError('')
  }

  // Array answer helpers
  const addArrayItem = () => {
    const currentArr = Array.isArray(form.answer) ? form.answer : []
    setForm({ ...form, answer: [...currentArr, ''] })
  }

  const updateArrayItem = (index: number, value: string) => {
    const currentArr = Array.isArray(form.answer) ? [...form.answer] : []
    currentArr[index] = value
    setForm({ ...form, answer: currentArr })
  }

  const removeArrayItem = (index: number) => {
    const currentArr = Array.isArray(form.answer) ? [...form.answer] : []
    currentArr.splice(index, 1)
    setForm({ ...form, answer: currentArr })
  }

  const renderAnswerPreview = (qa: ProfileQA) => {
    const answer = qa.answer
    if (qa.isArray && Array.isArray(answer)) {
      if (answer.length === 0) return <span style={{ color: '#94a3b8' }}>ללא תשובות</span>
      return <span>{answer.length} תשובות</span>
    }
    if (typeof answer === 'string') {
      if (!answer) return <span style={{ color: '#94a3b8' }}>ללא תשובה</span>
      if (qa.answerType === 'photo') return <span>🖼️ תמונה</span>
      if (qa.answerType === 'file') return <span>📎 קובץ</span>
      if (answer.length > 60) return <span>{answer.substring(0, 60)}...</span>
      return <span>{answer}</span>
    }
    return null
  }

  const renderAnswerInput = () => {
    if (form.isArray) {
      const items = Array.isArray(form.answer) ? form.answer : []
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {items.map((item, i) => (
            <div key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {renderSingleInput(item, (val) => updateArrayItem(i, val))}
              <button
                type="button"
                onClick={() => removeArrayItem(i)}
                style={{ padding: '0.3rem 0.5rem', background: 'transparent', border: '1px solid #fecaca', borderRadius: '0.375rem', cursor: 'pointer', color: '#dc2626', fontSize: '0.8rem' }}
              >
                ✕
              </button>
            </div>
          ))}
          {(form.answerType === 'photo' || form.answerType === 'file') ? (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept={form.answerType === 'photo' ? 'image/*' : '.pdf,.docx'}
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="upload-another-btn"
                style={{ fontSize: '0.85rem' }}
              >
                {uploading ? 'מעלה...' : '+ הוסף'}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={addArrayItem}
              className="upload-another-btn"
              style={{ fontSize: '0.85rem', alignSelf: 'flex-start' }}
            >
              + הוסף
            </button>
          )}
        </div>
      )
    }

    // Single value
    if (form.answerType === 'photo' || form.answerType === 'file') {
      const currentVal = typeof form.answer === 'string' ? form.answer : ''
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <input
            ref={fileInputRef}
            type="file"
            accept={form.answerType === 'photo' ? 'image/*' : '.pdf,.docx'}
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="upload-another-btn"
          >
            {uploading ? 'מעלה...' : currentVal ? 'החלף קובץ' : 'העלה קובץ'}
          </button>
          {currentVal && form.answerType === 'photo' && (
            <img src={currentVal} alt="preview" style={{ maxWidth: '120px', maxHeight: '120px', borderRadius: '0.5rem', objectFit: 'cover' }} />
          )}
          {currentVal && form.answerType === 'file' && (
            <span style={{ fontSize: '0.85rem', color: '#475569' }}>📎 {currentVal.split('/').pop()}</span>
          )}
        </div>
      )
    }

    const val = typeof form.answer === 'string' ? form.answer : ''
    return renderSingleInput(val, (v) => setForm({ ...form, answer: v }))
  }

  const renderSingleInput = (value: string, onChange: (val: string) => void) => {
    const inputStyle = { width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #e2e8f0', fontSize: '0.95rem', direction: 'rtl' as const }

    switch (form.answerType) {
      case 'word':
        return (
          <input type="text" value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} placeholder="תשובה קצרה..." />
        )
      case 'date':
        return (
          <LocaleDateInput value={value} onChange={onChange} style={inputStyle} />
        )
      case 'paragraph':
        return (
          <textarea value={value} onChange={(e) => onChange(e.target.value)} style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }} placeholder="תשובה ארוכה..." />
        )
      default:
        return (
          <input type="text" value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
        )
    }
  }

  // Group QAs by tags
  const grouped: Record<string, ProfileQA[]> = {}
  const ungrouped: ProfileQA[] = []
  for (const qa of qas) {
    if (qa.tags && qa.tags.length > 0) {
      for (const tag of qa.tags) {
        if (!grouped[tag]) grouped[tag] = []
        grouped[tag].push(qa)
      }
    } else {
      ungrouped.push(qa)
    }
  }

  if (loading) {
    return <p>טוען...</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: '1.1rem' }}>פרופיל אמן</h2>
        <button onClick={handleAdd} className="file-picker">
          + הוסף שאלה
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
              <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600, fontSize: '0.9rem' }}>שאלה</label>
              <input
                type="text"
                value={form.question}
                onChange={(e) => setForm({ ...form, question: e.target.value })}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #e2e8f0', fontSize: '0.95rem', direction: 'rtl' }}
                placeholder="לדוגמה: כלי ראשי"
                autoFocus
              />
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600, fontSize: '0.9rem' }}>סוג תשובה</label>
                <select
                  value={form.answerType}
                  onChange={(e) => {
                    const newType = e.target.value as ProfileQAAnswerType
                    setForm({ ...form, answerType: newType, answer: form.isArray ? [] : '' })
                  }}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #e2e8f0', fontSize: '0.95rem', direction: 'rtl' }}
                >
                  {(Object.keys(ANSWER_TYPE_LABELS) as ProfileQAAnswerType[]).map(t => (
                    <option key={t} value={t}>{ANSWER_TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingTop: '1.25rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                  <input
                    type="checkbox"
                    checked={form.isArray}
                    onChange={(e) => setForm({ ...form, isArray: e.target.checked, answer: e.target.checked ? [] : '' })}
                  />
                  מספר תשובות
                </label>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600, fontSize: '0.9rem' }}>תשובה</label>
              {renderAnswerInput()}
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600, fontSize: '0.9rem' }}>תגיות (אופציונלי, מופרד בפסיקים)</label>
              <input
                type="text"
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #e2e8f0', fontSize: '0.95rem', direction: 'rtl' }}
                placeholder="לדוגמה: ביוגרפיה, השכלה"
              />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button onClick={handleCancel} className="upload-another-btn">
                ביטול
              </button>
              <button onClick={handleSave} className="file-picker">
                שמור
              </button>
            </div>
          </div>
        </div>
      )}

      {qas.length === 0 && !showForm && (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: '0.75rem', border: '1px dashed #cbd5e1' }}>
          <p>אין שאלות בפרופיל. הוסף שאלה חדשה כדי להתחיל.</p>
        </div>
      )}

      {/* Grouped by tags */}
      {Object.entries(grouped).map(([tag, tagQAs]) => (
        <div key={tag}>
          <h3 style={{ margin: '0.5rem 0', fontSize: '0.95rem', color: '#475569' }}>{tag}</h3>
          {tagQAs.map(qa => renderQACard(qa))}
        </div>
      ))}

      {/* Ungrouped */}
      {ungrouped.map(qa => renderQACard(qa))}
    </div>
  )

  function renderQACard(qa: ProfileQA) {
    const badgeColors = ANSWER_TYPE_BADGE_COLORS[qa.answerType]
    return (
      <div
        key={qa.id}
        style={{ padding: '0.75rem 1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontWeight: 600 }}>{qa.question}</span>
            <span style={{
              fontSize: '0.75rem',
              padding: '0.1rem 0.4rem',
              borderRadius: '0.25rem',
              background: badgeColors.bg,
              color: badgeColors.color,
            }}>
              {ANSWER_TYPE_LABELS[qa.answerType]}
            </span>
            {qa.isArray && (
              <span style={{ fontSize: '0.75rem', padding: '0.1rem 0.4rem', borderRadius: '0.25rem', background: '#f1f5f9', color: '#475569' }}>
                מרובה
              </span>
            )}
          </div>
          <div style={{ fontSize: '0.9rem', color: '#64748b' }}>
            {renderAnswerPreview(qa)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => handleEdit(qa)}
            style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem', background: 'transparent', border: '1px solid #cbd5e1', borderRadius: '0.375rem', cursor: 'pointer', color: '#475569' }}
          >
            ערוך
          </button>
          <button
            onClick={() => handleDelete(qa.id!)}
            style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem', background: 'transparent', border: '1px solid #fecaca', borderRadius: '0.375rem', cursor: 'pointer', color: '#dc2626' }}
          >
            מחק
          </button>
        </div>
      </div>
    )
  }
}
