'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { signInWithGoogle, signOut, subscribeToAuthState, type AuthUser } from '@/app/services/firebaseAuthService'

interface FormField {
  id: string
  type: string
  label: string
  name: string
  placeholder: string
  value: string
  required: boolean
  selector: string
  options?: { value: string; text: string }[]
}

export default function ExtensionSidebarPage() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [fields, setFields] = useState<FormField[]>([])
  const [scanning, setScanning] = useState(false)
  const [scanned, setScanned] = useState(false)
  const pendingResolve = useRef<((fields: FormField[]) => void) | null>(null)

  useEffect(() => {
    const unsub = subscribeToAuthState((u) => {
      setUser(u)
      setLoading(false)
    })
    return unsub
  }, [])

  // Listen for postMessage responses from extension bridge
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const msg = event.data
      if (!msg || !msg.type) return
      if (msg.type === 'FIELDS_RESULT' && pendingResolve.current) {
        pendingResolve.current(msg.fields || [])
        pendingResolve.current = null
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  const scanForm = useCallback(async () => {
    setScanning(true)
    setScanned(false)

    const extractedFields = await new Promise<FormField[]>((resolve) => {
      pendingResolve.current = resolve
      window.parent.postMessage({ type: 'EXTRACT_FIELDS' }, '*')
      setTimeout(() => {
        if (pendingResolve.current === resolve) {
          pendingResolve.current = null
          resolve([])
        }
      }, 3000)
    })

    setFields(extractedFields)
    setScanning(false)
    setScanned(true)
  }, [])

  if (loading) {
    return <div style={containerStyle}><p style={{ color: '#64748b' }}>טוען...</p></div>
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
      <header style={headerStyle}>
        <h2 style={{ fontSize: '1.25rem', color: '#3b82f6', margin: 0 }}>Aglamaz</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.7rem', color: '#64748b' }}>{user.email}</span>
          <button onClick={() => signOut()} style={smallBtnStyle}>יציאה</button>
        </div>
      </header>

      <button onClick={scanForm} disabled={scanning} style={primaryBtnStyle}>
        {scanning ? 'סורק...' : '📋 סרוק טופס'}
      </button>

      {scanned && fields.length === 0 && (
        <p style={{ color: '#dc2626', fontSize: '0.85rem', textAlign: 'center', marginTop: '1rem' }}>
          לא נמצאו שדות בדף הנוכחי
        </p>
      )}

      {fields.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <p style={{ fontSize: '0.85rem', color: '#334155', marginBottom: '0.5rem', fontWeight: 500 }}>
            נמצאו {fields.length} שדות:
          </p>
          <div style={fieldsListStyle}>
            {fields.map((field, i) => (
              <div key={field.id + i} style={cardStyle}>
                <div style={{ fontSize: '0.8rem', fontWeight: 500, color: '#475569' }}>
                  {field.label || field.name || field.id}
                  {field.required && <span style={{ color: '#dc2626' }}> *</span>}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.125rem' }}>
                  {field.type}{field.name ? ` · ${field.name}` : ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
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
  alignItems: 'stretch',
  background: '#f8fafc',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '1rem',
  paddingBottom: '0.75rem',
  borderBottom: '1px solid #e2e8f0',
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

const primaryBtnStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.625rem 1.25rem',
  background: '#3b82f6',
  color: 'white',
  border: 'none',
  borderRadius: '0.375rem',
  fontSize: '0.875rem',
  fontWeight: 600,
  cursor: 'pointer',
}

const smallBtnStyle: React.CSSProperties = {
  padding: '0.25rem 0.5rem',
  background: '#e2e8f0',
  color: '#475569',
  border: 'none',
  borderRadius: '0.25rem',
  fontSize: '0.75rem',
  cursor: 'pointer',
}

const fieldsListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.375rem',
  maxHeight: 'calc(100vh - 200px)',
  overflowY: 'auto',
}

const cardStyle: React.CSSProperties = {
  background: 'white',
  border: '1px solid #e2e8f0',
  borderRadius: '0.375rem',
  padding: '0.5rem 0.625rem',
}
