'use client'

import { useState } from 'react'
import Modal from './Modal'
import { setupEncryptionPassword } from '@/app/services/cloudBackupService'

type Mode = 'setup' | 'enter'

type EncryptionPasswordModalProps = {
  isOpen: boolean
  onClose: () => void
  mode: Mode
  onSuccess: (password: string) => void
}

export default function EncryptionPasswordModal({
  isOpen,
  onClose,
  mode,
  onSuccess,
}: EncryptionPasswordModalProps) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [acknowledged, setAcknowledged] = useState(false)

  const resetForm = () => {
    setPassword('')
    setConfirmPassword('')
    setError(null)
    setAcknowledged(false)
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (mode === 'setup') {
      if (password.length < 8) {
        setError('הסיסמה חייבת להכיל לפחות 8 תווים')
        return
      }

      if (password !== confirmPassword) {
        setError('הסיסמאות לא תואמות')
        return
      }

      if (!acknowledged) {
        setError('יש לאשר שהבנת את האזהרה')
        return
      }

      setLoading(true)
      try {
        const result = await setupEncryptionPassword(password)
        if (result.success) {
          onSuccess(password)
          handleClose()
        } else {
          setError(result.error || 'שגיאה בהגדרת סיסמה')
        }
      } finally {
        setLoading(false)
      }
    } else {
      // Enter mode - just verify format and pass to parent
      if (password.length < 8) {
        setError('הסיסמה חייבת להכיל לפחות 8 תווים')
        return
      }
      onSuccess(password)
      handleClose()
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} maxWidth="450px">
      <div style={{ padding: '1.5rem' }}>
        <h2 style={{ margin: '0 0 1rem 0', textAlign: 'center', fontSize: '1.5rem' }}>
          {mode === 'setup' ? 'הגדרת סיסמת הצפנה' : 'הזן סיסמת הצפנה'}
        </h2>

        {mode === 'setup' && (
          <div
            style={{
              marginBottom: '1.5rem',
              padding: '1rem',
              background: '#fef3c7',
              border: '1px solid #fbbf24',
              borderRadius: '0.5rem',
              fontSize: '0.9rem',
              lineHeight: 1.6,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: '0.5rem', color: '#92400e' }}>
              חשוב לדעת:
            </div>
            <ul style={{ margin: 0, paddingRight: '1.25rem', color: '#92400e' }}>
              <li>סיסמה זו מצפינה את הנתונים שלך בענן</li>
              <li>הסיסמה לא נשמרת בשרת - רק אתה יודע אותה</li>
              <li>
                <strong>אם תשכח את הסיסמה, לא ניתן יהיה לשחזר את הנתונים מהענן</strong>
              </li>
              <li>תמיד ניתן לייצא גיבוי מקומי כגיבוי נוסף</li>
            </ul>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label
              htmlFor="encPassword"
              style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}
            >
              סיסמת הצפנה
            </label>
            <input
              id="encPassword"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              minLength={8}
              placeholder="לפחות 8 תווים"
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.5rem',
                fontSize: '1rem',
              }}
              dir="ltr"
            />
          </div>

          {mode === 'setup' && (
            <>
              <div style={{ marginBottom: '1rem' }}>
                <label
                  htmlFor="encConfirmPassword"
                  style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}
                >
                  אימות סיסמה
                </label>
                <input
                  id="encConfirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={loading}
                  minLength={8}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.5rem',
                    fontSize: '1rem',
                  }}
                  dir="ltr"
                />
              </div>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.5rem',
                  marginBottom: '1rem',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                  disabled={loading}
                  style={{ marginTop: '0.25rem' }}
                />
                <span style={{ fontSize: '0.9rem', color: '#374151' }}>
                  אני מבין/ה שאיבוד הסיסמה יגרום לאיבוד הגישה לנתונים בענן
                </span>
              </label>
            </>
          )}

          {error && (
            <div
              style={{
                marginBottom: '1rem',
                padding: '0.75rem',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '0.5rem',
                color: '#dc2626',
                fontSize: '0.9rem',
                textAlign: 'center',
              }}
            >
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              style={{
                flex: 1,
                padding: '0.875rem',
                background: '#f1f5f9',
                color: '#475569',
                border: '1px solid #cbd5e1',
                borderRadius: '0.5rem',
                fontSize: '1rem',
                fontWeight: 500,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              ביטול
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                flex: 1,
                padding: '0.875rem',
                background: loading ? '#94a3b8' : '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                fontSize: '1rem',
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'טוען...' : mode === 'setup' ? 'הגדר סיסמה' : 'אישור'}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  )
}
