'use client'

import React, { useEffect, useState } from 'react'
import {
  inviteToShare,
  revokeShare,
  cancelShareInvitation,
  listShares,
  type BusinessShare,
  type BusinessShareInvitation,
} from '@/app/services/businessShareService'
import {
  setupSharedPassword,
  getSharedPassword,
  saveSharedPassword,
  syncSharedBusiness,
} from '@/app/services/sharedBusinessSyncService'
import type { Business } from '@/app/db/financeDB'
import { refreshIdToken, subscribeToAuthState } from '@/app/services/firebaseAuthService'
import { sendEmail, hasGmailAccess } from '@/app/services/gmailService'

type Props = {
  business: Business
}

export default function BusinessSharingSection({ business }: Props) {
  const [shares, setShares] = useState<BusinessShare[]>([])
  const [pendingInvitations, setPendingInvitations] = useState<BusinessShareInvitation[]>([])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [needsPassword, setNeedsPassword] = useState(false)
  const [status, setStatus] = useState<{ type: 'idle' | 'success' | 'error'; message: string }>({ type: 'idle', message: '' })
  const [loading, setLoading] = useState(false)
  const [inviteLink, setInviteLink] = useState<string | null>(null)

  useEffect(() => {
    if (!business.syncId) return
    // Wait for Firebase auth to be ready before loading shares
    const unsub = subscribeToAuthState((user) => {
      if (user) {
        void loadShares()
        getSharedPassword(business.syncId!).then(p => { if (!p) setNeedsPassword(true) })
        unsub()
      }
    })
    return unsub
  }, [business.id, business.syncId])

  const loadShares = async () => {
    const result = await listShares()
    console.log('[BusinessSharing] listShares result:', result)
    if (result.success) {
      const bizSyncId = business.syncId
      setShares((result.ownedShares || []).filter(s => s.businessSyncId === bizSyncId))
      setPendingInvitations((result.pendingInvitations || []).filter(i => i.businessSyncId === bizSyncId))
    }
  }

  const handleInvite = async () => {
    if (!email.trim()) {
      setStatus({ type: 'error', message: 'נדרש אימייל' })
      return
    }
    if (!business.syncId) {
      setStatus({ type: 'error', message: 'העסק לא מסונכרן — יש לסנכרן קודם' })
      return
    }

    // Check if shared password exists for this business, if not require it
    const existingPassword = await getSharedPassword(business.syncId)
    if (!existingPassword && !password.trim()) {
      setNeedsPassword(true)
      setStatus({ type: 'error', message: 'יש להגדיר סיסמת הצפנה לשיתוף' })
      return
    }

    setLoading(true)
    try {
      // 1. Create the invitation (also sets owner's sharedBusinesses claim)
      const result = await inviteToShare(business.syncId, business.name, email.trim())
      if (!result.success) {
        setStatus({ type: 'error', message: result.error || 'שגיאה' })
        setLoading(false)
        return
      }

      // 2. Refresh token to pick up the new sharedBusinesses claim
      await refreshIdToken()

      // 3. Setup shared encryption password if needed (requires the claim for storage access)
      const sharePassword = existingPassword || password
      if (!existingPassword && sharePassword) {
        const setupResult = await setupSharedPassword(business.syncId, sharePassword)
        if (!setupResult.success) {
          setStatus({ type: 'error', message: setupResult.error || 'שגיאה בהגדרת סיסמה' })
          setLoading(false)
          return
        }
        await saveSharedPassword(business.syncId, sharePassword)
      }

      // Send invitation email via Gmail
      const link = `${window.location.origin}/share-invite?id=${result.invitationId}`
      setInviteLink(link)

      const canSendEmail = await hasGmailAccess()
      if (canSendEmail) {
        const emailResult = await sendEmail(
          email.trim(),
          `הזמנה לשיתוף עסק — ${business.name}`,
          `<div dir="rtl" style="font-family: sans-serif; max-width: 500px;">
            <h2>הוזמנת לשיתוף עסק</h2>
            <p>הוזמנת לשתף את העסק <strong>${business.name}</strong> באפליקציית Aglamazo.</p>
            <p>לחץ על הקישור כדי לקבל את ההזמנה:</p>
            <p><a href="${link}" style="display: inline-block; padding: 0.75rem 1.5rem; background: #3b82f6; color: white; text-decoration: none; border-radius: 0.5rem; font-weight: 600;">קבל הזמנה</a></p>
            <p style="color: #64748b; font-size: 0.85rem;">אם אין לך חשבון עדיין, תוכל להירשם דרך הקישור.</p>
          </div>`,
        )
        if (emailResult.success) {
          setStatus({ type: 'success', message: 'הזמנה נשלחה במייל' })
        } else {
          setStatus({ type: 'success', message: 'הזמנה נוצרה — לא הצלחתי לשלוח מייל, שלח את הקישור ידנית' })
        }
      } else {
        setStatus({ type: 'success', message: 'הזמנה נוצרה — שלח את הקישור למוזמן' })
      }

      setEmail('')
      setPassword('')
      setNeedsPassword(false)
      void loadShares()
    } finally {
      setLoading(false)
    }
  }

  const handleCancelInvitation = async (invitationId: string) => {
    setLoading(true)
    try {
      const result = await cancelShareInvitation(invitationId)
      if (result.success) {
        setStatus({ type: 'success', message: 'הזמנה בוטלה' })
        setInviteLink(null)
        void loadShares()
      } else {
        setStatus({ type: 'error', message: result.error || 'שגיאה' })
      }
    } finally {
      setLoading(false)
    }
  }

  const handleRevoke = async (shareId: string) => {
    setLoading(true)
    try {
      const result = await revokeShare(shareId)
      if (result.success) {
        setStatus({ type: 'success', message: 'שיתוף בוטל' })
        void loadShares()
      } else {
        setStatus({ type: 'error', message: result.error || 'שגיאה' })
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <section style={{ padding: '1rem', border: '1px solid #e2e8f0', borderRadius: '0.75rem', background: '#f0fdf4' }}>
      <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 600 }}>שיתוף עסק</h3>
      <p style={{ margin: '0 0 1rem', color: '#166534', fontSize: '0.85rem' }}>
        שתף עסק זה עם משתמש חיצוני — הוא יקבל גישה מלאה לנתוני העסק
      </p>

      {/* Active shares */}
      {shares.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontWeight: 500, fontSize: '0.9rem', marginBottom: '0.5rem' }}>משותף עם:</div>
          {shares.map(share => (
            <div key={share.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0.5rem 0.75rem', background: '#fff', borderRadius: '0.375rem',
              border: '1px solid #d1d5db', marginBottom: '0.25rem',
            }}>
              <span style={{ fontSize: '0.9rem' }}>{share.sharedWithEmail}</span>
              <button
                onClick={() => void handleRevoke(share.id)}
                disabled={loading}
                style={{
                  padding: '0.25rem 0.75rem', fontSize: '0.8rem', borderRadius: '0.25rem',
                  border: '1px solid #fca5a5', background: '#fef2f2', color: '#dc2626', cursor: 'pointer',
                }}
              >
                בטל שיתוף
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Pending invitations */}
      {pendingInvitations.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontWeight: 500, fontSize: '0.9rem', marginBottom: '0.5rem', color: '#a16207' }}>הזמנות ממתינות:</div>
          {pendingInvitations.map(inv => (
            <div key={inv.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0.5rem 0.75rem', background: '#fefce8', borderRadius: '0.375rem',
              border: '1px solid #fde047', marginBottom: '0.25rem', fontSize: '0.85rem',
            }}>
              <span>{inv.inviteeEmail} — ממתין לאישור</span>
              <button
                onClick={() => void handleCancelInvitation(inv.id)}
                disabled={loading}
                style={{
                  padding: '0.2rem 0.5rem', fontSize: '0.75rem', borderRadius: '0.25rem',
                  border: '1px solid #fca5a5', background: '#fef2f2', color: '#dc2626', cursor: 'pointer',
                }}
              >
                בטל
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Invite form */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="אימייל של השותף"
            style={{ flex: 1, padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', fontSize: '0.9rem' }}
          />
          <button
            onClick={() => void handleInvite()}
            disabled={loading}
            className="file-picker"
            style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}
          >
            הזמן
          </button>
        </div>

        {needsPassword && (
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="סיסמת הצפנה לשיתוף"
              style={{ flex: 1, padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', fontSize: '0.9rem' }}
            />
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>השותף יזדקק לסיסמה זו</span>
          </div>
        )}

        {status.message && (
          <span style={{
            fontSize: '0.85rem',
            color: status.type === 'success' ? '#16a34a' : status.type === 'error' ? '#dc2626' : '#64748b',
          }}>
            {status.message}
          </span>
        )}

        {inviteLink && (
          <div style={{
            display: 'flex', gap: '0.5rem', alignItems: 'center',
            padding: '0.5rem 0.75rem', background: '#f0f9ff', borderRadius: '0.375rem',
            border: '1px solid #bae6fd', fontSize: '0.8rem',
          }}>
            <input
              readOnly
              value={inviteLink}
              style={{ flex: 1, border: 'none', background: 'transparent', fontSize: '0.8rem', direction: 'ltr' }}
              onFocus={e => e.target.select()}
            />
            <button
              onClick={() => { void navigator.clipboard.writeText(inviteLink); setStatus({ type: 'success', message: 'הקישור הועתק' }) }}
              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', border: '1px solid #d1d5db', borderRadius: '0.25rem', background: '#fff', cursor: 'pointer' }}
            >
              העתק
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
