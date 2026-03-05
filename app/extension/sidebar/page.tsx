'use client'

import { useEffect, useState } from 'react'
import { signInWithGoogle, subscribeToAuthState, type AuthUser } from '@/app/services/firebaseAuthService'

export default function ExtensionSidebarPage() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    document.body.classList.add('extension-auth-popup')
    return () => document.body.classList.remove('extension-auth-popup')
  }, [])

  useEffect(() => {
    const unsub = subscribeToAuthState((u) => {
      setUser(u)
      setLoading(false)
    })
    return unsub
  }, [])

  if (loading) {
    return (
      <div style={containerStyle}>
        <p style={{ color: '#64748b' }}>טוען...</p>
      </div>
    )
  }

  if (!user) {
    return (
      <div style={containerStyle}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.5rem', color: '#3b82f6', marginBottom: '0.25rem' }}>Aglamaz</h1>
          <p style={{ color: '#64748b', marginBottom: '2rem' }}>עוזר למילוי טפסים</p>
          <button onClick={() => signInWithGoogle()} style={googleBtnStyle}>
            <svg width="18" height="18" viewBox="0 0 48 48" style={{ marginLeft: '0.5rem' }}>
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            התחבר עם Google
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ ...containerStyle, justifyContent: 'flex-start', padding: '1rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid #e2e8f0' }}>
        <h2 style={{ fontSize: '1.25rem', color: '#3b82f6' }}>Aglamaz</h2>
        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{user.email}</span>
      </header>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#94a3b8', fontStyle: 'italic' }}>תוכן יתווסף בקרוב...</p>
      </div>
    </div>
  )
}

const containerStyle: React.CSSProperties = {
  direction: 'rtl',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'center',
  background: '#f8fafc',
}

const googleBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  padding: '0.75rem 1.25rem',
  background: 'white',
  color: '#3c4043',
  border: '1px solid #dadce0',
  borderRadius: '0.375rem',
  fontSize: '0.9rem',
  fontWeight: 500,
  cursor: 'pointer',
}
