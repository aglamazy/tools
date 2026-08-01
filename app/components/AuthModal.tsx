'use client'

import { useState } from 'react'
import Modal from './Modal'
import { signInWithGoogle } from '@/app/services/firebaseAuthService'
import { signInLocal } from '@/app/services/localAuthService'

type AuthModalProps = {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

type Tab = 'local' | 'google'

const isLocalAuthEnabled = process.env.NODE_ENV !== 'production'

export default function AuthModal({ isOpen, onClose, onSuccess }: AuthModalProps) {
  const [tab, setTab] = useState<Tab>(isLocalAuthEnabled ? 'local' : 'google')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [username, setUsername] = useState('root')
  const [password, setPassword] = useState('ABC123')

  const handleGoogleSignIn = async () => {
    setError(null)
    setLoading(true)
    try {
      const result = await signInWithGoogle()
      if (result.success) {
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

  const handleLocalSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const result = await signInLocal(username.trim(), password)
      if (result.success) {
        onSuccess?.()
        onClose()
      } else {
        setError(result.error || 'שגיאה בהתחברות')
      }
    } finally {
      setLoading(false)
    }
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '0.5rem',
    background: active ? '#3b82f6' : 'transparent',
    color: active ? '#fff' : '#6b7280',
    border: 'none',
    borderRadius: '0.375rem',
    fontSize: '0.875rem',
    fontWeight: 500,
    cursor: 'pointer',
  })

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="400px">
      <div style={{ padding: '1.5rem' }}>
        <h2 style={{ margin: '0 0 1.5rem 0', textAlign: 'center', fontSize: '1.5rem' }}>
          התחברות
        </h2>

        {/* Tab switcher — only needed when there's more than one sign-in method to pick between */}
        {isLocalAuthEnabled && (
          <div style={{ display: 'flex', gap: '0.25rem', background: '#f1f5f9', borderRadius: '0.5rem', padding: '0.25rem', marginBottom: '1.25rem' }}>
            <button type="button" style={tabStyle(tab === 'local')} onClick={() => { setTab('local'); setError(null) }}>
              משתמש
            </button>
            <button type="button" style={tabStyle(tab === 'google')} onClick={() => { setTab('google'); setError(null) }}>
              Google
            </button>
          </div>
        )}

        {error && (
          <div style={{ marginBottom: '1rem', padding: '0.75rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', color: '#dc2626', fontSize: '0.9rem', textAlign: 'center' }}>
            {error}
          </div>
        )}

        {tab === 'local' && (
          <form onSubmit={handleLocalSignIn} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <input
              type="text"
              placeholder="שם משתמש"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              dir="ltr"
              style={{ padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', fontSize: '1rem', width: '100%', boxSizing: 'border-box' }}
            />
            <input
              type="password"
              placeholder="סיסמה"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              dir="ltr"
              style={{ padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', fontSize: '1rem', width: '100%', boxSizing: 'border-box' }}
            />
            <button
              type="submit"
              disabled={loading}
              style={{ padding: '0.875rem', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '0.5rem', fontSize: '1rem', fontWeight: 500, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}
            >
              {loading ? 'מתחבר...' : 'התחבר'}
            </button>
          </form>
        )}

        {tab === 'google' && (
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            style={{ width: '100%', padding: '0.875rem', background: 'white', color: '#374151', border: '1px solid #d1d5db', borderRadius: '0.5rem', fontSize: '1rem', fontWeight: 500, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            {loading ? 'מתחבר...' : 'המשך עם Google'}
          </button>
        )}
      </div>
    </Modal>
  )
}
