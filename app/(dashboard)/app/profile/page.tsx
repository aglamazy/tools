'use client'

import { useEffect, useState, useCallback } from 'react'
import { subscribeToAuthState, getIdToken, type AuthUser } from '@/app/services/firebaseAuthService'
import TaxProfileSection from '@/app/components/TaxProfileSection'

interface ProfileEntry {
  id: string
  question: string
  answer: string | string[]
  answerType: string
  tags?: string[]
  createdAt?: string
  updatedAt?: string
}

export default function ProfilePage() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [entries, setEntries] = useState<ProfileEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newQuestion, setNewQuestion] = useState('')
  const [newAnswer, setNewAnswer] = useState('')
  const [newType, setNewType] = useState('word')
  const [feedback, setFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    const unsub = subscribeToAuthState((u) => setUser(u))
    return unsub
  }, [])

  const showFeedback = useCallback((text: string, type: 'success' | 'error') => {
    setFeedback({ text, type })
    setTimeout(() => setFeedback(null), 3000)
  }, [])

  const fetchProfile = useCallback(async () => {
    setLoading(true)
    try {
      const token = await getIdToken()
      const res = await fetch('/api/profile-qa', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (res.ok) {
        const json = await res.json()
        setEntries(json.data || [])
      }
    } catch (err) {
      console.error('Fetch profile error:', err)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (user) fetchProfile()
  }, [user, fetchProfile])

  const addFact = useCallback(async () => {
    if (!newQuestion.trim() || !newAnswer.trim()) return
    setSaving(true)
    try {
      const token = await getIdToken()
      const res = await fetch('/api/profile-qa', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          facts: [{ question: newQuestion.trim(), answer: newAnswer.trim(), answerType: newType }],
        }),
      })
      if (res.ok) {
        showFeedback('נשמר בהצלחה', 'success')
        setNewQuestion('')
        setNewAnswer('')
        setNewType('word')
        fetchProfile()
      } else {
        showFeedback('שגיאה בשמירה', 'error')
      }
    } catch {
      showFeedback('שגיאה בשמירה', 'error')
    }
    setSaving(false)
  }, [newQuestion, newAnswer, newType, showFeedback, fetchProfile])

  const deleteFact = useCallback(async (id: string) => {
    try {
      const token = await getIdToken()
      await fetch('/api/profile-qa', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ id }),
      })
      setEntries(prev => prev.filter(e => e.id !== id))
    } catch {
      showFeedback('שגיאה במחיקה', 'error')
    }
  }, [showFeedback])

  const updateFact = useCallback(async (id: string, answer: string) => {
    try {
      const token = await getIdToken()
      await fetch('/api/profile-qa', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ id, answer }),
      })
      setEntries(prev => prev.map(e => e.id === id ? { ...e, answer } : e))
      showFeedback('עודכן', 'success')
    } catch {
      showFeedback('שגיאה בעדכון', 'error')
    }
  }, [showFeedback])

  if (!user) {
    return <div className="tool-page" dir="rtl"><p>יש להתחבר כדי לצפות בפרופיל</p></div>
  }

  return (
    <div className="tool-page" dir="rtl">
      <h1 style={{ fontSize: '1.5rem', marginBottom: '1.5rem' }}>הפרופיל שלי</h1>
      {/* Tax settings section */}
      <TaxProfileSection />

      <p style={{ color: '#64748b', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
        עובדות שנשמרו ישמשו למילוי אוטומטי של טפסים דרך התוסף.
      </p>

      {/* Add new fact */}
      <div style={addSectionStyle}>
        <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>הוסף עובדה חדשה</h3>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <input
            value={newQuestion}
            onChange={e => setNewQuestion(e.target.value)}
            placeholder="שאלה (למשל: שם מלא, כלי נגינה, תאריך לידה...)"
            style={{ ...inputStyle, flex: '1 1 200px' }}
          />
          <input
            value={newAnswer}
            onChange={e => setNewAnswer(e.target.value)}
            placeholder="תשובה"
            style={{ ...inputStyle, flex: '1 1 200px' }}
            onKeyDown={e => e.key === 'Enter' && addFact()}
          />
          <select value={newType} onChange={e => setNewType(e.target.value)} style={{ ...inputStyle, flex: '0 0 120px' }}>
            <option value="word">טקסט קצר</option>
            <option value="paragraph">פסקה</option>
            <option value="date">תאריך</option>
          </select>
          <button onClick={addFact} disabled={saving || !newQuestion.trim() || !newAnswer.trim()} style={addBtnStyle}>
            {saving ? 'שומר...' : '+ הוסף'}
          </button>
        </div>
      </div>

      {/* Entries table */}
      {loading ? (
        <p style={{ color: '#64748b', marginTop: '2rem' }}>טוען...</p>
      ) : entries.length === 0 ? (
        <p style={{ color: '#94a3b8', marginTop: '2rem', textAlign: 'center', fontStyle: 'italic' }}>
          אין עובדות בפרופיל עדיין. הוסף עובדות כדי למלא טפסים אוטומטית.
        </p>
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>שאלה</th>
              <th style={thStyle}>תשובה</th>
              <th style={thStyle}>סוג</th>
              <th style={{ ...thStyle, width: '60px' }}></th>
            </tr>
          </thead>
          <tbody>
            {entries.map(entry => (
              <tr key={entry.id}>
                <td style={tdStyle}>{entry.question}</td>
                <td style={tdStyle}>
                  <input
                    defaultValue={typeof entry.answer === 'string' ? entry.answer : Array.isArray(entry.answer) ? entry.answer.join(', ') : ''}
                    onBlur={e => {
                      const val = e.target.value
                      const orig = typeof entry.answer === 'string' ? entry.answer : Array.isArray(entry.answer) ? entry.answer.join(', ') : ''
                      if (val !== orig) updateFact(entry.id, val)
                    }}
                    style={cellInputStyle}
                  />
                </td>
                <td style={{ ...tdStyle, fontSize: '0.8rem', color: '#94a3b8' }}>{entry.answerType}</td>
                <td style={tdStyle}>
                  <button onClick={() => deleteFact(entry.id)} style={deleteBtnStyle} title="מחק">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p style={{ color: '#94a3b8', fontSize: '0.8rem', marginTop: '1rem' }}>
        {entries.length} עובדות בפרופיל
      </p>

      {feedback && (
        <div style={{
          position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)',
          padding: '0.625rem 1.5rem', borderRadius: '0.375rem', fontSize: '0.875rem',
          background: feedback.type === 'success' ? '#f0fdf4' : '#fef2f2',
          color: feedback.type === 'success' ? '#166534' : '#dc2626',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        }}>
          {feedback.text}
        </div>
      )}
    </div>
  )
}

const addSectionStyle: React.CSSProperties = {
  background: '#f8fafc',
  padding: '1rem',
  borderRadius: '0.5rem',
  border: '1px solid #e2e8f0',
  marginBottom: '1.5rem',
}

const inputStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  border: '1px solid #cbd5e1',
  borderRadius: '0.375rem',
  fontSize: '0.875rem',
  outline: 'none',
}

const addBtnStyle: React.CSSProperties = {
  padding: '0.5rem 1.25rem',
  background: '#3b82f6',
  color: 'white',
  border: 'none',
  borderRadius: '0.375rem',
  fontSize: '0.875rem',
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  marginTop: '1rem',
}

const thStyle: React.CSSProperties = {
  textAlign: 'right',
  padding: '0.625rem 0.75rem',
  borderBottom: '2px solid #e2e8f0',
  fontSize: '0.85rem',
  color: '#475569',
  fontWeight: 600,
}

const tdStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  borderBottom: '1px solid #f1f5f9',
  verticalAlign: 'middle',
}

const cellInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.375rem 0.5rem',
  border: '1px solid transparent',
  borderRadius: '0.25rem',
  fontSize: '0.85rem',
  outline: 'none',
  background: 'transparent',
  transition: 'border-color 0.2s',
}

const deleteBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: '0.85rem',
  color: '#94a3b8',
  padding: '0.25rem 0.5rem',
  borderRadius: '0.25rem',
}
