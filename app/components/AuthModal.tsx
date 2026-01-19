'use client'

import { useState } from 'react'
import Modal from './Modal'
import {
  registerWithEmail,
  signInWithEmail,
  signInWithGoogle,
  resetPassword,
} from '@/app/services/firebaseAuthService'

type AuthMode = 'login' | 'register' | 'reset'

type AuthModalProps = {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export default function AuthModal({ isOpen, onClose, onSuccess }: AuthModalProps) {
  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const resetForm = () => {
    setEmail('')
    setPassword('')
    setConfirmPassword('')
    setError(null)
    setSuccessMessage(null)
  }

  const handleModeChange = (newMode: AuthMode) => {
    resetForm()
    setMode(newMode)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccessMessage(null)

    if (mode === 'register' && password !== confirmPassword) {
      setError('הסיסמאות לא תואמות')
      return
    }

    setLoading(true)

    try {
      if (mode === 'login') {
        const result = await signInWithEmail(email, password)
        if (result.success) {
          resetForm()
          onSuccess?.()
          onClose()
        } else {
          setError(result.error || 'שגיאה בהתחברות')
        }
      } else if (mode === 'register') {
        const result = await registerWithEmail(email, password)
        if (result.success) {
          resetForm()
          onSuccess?.()
          onClose()
        } else {
          setError(result.error || 'שגיאה בהרשמה')
        }
      } else if (mode === 'reset') {
        const result = await resetPassword(email)
        if (result.success) {
          setSuccessMessage('נשלח אליך מייל לאיפוס סיסמה')
          setTimeout(() => handleModeChange('login'), 3000)
        } else {
          setError(result.error || 'שגיאה בשליחת מייל')
        }
      }
    } finally {
      setLoading(false)
    }
  }

  const getTitle = () => {
    switch (mode) {
      case 'login':
        return 'התחברות'
      case 'register':
        return 'הרשמה'
      case 'reset':
        return 'איפוס סיסמה'
    }
  }

  const handleGoogleSignIn = async () => {
    setError(null)
    setLoading(true)

    try {
      const result = await signInWithGoogle()
      if (result.success) {
        resetForm()
        onSuccess?.()
        onClose()
      } else {
        if (result.errorCode !== 'auth/popup-closed-by-user') {
          setError(result.error || 'שגיאה בהתחברות עם Google')
        }
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="400px">
      <div style={{ padding: '1.5rem' }}>
        <h2 style={{ margin: '0 0 1.5rem 0', textAlign: 'center', fontSize: '1.5rem' }}>
          {getTitle()}
        </h2>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label
              htmlFor="email"
              style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}
            >
              אימייל
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
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

          {mode !== 'reset' && (
            <div style={{ marginBottom: '1rem' }}>
              <label
                htmlFor="password"
                style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}
              >
                סיסמה
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                minLength={6}
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
          )}

          {mode === 'register' && (
            <div style={{ marginBottom: '1rem' }}>
              <label
                htmlFor="confirmPassword"
                style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}
              >
                אימות סיסמה
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                disabled={loading}
                minLength={6}
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

          {successMessage && (
            <div
              style={{
                marginBottom: '1rem',
                padding: '0.75rem',
                background: '#f0fdf4',
                border: '1px solid #86efac',
                borderRadius: '0.5rem',
                color: '#166534',
                fontSize: '0.9rem',
                textAlign: 'center',
              }}
            >
              {successMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '0.875rem',
              background: loading ? '#94a3b8' : '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              fontSize: '1rem',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              marginBottom: '1rem',
            }}
          >
            {loading ? 'טוען...' : getTitle()}
          </button>
        </form>

        {mode !== 'reset' && (
          <>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                marginBottom: '1rem',
              }}
            >
              <div style={{ flex: 1, height: '1px', background: '#e5e7eb' }} />
              <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>או</span>
              <div style={{ flex: 1, height: '1px', background: '#e5e7eb' }} />
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              style={{
                width: '100%',
                padding: '0.75rem',
                background: 'white',
                color: '#374151',
                border: '1px solid #d1d5db',
                borderRadius: '0.5rem',
                fontSize: '1rem',
                fontWeight: 500,
                cursor: loading ? 'not-allowed' : 'pointer',
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              המשך עם Google
            </button>
          </>
        )}

        <div style={{ textAlign: 'center', fontSize: '0.9rem' }}>
          {mode === 'login' && (
            <>
              <button
                type="button"
                onClick={() => handleModeChange('register')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#3b82f6',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                אין לך חשבון? הרשם
              </button>
              <span style={{ margin: '0 0.5rem', color: '#9ca3af' }}>|</span>
              <button
                type="button"
                onClick={() => handleModeChange('reset')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#3b82f6',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                שכחת סיסמה?
              </button>
            </>
          )}

          {mode === 'register' && (
            <button
              type="button"
              onClick={() => handleModeChange('login')}
              style={{
                background: 'none',
                border: 'none',
                color: '#3b82f6',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              יש לך חשבון? התחבר
            </button>
          )}

          {mode === 'reset' && (
            <button
              type="button"
              onClick={() => handleModeChange('login')}
              style={{
                background: 'none',
                border: 'none',
                color: '#3b82f6',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              חזרה להתחברות
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}
