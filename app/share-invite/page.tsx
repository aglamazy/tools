'use client'

import React, { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { getCurrentUser, subscribeToAuthState, refreshIdToken } from '@/app/services/firebaseAuthService'
import { acceptShareInvitation } from '@/app/services/businessShareService'
import { saveSharedPassword } from '@/app/services/sharedBusinessSyncService'
import { db } from '@/app/db/financeDB'
import { BusinessType } from '@/app/types/business'
import AuthStatus from '@/app/components/AuthStatus'
import { routes } from '@/app/config'

function ShareInviteContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const invitationId = searchParams.get('id')

  const [user, setUser] = useState(getCurrentUser())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [accepting, setAccepting] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [businessName, setBusinessName] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [businessSyncId, setBusinessSyncId] = useState<string | null>(null)

  useEffect(() => {
    const unsubscribe = subscribeToAuthState((authUser) => setUser(authUser))
    return unsubscribe
  }, [])

  // Load invitation details
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
      // Fetch invitation details via Firestore client SDK
      const { doc, getDoc } = await import('firebase/firestore')
      const { getFirebaseFirestore } = await import('@/app/lib/firebase')
      const firestore = getFirebaseFirestore()
      const invDoc = await getDoc(doc(firestore, 'businessShareInvitations', invitationId))

      if (!invDoc.exists()) {
        setError('הזמנה לא נמצאה')
      } else {
        const data = invDoc.data()
        setBusinessName(data.businessName || null)
        setBusinessSyncId(data.businessSyncId || null)

        if (data.status !== 'pending') {
          setError('הזמנה כבר נוצלה או בוטלה')
        }
      }
    } catch (err) {
      console.error('[ShareInvite] Error loading invitation:', err)
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
      const result = await acceptShareInvitation(invitationId)
      if (result.success) {
        await refreshIdToken()

        // Save the shared encryption password
        if (password && businessSyncId) {
          await saveSharedPassword(businessSyncId, password)
        }

        // Create the business record in local DB immediately
        if (businessSyncId && businessName) {
          const exists = await db.businesses.where('syncId').equals(businessSyncId).first()
          if (!exists) {
            const newId = await db.businesses.add({
              name: businessName,
              syncId: businessSyncId,
              type: BusinessType.Business,
              sharedWithMe: true,
              pinnedToSidebar: true,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            })
            router.push(`/app/business/${newId}`)
            return
          } else {
            router.push(`/app/business/${exists.id}`)
            return
          }
        }

        setAccepted(true)
      } else {
        setError(result.error || 'שגיאה בקבלת ההזמנה')
      }
    } catch (err) {
      console.error('[ShareInvite] Error accepting:', err)
      setError('שגיאה בקבלת ההזמנה')
    } finally {
      setAccepting(false)
    }
  }

  const handleGoToSync = () => router.push(`${routes.settings}?tab=sync`)
  const handleGoHome = () => router.push(routes.home)

  if (!user) {
    return (
      <div className="tool-page" dir="rtl">
        <div className="card" style={{ maxWidth: '500px', margin: '2rem auto' }}>
          <header><h1>הזמנה לשיתוף עסק</h1></header>
          <section style={{ padding: '1.5rem', background: '#fefce8', borderRadius: '0.75rem', marginBottom: '1.5rem', border: '1px solid #fef08a' }}>
            <p style={{ margin: 0, fontSize: '1rem', color: '#854d0e' }}>יש להתחבר כדי לקבל את ההזמנה</p>
          </section>
          <AuthStatus />
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="tool-page" dir="rtl">
        <div className="card" style={{ maxWidth: '500px', margin: '2rem auto', textAlign: 'center' }}>
          <p style={{ padding: '2rem' }}>טוען...</p>
        </div>
      </div>
    )
  }

  if (error && !businessName) {
    return (
      <div className="tool-page" dir="rtl">
        <div className="card" style={{ maxWidth: '500px', margin: '2rem auto' }}>
          <header><h1>הזמנה לשיתוף עסק</h1></header>
          <section style={{ padding: '1.5rem', background: '#fef2f2', borderRadius: '0.75rem', marginBottom: '1.5rem', border: '1px solid #fecaca' }}>
            <p style={{ margin: 0, fontSize: '1rem', color: '#991b1b' }}>{error}</p>
          </section>
          <button onClick={handleGoHome} className="file-picker">חזור לדף הבית</button>
        </div>
      </div>
    )
  }

  if (accepted) {
    return (
      <div className="tool-page" dir="rtl">
        <div className="card" style={{ maxWidth: '500px', margin: '2rem auto' }}>
          <header><h1>התקבל שיתוף עסק!</h1></header>
          <section style={{ padding: '1.5rem', background: '#f0fdf4', borderRadius: '0.75rem', marginBottom: '1.5rem', border: '1px solid #bbf7d0' }}>
            <p style={{ margin: '0 0 1rem', fontSize: '1rem', color: '#166534' }}>
              העסק <strong>{businessName}</strong> שותף איתך בהצלחה.
            </p>
            <p style={{ margin: 0, fontSize: '0.9rem', color: '#15803d' }}>
              <strong>השלב הבא:</strong> עבור להגדרות סנכרון כדי לסנכרן את נתוני העסק.
            </p>
          </section>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button onClick={handleGoToSync} className="file-picker" style={{ flex: 1 }}>עבור לסנכרון</button>
            <button onClick={handleGoHome} className="file-picker secondary" style={{ flex: 1 }}>חזור לדף הבית</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="tool-page" dir="rtl">
      <div className="card" style={{ maxWidth: '500px', margin: '2rem auto' }}>
        <header><h1>הזמנה לשיתוף עסק</h1></header>

        <section style={{ padding: '1.5rem', background: '#f0f9ff', borderRadius: '0.75rem', marginBottom: '1.5rem', border: '1px solid #bae6fd' }}>
          <p style={{ margin: '0 0 0.5rem', fontSize: '1rem', color: '#0369a1' }}>
            קיבלת הזמנה לשיתוף העסק <strong>{businessName}</strong>
          </p>
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#0284c7' }}>
            לאחר האישור, תוכל לגשת לנתוני העסק ולעבוד עליהם ביחד.
          </p>
        </section>

        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', fontWeight: 500, fontSize: '0.9rem', marginBottom: '0.5rem' }}>
            סיסמת הצפנה (קבל מהמשתף):
          </label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="סיסמת הצפנה לעסק המשותף"
            style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', fontSize: '0.9rem', boxSizing: 'border-box' }}
          />
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: '#64748b' }}>
            הסיסמה נדרשת כדי לפענח את נתוני העסק המשותף
          </p>
        </div>

        {error && (
          <div style={{ padding: '0.75rem', background: '#fef2f2', borderRadius: '0.5rem', marginBottom: '1rem', color: '#991b1b', fontSize: '0.9rem' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button onClick={handleAccept} disabled={accepting} className="file-picker" style={{ flex: 1, fontSize: '1rem' }}>
            {accepting ? 'מאשר...' : 'אשר שיתוף'}
          </button>
          <button onClick={handleGoHome} className="file-picker secondary" style={{ flex: 1 }}>ביטול</button>
        </div>
      </div>
    </div>
  )
}

export default function ShareInvitePage() {
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
      <ShareInviteContent />
    </Suspense>
  )
}
