'use client'

import React, { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { getCurrentUser, subscribeToAuthState } from '@/app/services/firebaseAuthService'
import { getPendingInvitation, acceptInvitation } from '@/app/services/householdService'
import { refreshIdToken } from '@/app/services/firebaseAuthService'
import type { HouseholdInvitation } from '@/app/types/household'
import AuthStatus from '@/app/components/AuthStatus'
import { routes } from '@/app/config'

function InvitePageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const invitationId = searchParams.get('id')

  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState(getCurrentUser())
  const [invitation, setInvitation] = useState<HouseholdInvitation | null>(null)
  const [inviterEmail, setInviterEmail] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [accepting, setAccepting] = useState(false)
  const [accepted, setAccepted] = useState(false)

  // Subscribe to auth state
  useEffect(() => {
    const unsubscribe = subscribeToAuthState((authUser) => {
      setUser(authUser)
    })
    return unsubscribe
  }, [])

  // Load invitation when user is logged in
  useEffect(() => {
    if (!invitationId) {
      setError('קישור הזמנה לא תקין')
      setLoading(false)
      return
    }

    if (!user) {
      setLoading(false)
      return
    }

    loadInvitation()
  }, [invitationId, user])

  const loadInvitation = async () => {
    if (!invitationId) return

    setLoading(true)
    setError(null)

    try {
      const result = await getPendingInvitation(invitationId)
      if (result.success && result.invitation) {
        setInvitation(result.invitation)
        setInviterEmail(result.inviterEmail || null)
      } else {
        setError(result.error || 'שגיאה בטעינת ההזמנה')
      }
    } catch (err) {
      console.error('[InvitePage] Error loading invitation:', err)
      setError('שגיאה בטעינת ההזמנה')
    } finally {
      setLoading(false)
    }
  }

  const handleAccept = async () => {
    if (!invitationId) return

    setAccepting(true)
    setError(null)

    try {
      const result = await acceptInvitation(invitationId)
      if (result.success) {
        // Refresh token to get new claims
        await refreshIdToken()
        setAccepted(true)
      } else {
        setError(result.error || 'שגיאה בקבלת ההזמנה')
      }
    } catch (err) {
      console.error('[InvitePage] Error accepting invitation:', err)
      setError('שגיאה בקבלת ההזמנה')
    } finally {
      setAccepting(false)
    }
  }

  const handleGoToSync = () => {
    router.push(`${routes.settings}?tab=sync`)
  }

  const handleGoHome = () => {
    router.push(routes.home)
  }

  // Not logged in
  if (!user) {
    return (
      <div className="tool-page" dir="rtl">
        <div className="card" style={{ maxWidth: '500px', margin: '2rem auto' }}>
          <header>
            <h1>הזמנה למשק בית</h1>
          </header>

          <section
            style={{
              padding: '1.5rem',
              background: '#fefce8',
              borderRadius: '0.75rem',
              marginBottom: '1.5rem',
              border: '1px solid #fef08a',
            }}
          >
            <p style={{ margin: 0, fontSize: '1rem', color: '#854d0e' }}>
              יש להתחבר כדי לקבל את ההזמנה
            </p>
          </section>

          <AuthStatus />
        </div>
      </div>
    )
  }

  // Loading
  if (loading) {
    return (
      <div className="tool-page" dir="rtl">
        <div className="card" style={{ maxWidth: '500px', margin: '2rem auto', textAlign: 'center' }}>
          <p style={{ padding: '2rem' }}>טוען...</p>
        </div>
      </div>
    )
  }

  // Error
  if (error && !invitation) {
    return (
      <div className="tool-page" dir="rtl">
        <div className="card" style={{ maxWidth: '500px', margin: '2rem auto' }}>
          <header>
            <h1>הזמנה למשק בית</h1>
          </header>

          <section
            style={{
              padding: '1.5rem',
              background: '#fef2f2',
              borderRadius: '0.75rem',
              marginBottom: '1.5rem',
              border: '1px solid #fecaca',
            }}
          >
            <p style={{ margin: 0, fontSize: '1rem', color: '#991b1b' }}>{error}</p>
          </section>

          <button onClick={handleGoHome} className="file-picker">
            חזור לדף הבית
          </button>
        </div>
      </div>
    )
  }

  // Accepted successfully
  if (accepted) {
    return (
      <div className="tool-page" dir="rtl">
        <div className="card" style={{ maxWidth: '500px', margin: '2rem auto' }}>
          <header>
            <h1>הצטרפת למשק הבית!</h1>
          </header>

          <section
            style={{
              padding: '1.5rem',
              background: '#f0fdf4',
              borderRadius: '0.75rem',
              marginBottom: '1.5rem',
              border: '1px solid #bbf7d0',
            }}
          >
            <p style={{ margin: '0 0 1rem', fontSize: '1rem', color: '#166534' }}>
              הצטרפת בהצלחה למשק הבית.
            </p>
            <p style={{ margin: 0, fontSize: '0.9rem', color: '#15803d' }}>
              <strong>השלב הבא:</strong> קבל מהשותף/ה את סיסמת ההצפנה, ואז עבור להגדרות סנכרון כדי להוריד את
              הנתונים המשותפים.
            </p>
          </section>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button onClick={handleGoToSync} className="file-picker" style={{ flex: 1 }}>
              עבור להגדרות סנכרון
            </button>
            <button onClick={handleGoHome} className="file-picker secondary" style={{ flex: 1 }}>
              חזור לדף הבית
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Show invitation details
  return (
    <div className="tool-page" dir="rtl">
      <div className="card" style={{ maxWidth: '500px', margin: '2rem auto' }}>
        <header>
          <h1>הזמנה למשק בית</h1>
        </header>

        <section
          style={{
            padding: '1.5rem',
            background: '#f0f9ff',
            borderRadius: '0.75rem',
            marginBottom: '1.5rem',
            border: '1px solid #bae6fd',
          }}
        >
          <p style={{ margin: '0 0 0.5rem', fontSize: '1rem', color: '#0369a1' }}>
            <strong>{inviterEmail || 'מישהו'}</strong> מזמין אותך להצטרף למשק הבית שלהם
          </p>
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#0284c7' }}>
            לאחר ההצטרפות, תוכלו לשתף נתונים פיננסיים מוצפנים.
          </p>
        </section>

        {invitation && (
          <section
            style={{
              padding: '1rem',
              background: '#fafafa',
              borderRadius: '0.5rem',
              marginBottom: '1.5rem',
              fontSize: '0.9rem',
            }}
          >
            <p style={{ margin: '0 0 0.25rem' }}>
              <strong>אימייל מוזמן:</strong> {invitation.inviteeEmail}
            </p>
            <p style={{ margin: '0 0 0.25rem' }}>
              <strong>תוקף:</strong> {new Date(invitation.expiresAt).toLocaleDateString('he-IL')}
            </p>
          </section>
        )}

        {error && (
          <div
            style={{
              padding: '0.75rem',
              background: '#fef2f2',
              borderRadius: '0.5rem',
              marginBottom: '1rem',
              color: '#991b1b',
              fontSize: '0.9rem',
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            padding: '1rem',
            background: '#fefce8',
            borderRadius: '0.5rem',
            marginBottom: '1.5rem',
            border: '1px solid #fef08a',
          }}
        >
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#854d0e' }}>
            <strong>שים לב:</strong> לאחר ההצטרפות, תצטרך לקבל את סיסמת ההצפנה מהשותף/ה כדי לגשת לנתונים
            המשותפים.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={handleAccept}
            disabled={accepting}
            className="file-picker"
            style={{ flex: 1, fontSize: '1rem' }}
          >
            {accepting ? 'מצטרף...' : 'הצטרף למשק הבית'}
          </button>
          <button onClick={handleGoHome} className="file-picker secondary" style={{ flex: 1 }}>
            ביטול
          </button>
        </div>
      </div>
    </div>
  )
}

export default function InvitePage() {
  return (
    <Suspense
      fallback={
        <div className="tool-page" dir="rtl">
          <div className="card" style={{ maxWidth: '500px', margin: '2rem auto', textAlign: 'center' }}>
            <p style={{ padding: '2rem' }}>טוען...</p>
          </div>
        </div>
      }
    >
      <InvitePageContent />
    </Suspense>
  )
}
