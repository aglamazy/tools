'use client'

import React, { useEffect, useState } from 'react'
import {
  inviteToShare,
  revokeShare,
  cancelShareInvitation,
  updateSharePercent,
  updateInvitationPercent,
  type BusinessShare,
  type BusinessShareInvitation,
} from '@/app/services/businessShareService'
import { partnerStore } from '@/app/stores/partnerStore'
import Modal from '@/app/components/Modal'
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
  ownerLabel: string
  ownerSharePercent: number | undefined
  onEditOwner: () => void
}

export default function BusinessSharingSection({ business, ownerLabel, ownerSharePercent, onEditOwner }: Props) {
  // Shares + invitations come from partnerStore (cached in localStorage). Initial render uses
  // the cache synchronously, then a background refresh updates everyone via subscribe.
  const [shares, setShares] = useState<BusinessShare[]>(() =>
    typeof window !== 'undefined' ? partnerStore.getCachedShares(business.syncId) : []
  )
  const [pendingInvitations, setPendingInvitations] = useState<BusinessShareInvitation[]>(() =>
    typeof window !== 'undefined' ? partnerStore.getCachedInvitations(business.syncId) : []
  )
  // Track whether partner data has been loaded at least once for this business —
  // suppresses the "must be 100%" warning during the brief window before refresh() lands.
  const [partnersLoaded, setPartnersLoaded] = useState(() =>
    typeof window !== 'undefined' && business.syncId !== undefined
      ? partnerStore.getCachedShares(business.syncId).length > 0
        || partnerStore.getCachedInvitations(business.syncId).length > 0
      : false
  )
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [needsPassword, setNeedsPassword] = useState(false)
  const [status, setStatus] = useState<{ type: 'idle' | 'success' | 'error'; message: string }>({ type: 'idle', message: '' })
  const [loading, setLoading] = useState(false)
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [invitePercent, setInvitePercent] = useState<string>('')
  const [showInviteForm, setShowInviteForm] = useState(false)
  // Modal state for editing % on a single share or invitation
  const [editingTarget, setEditingTarget] = useState<{ kind: 'share' | 'invitation'; id: string; label: string; current: number | undefined } | null>(null)
  const [editingValue, setEditingValue] = useState<string>('')

  useEffect(() => {
    if (!business.syncId) return
    const syncId = business.syncId
    // Initial sync read — cached values land in state immediately for instant render.
    setShares(partnerStore.getCachedShares(syncId))
    setPendingInvitations(partnerStore.getCachedInvitations(syncId))
    // Subscribe to cache updates so this component re-renders when refresh() lands fresh data.
    const unsubStore = partnerStore.subscribe(() => {
      setShares(partnerStore.getCachedShares(syncId))
      setPendingInvitations(partnerStore.getCachedInvitations(syncId))
    })
    // Wait for Firebase auth to be ready before triggering a refresh + checking shared-password state.
    const unsubAuth = subscribeToAuthState((user) => {
      if (user) {
        void partnerStore.refresh(syncId).then(() => setPartnersLoaded(true))
        getSharedPassword(syncId).then(p => { if (!p) setNeedsPassword(true) })
        unsubAuth()
      }
    })
    return () => { unsubStore(); unsubAuth() }
  }, [business.id, business.syncId])

  // Default the invite-form % to an equal split based on current participant count.
  useEffect(() => {
    const participantCount = 1 + shares.length + pendingInvitations.length + 1
    setInvitePercent(String(Math.floor(100 / participantCount)))
  }, [shares.length, pendingInvitations.length])

  // After any mutation (invite/revoke/cancel/update %), call this to repopulate from the source of truth.
  const refreshShares = () => { void partnerStore.refresh(business.syncId) }

  const openEditModal = (kind: 'share' | 'invitation', id: string, label: string, current: number | undefined) => {
    setEditingTarget({ kind, id, label, current })
    setEditingValue(String(current ?? ''))
  }

  const handleSaveEditedPercent = async () => {
    if (!editingTarget) return
    const n = Number(editingValue)
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      setStatus({ type: 'error', message: 'אחוז חייב להיות בין 0 ל-100' })
      return
    }
    setLoading(true)
    try {
      const result = editingTarget.kind === 'share'
        ? await updateSharePercent(editingTarget.id, n)
        : await updateInvitationPercent(editingTarget.id, n)
      if (result.success) {
        setStatus({ type: 'success', message: 'אחוז שותפות עודכן' })
        setEditingTarget(null)
        refreshShares()
      } else {
        setStatus({ type: 'error', message: result.error || 'שגיאה' })
      }
    } finally {
      setLoading(false)
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
      const percentNum = invitePercent.trim() === '' ? undefined : Number(invitePercent)
      const validPercent = typeof percentNum === 'number' && Number.isFinite(percentNum) && percentNum >= 0 && percentNum <= 100
        ? percentNum
        : undefined
      const result = await inviteToShare(business.syncId, business.name, email.trim(), validPercent)
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
      setShowInviteForm(false)
      refreshShares()
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
        refreshShares()
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
        refreshShares()
      } else {
        setStatus({ type: 'error', message: result.error || 'שגיאה' })
      }
    } finally {
      setLoading(false)
    }
  }

  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: '0.5rem',
    padding: '0.5rem 0.75rem', background: '#fff', borderRadius: '0.375rem',
    border: '1px solid #e2e8f0', marginBottom: '0.25rem', fontSize: '0.9rem',
  }
  const pencilBtn: React.CSSProperties = {
    padding: '0.2rem 0.5rem', fontSize: '0.85rem', borderRadius: '0.25rem',
    border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer',
  }
  const revokeBtn: React.CSSProperties = {
    padding: '0.2rem 0.55rem', fontSize: '0.75rem', borderRadius: '0.25rem',
    border: '1px solid #fca5a5', background: '#fef2f2', color: '#dc2626', cursor: 'pointer',
  }

  return (
    <section style={{ padding: '1rem', border: '1px solid #e2e8f0', borderRadius: '0.75rem' }}>
      <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600 }}>שותפים</h3>

      {/* Owner row — show 100% when unset (matches the Splid math default). */}
      <div style={rowStyle}>
        <span style={{ flex: 1 }}>
          {ownerLabel || 'לא משויך'}
          <span style={{ color: '#64748b', marginInlineStart: '0.5rem' }}>· {ownerSharePercent ?? 100}%</span>
        </span>
        <button onClick={onEditOwner} disabled={loading} title="ערוך בעלים ואחוז" style={pencilBtn}>✏️</button>
      </div>

      {/* Active shares */}
      {shares.map(share => (
        <div key={share.id} style={rowStyle}>
          <span style={{ flex: 1 }}>
            {share.sharedWithDisplayName || share.sharedWithEmail}
            <span style={{ color: '#64748b', marginInlineStart: '0.5rem' }}>
              · {share.sharePercent != null ? `${share.sharePercent}%` : '—'}
            </span>
          </span>
          <button
            onClick={() => openEditModal('share', share.id, share.sharedWithDisplayName || share.sharedWithEmail, share.sharePercent)}
            disabled={loading}
            title="ערוך אחוז שותפות"
            style={pencilBtn}
          >
            ✏️
          </button>
          <button onClick={() => void handleRevoke(share.id)} disabled={loading} style={revokeBtn}>
            בטל שיתוף
          </button>
        </div>
      ))}

      {/* Pending invitations */}
      {pendingInvitations.map(inv => (
        <div key={inv.id} style={{ ...rowStyle, background: '#fefce8', borderColor: '#fde047' }}>
          <span style={{ flex: 1 }}>
            {inv.inviteeEmail}
            <span style={{ color: '#a16207', marginInlineStart: '0.5rem' }}>
              · {inv.sharePercent != null ? `${inv.sharePercent}%` : '—'}
            </span>
            <span style={{ color: '#a16207', marginInlineStart: '0.5rem', fontSize: '0.75rem' }}>(ממתין לאישור)</span>
          </span>
          <button
            onClick={() => openEditModal('invitation', inv.id, inv.inviteeEmail, inv.sharePercent)}
            disabled={loading}
            title="ערוך אחוז שותפות"
            style={pencilBtn}
          >
            ✏️
          </button>
          <button onClick={() => void handleCancelInvitation(inv.id)} disabled={loading} style={revokeBtn}>
            בטל הזמנה
          </button>
        </div>
      ))}

      {/* Edit-percent modal */}
      <Modal isOpen={editingTarget !== null} onClose={() => setEditingTarget(null)} maxWidth="400px">
        {editingTarget && (
          <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>אחוז שותפות</h3>
            <div style={{ fontSize: '0.85rem', color: '#64748b' }}>{editingTarget.label}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={editingValue}
                onChange={e => setEditingValue(e.target.value)}
                autoFocus
                style={{ flex: 1, padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', fontSize: '0.95rem', textAlign: 'center' }}
              />
              <span style={{ fontSize: '0.9rem', color: '#64748b' }}>%</span>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setEditingTarget(null)}
                disabled={loading}
                style={{
                  padding: '0.5rem 1rem', fontSize: '0.85rem', borderRadius: '0.375rem',
                  border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer',
                }}
              >
                ביטול
              </button>
              <button
                onClick={() => void handleSaveEditedPercent()}
                disabled={loading}
                className="file-picker"
                style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
              >
                שמור
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Total share % — only show when it's wrong AND partners have loaded
          (otherwise the warning flashes during the load before shares arrive). */}
      {partnersLoaded && (() => {
        const ownerPct = business.ownerSharePercent ?? 100
        const sharesPct = shares.reduce((sum, s) => sum + (s.sharePercent ?? 0), 0)
        const invitesPct = pendingInvitations.reduce((sum, i) => sum + (i.sharePercent ?? 0), 0)
        const total = ownerPct + sharesPct + invitesPct
        if (total === 100) return null
        return (
          <div style={{
            marginTop: '0.5rem', padding: '0.4rem 0.75rem',
            background: '#fef2f2', border: '1px solid #fca5a5',
            borderRadius: '0.375rem', fontSize: '0.8rem', color: '#dc2626',
          }}>
            סה״כ אחוזי שותפות: {total}% — חייב להיות 100%
          </div>
        )
      })()}

      {/* Add partner — collapsed by default */}
      {!showInviteForm ? (
        <button
          onClick={() => setShowInviteForm(true)}
          disabled={!business.syncId}
          title={business.syncId ? '' : 'העסק לא מסונכרן — יש לסנכרן קודם'}
          style={{
            marginTop: '0.5rem', padding: '0.5rem 0.85rem', fontSize: '0.85rem',
            borderRadius: '0.375rem', border: '1px dashed #94a3b8',
            background: 'transparent', color: '#475569',
            cursor: business.syncId ? 'pointer' : 'not-allowed',
          }}
        >
          + הוסף שותף
        </button>
      ) : (
        <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="אימייל של השותף"
              style={{ flex: 1, padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', fontSize: '0.9rem' }}
            />
            <input
              type="number" min={0} max={100} step={1}
              value={invitePercent}
              onChange={e => setInvitePercent(e.target.value)}
              placeholder="%" title="אחוז שותפות"
              style={{ width: '70px', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', fontSize: '0.9rem', textAlign: 'center' }}
            />
            <button onClick={() => void handleInvite()} disabled={loading} className="file-picker" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
              הזמן
            </button>
            <button
              onClick={() => { setShowInviteForm(false); setEmail(''); setStatus({ type: 'idle', message: '' }) }}
              disabled={loading}
              style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem', borderRadius: '0.375rem', border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}
            >
              ביטול
            </button>
          </div>
          {needsPassword && (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="password" value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="סיסמת הצפנה לשיתוף"
                style={{ flex: 1, padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', fontSize: '0.9rem' }}
              />
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>השותף יזדקק לסיסמה זו</span>
            </div>
          )}
          {status.message && (
            <span style={{ fontSize: '0.8rem', color: status.type === 'success' ? '#16a34a' : status.type === 'error' ? '#dc2626' : '#64748b' }}>
              {status.message}
            </span>
          )}
          {inviteLink && (
            <div style={{
              display: 'flex', gap: '0.5rem', alignItems: 'center',
              padding: '0.4rem 0.6rem', background: '#f0f9ff', borderRadius: '0.375rem',
              border: '1px solid #bae6fd', fontSize: '0.75rem',
            }}>
              <input readOnly value={inviteLink} onFocus={e => e.target.select()}
                style={{ flex: 1, border: 'none', background: 'transparent', fontSize: '0.75rem', direction: 'ltr' }} />
              <button
                onClick={() => { void navigator.clipboard.writeText(inviteLink); setStatus({ type: 'success', message: 'הקישור הועתק' }) }}
                style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem', border: '1px solid #d1d5db', borderRadius: '0.25rem', background: '#fff', cursor: 'pointer' }}
              >העתק</button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
