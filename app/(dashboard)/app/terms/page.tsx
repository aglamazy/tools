'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { subscribeToAuthState, getIdToken, type AuthUser } from '@/app/services/firebaseAuthService'
import { userTierStore } from '@/app/stores/userTierStore'
import { config, routes } from '@/app/config'
import { db } from '@/app/db/financeDB'


export default function TermsPage() {
  const router = useRouter()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tcText, setTcText] = useState<string | null>(null)

  useEffect(() => {
    const unsub = subscribeToAuthState((u) => {
      setUser(u)
      setAuthReady(true)
    })
    return unsub
  }, [])

  // If logged-in user already accepted, redirect to dashboard
  useEffect(() => {
    const unsub = userTierStore.subscribeTc((state) => {
      if (!state.loading && state.accepted) {
        router.replace(routes.dashboard)
      }
    })
    return unsub
  }, [router])

  // Fetch latest T&C text from server (public endpoint)
  useEffect(() => {
    fetch('/api/terms')
      .then(res => res.json())
      .then(data => { if (data.success && data.text) setTcText(data.text) })
      .catch(() => {})
  }, [])

  const handleAccept = async () => {
    setError(null)
    setSubmitting(true)
    try {
      if (user) {
        // Logged-in: POST to server
        const token = await getIdToken()
        const res = await fetch('/api/terms', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        })
        if (!res.ok) {
          setError('שגיאה באישור תנאי השימוש. נסה שוב.')
          setSubmitting(false)
          return
        }
      } else {
        // Anonymous: save locally
        await db.appSettings.put({
          key: 'tcAcceptedAt',
          value: config.tcVersion,
          updatedAt: new Date().toISOString(),
        })
        window.dispatchEvent(new Event('local-tc-accepted'))
        router.replace(routes.dashboard)
      }
    } catch {
      setError('שגיאה באישור תנאי השימוש. נסה שוב.')
    }
    setSubmitting(false)
  }

  // Show loading while auth initializes
  if (!authReady) return null

  return (
    <div className="tool-page" dir="rtl" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <div style={cardStyle}>
        <h1 style={{ fontSize: '1.5rem', marginBottom: '1.5rem', textAlign: 'center' }}>
          תנאי שימוש
        </h1>

        {tcText ? (
          <div
            style={textBoxStyle}
            dangerouslySetInnerHTML={{ __html: tcText }}
          />
        ) : (
          <div style={{ ...textBoxStyle, textAlign: 'center', color: '#94a3b8' }}>
            טוען תנאי שימוש...
          </div>
        )}

        {error && (
          <div style={{ marginBottom: '1rem', padding: '0.75rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', color: '#dc2626', fontSize: '0.9rem', textAlign: 'center' }}>
            {error}
          </div>
        )}

        <button
          onClick={handleAccept}
          disabled={submitting || !tcText}
          style={buttonStyle(submitting || !tcText)}
        >
          {submitting ? 'שומר...' : 'קראתי ואני מאשר/ת'}
        </button>
      </div>
    </div>
  )
}

const cardStyle: React.CSSProperties = {
  maxWidth: '600px',
  width: '100%',
  background: '#ffffff',
  borderRadius: '0.75rem',
  border: '1px solid #e2e8f0',
  padding: '2rem',
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
}

const textBoxStyle: React.CSSProperties = {
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: '0.5rem',
  padding: '1.25rem',
  marginBottom: '1.5rem',
  lineHeight: 1.8,
  fontSize: '1rem',
  color: '#1e293b',
  maxHeight: '60vh',
  overflowY: 'auto',
}

const buttonStyle = (disabled: boolean): React.CSSProperties => ({
  width: '100%',
  padding: '0.875rem',
  background: disabled ? '#93c5fd' : '#3b82f6',
  color: '#fff',
  border: 'none',
  borderRadius: '0.5rem',
  fontSize: '1rem',
  fontWeight: 600,
  cursor: disabled ? 'not-allowed' : 'pointer',
  transition: 'background 0.2s',
})
