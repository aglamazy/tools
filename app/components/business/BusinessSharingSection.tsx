'use client'

/**
 * Business sharing UI.
 *
 * Data model (current — see businessShareService.ts):
 *   - BusinessPartner       — durable identity + share %. Each partner gets a row.
 *   - BusinessShareInvitation — pending link, attached to a partner via partnerId.
 *   - BusinessAccessGrant   — current uid binding for a partner. Drives whether
 *                              the partner actually has access right now.
 *
 * Each row in the UI is a partner. The row's "access state" is derived:
 *   grant present  → ✓ נגיש          + 🚫 בטל גישה
 *   no grant, pending invite → 📧 הזמנה ממתינה + 📋 העתק קישור + ✖ בטל הזמנה
 *   no grant, no invite      → 📤 שלח הזמנה
 * "🔗 חדש קישור" is always available — creates a fresh invitation (cancels stale).
 * "🗑 הסר שותף" deletes the partner entirely, freeing their % back to the owner.
 */

import React, { useEffect, useMemo, useState } from 'react'
import {
  sendInvite,
  removePartner,
  revokeAccess,
  cancelShareInvitation,
  updatePartner,
  type BusinessPartner,
  type BusinessShareInvitation,
  type BusinessAccessGrant,
} from '@/app/services/businessShareService'
import { partnerStore } from '@/app/stores/partnerStore'
import Modal from '@/app/components/Modal'
import {
  setupSharedPassword,
  getSharedPassword,
  saveSharedPassword,
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
  // ---------------------------------------------------------------------------
  // Cache reads — first paint comes from localStorage, then refresh() updates.
  // ---------------------------------------------------------------------------
  const [partners, setPartners] = useState<BusinessPartner[]>(() =>
    typeof window !== 'undefined' ? partnerStore.getCachedPartners(business.syncId) : []
  )
  const [invitations, setInvitations] = useState<BusinessShareInvitation[]>(() =>
    typeof window !== 'undefined' ? partnerStore.getCachedInvitations(business.syncId) : []
  )
  const [grants, setGrants] = useState<BusinessAccessGrant[]>(() =>
    typeof window !== 'undefined' ? partnerStore.getCachedGrants(business.syncId) : []
  )
  // Track whether partner data has been loaded at least once for this business —
  // suppresses the "must be 100%" warning during the brief window before refresh() lands.
  const [partnersLoaded, setPartnersLoaded] = useState(() =>
    typeof window !== 'undefined' && business.syncId !== undefined
      ? partnerStore.getCachedPartners(business.syncId).length > 0
        || partnerStore.getCachedInvitations(business.syncId).length > 0
      : false
  )

  // ---------------------------------------------------------------------------
  // Add-partner form state
  // ---------------------------------------------------------------------------
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [needsPassword, setNeedsPassword] = useState(false)
  const [status, setStatus] = useState<{ type: 'idle' | 'success' | 'error'; message: string }>({ type: 'idle', message: '' })
  const [loading, setLoading] = useState(false)
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [pendingEmail, setPendingEmail] = useState<{ to: string; businessName: string; kind: 'first' | 'reconnect' } | null>(null)
  const [invitePercent, setInvitePercent] = useState<string>('')
  const [showInviteForm, setShowInviteForm] = useState(false)

  // ---------------------------------------------------------------------------
  // Edit-percent modal state (works for partners — invitations no longer carry %)
  // ---------------------------------------------------------------------------
  const [editingPartnerId, setEditingPartnerId] = useState<string | null>(null)
  const [editingPartnerLabel, setEditingPartnerLabel] = useState<string>('')
  const [editingValue, setEditingValue] = useState<string>('')

  // ---------------------------------------------------------------------------
  // Initial load + subscription
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!business.syncId) return
    const syncId = business.syncId
    setPartners(partnerStore.getCachedPartners(syncId))
    setInvitations(partnerStore.getCachedInvitations(syncId))
    setGrants(partnerStore.getCachedGrants(syncId))
    const unsubStore = partnerStore.subscribe(() => {
      setPartners(partnerStore.getCachedPartners(syncId))
      setInvitations(partnerStore.getCachedInvitations(syncId))
      setGrants(partnerStore.getCachedGrants(syncId))
    })
    const unsubAuth = subscribeToAuthState((user) => {
      if (user) {
        void partnerStore.refresh(syncId).then(() => setPartnersLoaded(true))
        getSharedPassword(syncId).then(p => { if (!p) setNeedsPassword(true) })
        unsubAuth()
      }
    })
    return () => { unsubStore(); unsubAuth() }
  }, [business.id, business.syncId])

  // Default the add-form % to an equal split based on current participant count.
  useEffect(() => {
    const participantCount = 1 + partners.length + 1
    setInvitePercent(String(Math.floor(100 / participantCount)))
  }, [partners.length])

  // ---------------------------------------------------------------------------
  // Derived maps — pending invitation by partner, current grant by partner.
  // ---------------------------------------------------------------------------
  const invitationByPartner = useMemo(() => {
    const map = new Map<string, BusinessShareInvitation>()
    for (const inv of invitations) {
      if (inv.status !== 'pending' || !inv.partnerId) continue
      const existing = map.get(inv.partnerId)
      if (!existing || inv.createdAt > existing.createdAt) {
        map.set(inv.partnerId, inv)
      }
    }
    return map
  }, [invitations])

  const grantByPartner = useMemo(() => {
    const map = new Map<string, BusinessAccessGrant>()
    for (const g of grants) {
      if (!g.partnerId) continue
      map.set(g.partnerId, g)
    }
    return map
  }, [grants])

  const refreshAll = () => { void partnerStore.refresh(business.syncId) }

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  const openEditPartner = (partner: BusinessPartner) => {
    setEditingPartnerId(partner.id)
    setEditingPartnerLabel(partner.displayName ? `${partner.displayName} (${partner.email})` : partner.email)
    setEditingValue(String(partner.sharePercent ?? ''))
  }

  const handleSaveEditedPercent = async () => {
    if (!editingPartnerId) return
    const n = Number(editingValue)
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      setStatus({ type: 'error', message: 'אחוז חייב להיות בין 0 ל-100' })
      return
    }
    setLoading(true)
    try {
      const result = await updatePartner(editingPartnerId, { sharePercent: n })
      if (result.success) {
        setStatus({ type: 'success', message: 'אחוז שותפות עודכן' })
        setEditingPartnerId(null)
        refreshAll()
      } else {
        setStatus({ type: 'error', message: result.error || 'שגיאה' })
      }
    } finally {
      setLoading(false)
    }
  }

  const handleAddPartnerAndInvite = async () => {
    if (!email.trim()) {
      setStatus({ type: 'error', message: 'נדרש אימייל' })
      return
    }
    if (!business.syncId) {
      setStatus({ type: 'error', message: 'העסק לא מסונכרן — יש לסנכרן קודם' })
      return
    }

    const existingPassword = await getSharedPassword(business.syncId)
    if (!existingPassword && !password.trim()) {
      setNeedsPassword(true)
      setStatus({ type: 'error', message: 'יש להגדיר סיסמת הצפנה לשיתוף' })
      return
    }

    setLoading(true)
    setInviteLink(null)
    try {
      const percentNum = invitePercent.trim() === '' ? 0 : Number(invitePercent)
      const validPercent = Number.isFinite(percentNum) && percentNum >= 0 && percentNum <= 100 ? percentNum : 0

      const result = await sendInvite({
        businessSyncId: business.syncId,
        businessName: business.name,
        email: email.trim(),
        displayName: displayName.trim() || undefined,
        sharePercent: validPercent,
      })
      if (!result.success || !result.invitationId) {
        setStatus({ type: 'error', message: result.error || 'שגיאה' })
        setLoading(false)
        return
      }

      // Refresh token + ensure shared password is set up so the partner can decrypt.
      await refreshIdToken()
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

      const link = `${window.location.origin}/share-invite?id=${result.invitationId}`
      setInviteLink(link)
      setPendingEmail({ to: email.trim(), businessName: business.name, kind: 'first' })

      setStatus({ type: 'success', message: 'שותף נוסף, קישור נוצר. ניתן להעתיק או לשלוח במייל.' })
      setEmail('')
      setDisplayName('')
      setPassword('')
      setNeedsPassword(false)
      setShowInviteForm(false)
      refreshAll()
    } finally {
      setLoading(false)
    }
  }

  const handleSendOrRegenerateInvite = async (partner: BusinessPartner) => {
    setLoading(true)
    setInviteLink(null)
    try {
      const result = await sendInvite({ partnerId: partner.id })
      if (!result.success || !result.invitationId) {
        setStatus({ type: 'error', message: result.error || 'שגיאה' })
        return
      }
      const link = `${window.location.origin}/share-invite?id=${result.invitationId}`
      setInviteLink(link)
      setPendingEmail({ to: partner.email, businessName: partner.businessName, kind: 'reconnect' })
      setStatus({ type: 'success', message: 'קישור חדש נוצר. ניתן להעתיק או לשלוח במייל.' })
      refreshAll()
    } finally {
      setLoading(false)
    }
  }

  const handleCopyInvitationLink = async (inv: BusinessShareInvitation) => {
    const link = `${window.location.origin}/share-invite?id=${inv.id}`
    try {
      await navigator.clipboard.writeText(link)
      setInviteLink(link)
      setStatus({ type: 'success', message: 'הקישור הועתק' })
    } catch {
      setInviteLink(link)
      setStatus({ type: 'success', message: 'קישור מוכן להעתקה ידנית' })
    }
  }

  const handleCancelInvitation = async (invitationId: string) => {
    setLoading(true)
    try {
      const result = await cancelShareInvitation(invitationId)
      if (result.success) {
        setStatus({ type: 'success', message: 'הזמנה בוטלה' })
        setInviteLink(null)
        refreshAll()
      } else {
        setStatus({ type: 'error', message: result.error || 'שגיאה' })
      }
    } finally {
      setLoading(false)
    }
  }

  const handleRevokeAccess = async (grantId: string) => {
    setLoading(true)
    try {
      const result = await revokeAccess(grantId)
      if (result.success) {
        setStatus({ type: 'success', message: 'גישה בוטלה — השותף נשאר במערכת ללא גישה' })
        refreshAll()
      } else {
        setStatus({ type: 'error', message: result.error || 'שגיאה' })
      }
    } finally {
      setLoading(false)
    }
  }

  const handleRemovePartner = async (partner: BusinessPartner) => {
    setLoading(true)
    try {
      const result = await removePartner(partner.id)
      if (result.success) {
        setStatus({ type: 'success', message: `${partner.displayName || partner.email} הוסר משותפים` })
        refreshAll()
      } else {
        setStatus({ type: 'error', message: result.error || 'שגיאה' })
      }
    } finally {
      setLoading(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Email helper
  // ---------------------------------------------------------------------------

  const handleSendPendingEmail = async () => {
    if (!pendingEmail || !inviteLink) return
    setLoading(true)
    try {
      await sendInviteEmail(pendingEmail.to, pendingEmail.businessName, inviteLink, pendingEmail.kind)
      setStatus({ type: 'success', message: `נשלח במייל ל-${pendingEmail.to}` })
      setPendingEmail(null)
    } catch (err: any) {
      setStatus({ type: 'error', message: `שליחת מייל נכשלה: ${err?.message || 'שגיאה'}` })
    } finally {
      setLoading(false)
    }
  }

  const sendInviteEmail = async (
    toEmail: string,
    businessName: string,
    link: string,
    kind: 'first' | 'reconnect',
  ) => {
    const canSendEmail = await hasGmailAccess()
    if (!canSendEmail) return
    const subject = kind === 'first'
      ? `הזמנה לשיתוף עסק — ${businessName}`
      : `קישור התחברות מחדש — ${businessName}`
    const heading = kind === 'first' ? 'הוזמנת לשיתוף עסק' : 'קישור התחברות מחדש'
    const body = kind === 'first'
      ? `הוזמנת לשתף את העסק <strong>${businessName}</strong> באפליקציית Aglamazo.`
      : `נוצר קישור התחברות חדש לעסק <strong>${businessName}</strong>.`
    const cta = kind === 'first' ? 'קבל הזמנה' : 'התחבר מחדש'
    await sendEmail(
      toEmail,
      subject,
      `<div dir="rtl" style="font-family: sans-serif; max-width: 500px;">
        <h2>${heading}</h2>
        <p>${body}</p>
        <p>לחץ על הקישור כדי לבצע את הפעולה ולהזין את סיסמת השיתוף:</p>
        <p><a href="${link}" style="display: inline-block; padding: 0.75rem 1.5rem; background: #3b82f6; color: white; text-decoration: none; border-radius: 0.5rem; font-weight: 600;">${cta}</a></p>
      </div>`,
    )
  }

  // ---------------------------------------------------------------------------
  // Styles
  // ---------------------------------------------------------------------------
  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: '0.5rem',
    padding: '0.5rem 0.75rem', background: '#fff', borderRadius: '0.375rem',
    border: '1px solid #e2e8f0', marginBottom: '0.25rem', fontSize: '0.9rem',
    flexWrap: 'wrap',
  }
  const pencilBtn: React.CSSProperties = {
    padding: '0.2rem 0.5rem', fontSize: '0.85rem', borderRadius: '0.25rem',
    border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer',
  }
  const dangerBtn: React.CSSProperties = {
    padding: '0.2rem 0.55rem', fontSize: '0.75rem', borderRadius: '0.25rem',
    border: '1px solid #fca5a5', background: '#fef2f2', color: '#dc2626', cursor: 'pointer',
  }
  const accessBadgeGranted: React.CSSProperties = {
    padding: '0.1rem 0.5rem', fontSize: '0.7rem', borderRadius: '0.25rem',
    background: '#dcfce7', color: '#166534', border: '1px solid #86efac',
  }
  const accessBadgePending: React.CSSProperties = {
    padding: '0.1rem 0.5rem', fontSize: '0.7rem', borderRadius: '0.25rem',
    background: '#fef3c7', color: '#a16207', border: '1px solid #fde047',
  }
  const accessBadgeNone: React.CSSProperties = {
    padding: '0.1rem 0.5rem', fontSize: '0.7rem', borderRadius: '0.25rem',
    background: '#f1f5f9', color: '#64748b', border: '1px solid #cbd5e1',
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <section style={{ padding: '1rem', border: '1px solid #e2e8f0', borderRadius: '0.75rem' }}>
      <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600 }}>שותפים</h3>

      {/* Owner row */}
      <div style={rowStyle}>
        <span style={{ flex: 1 }}>
          {ownerLabel || 'לא משויך'}
          <span style={{ color: '#64748b', marginInlineStart: '0.5rem' }}>· {ownerSharePercent ?? 100}%</span>
        </span>
        <button onClick={onEditOwner} disabled={loading} title="ערוך בעלים ואחוז" style={pencilBtn}>✏️</button>
      </div>

      {/* Partner rows */}
      {partners.map(partner => {
        const grant = grantByPartner.get(partner.id)
        const invitation = invitationByPartner.get(partner.id)
        return (
          <div key={partner.id} style={rowStyle}>
            <span style={{ flex: '1 1 200px', minWidth: 0 }}>
              {partner.displayName ? (
                <>
                  {partner.displayName}
                  <span style={{ color: '#64748b', marginInlineStart: '0.5rem', fontSize: '0.8rem' }}>
                    ({partner.email})
                  </span>
                </>
              ) : (
                partner.email
              )}
              <span style={{ color: '#64748b', marginInlineStart: '0.5rem' }}>· {partner.sharePercent}%</span>
            </span>

            {/* Access state badge */}
            {grant ? (
              <span style={accessBadgeGranted}>✓ נגיש</span>
            ) : invitation ? (
              <span style={accessBadgePending}>📧 הזמנה ממתינה</span>
            ) : (
              <span style={accessBadgeNone}>אין גישה</span>
            )}

            {/* Edit percent */}
            <button
              onClick={() => openEditPartner(partner)}
              disabled={loading}
              title="ערוך אחוז שותפות"
              style={pencilBtn}
            >
              ✏️
            </button>

            {/* Access-specific actions */}
            {grant ? (
              <button
                onClick={() => void handleRevokeAccess(grant.id)}
                disabled={loading}
                title="בטל גישה — השותף נשאר במערכת"
                style={dangerBtn}
              >
                בטל גישה
              </button>
            ) : invitation ? (
              <>
                <button
                  onClick={() => void handleCopyInvitationLink(invitation)}
                  disabled={loading}
                  title="העתק קישור הזמנה"
                  style={pencilBtn}
                >
                  📋
                </button>
                <button
                  onClick={() => void handleCancelInvitation(invitation.id)}
                  disabled={loading}
                  title="בטל הזמנה"
                  style={dangerBtn}
                >
                  בטל הזמנה
                </button>
              </>
            ) : null}

            {/* Regenerate / send invite — always available */}
            <button
              onClick={() => void handleSendOrRegenerateInvite(partner)}
              disabled={loading}
              title={invitation ? 'צור קישור חדש (יבטל את הקודם)' : grant ? 'שלח קישור חדש להתחברות מחדש' : 'שלח הזמנה'}
              style={pencilBtn}
            >
              🔗
            </button>

            {/* Remove partner entirely */}
            <button
              onClick={() => void handleRemovePartner(partner)}
              disabled={loading}
              title="הסר שותף לחלוטין (האחוז יחזור לבעלים)"
              style={dangerBtn}
            >
              🗑
            </button>
          </div>
        )
      })}

      {/* Edit-percent modal */}
      <Modal isOpen={editingPartnerId !== null} onClose={() => setEditingPartnerId(null)} maxWidth="400px">
        {editingPartnerId && (
          <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>אחוז שותפות</h3>
            <div style={{ fontSize: '0.85rem', color: '#64748b' }}>{editingPartnerLabel}</div>
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
                onClick={() => setEditingPartnerId(null)}
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

      {/* Total % warning */}
      {partnersLoaded && (() => {
        const ownerPct = business.ownerSharePercent ?? (100 - partners.reduce((s, p) => s + p.sharePercent, 0))
        const partnersPct = partners.reduce((s, p) => s + p.sharePercent, 0)
        const total = ownerPct + partnersPct
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
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="אימייל של השותף"
              style={{ flex: '2 1 200px', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', fontSize: '0.9rem' }}
            />
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="שם להצגה (לא חובה)"
              style={{ flex: '2 1 160px', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', fontSize: '0.9rem' }}
            />
            <input
              type="number" min={0} max={100} step={1}
              value={invitePercent}
              onChange={e => setInvitePercent(e.target.value)}
              placeholder="%" title="אחוז שותפות"
              style={{ width: '70px', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', fontSize: '0.9rem', textAlign: 'center' }}
            />
            <button onClick={() => void handleAddPartnerAndInvite()} disabled={loading} className="file-picker" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
              הוסף ושלח הזמנה
            </button>
            <button
              onClick={() => { setShowInviteForm(false); setEmail(''); setDisplayName(''); setStatus({ type: 'idle', message: '' }) }}
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
        </div>
      )}

      {/* Status + generated link — visible whether the invite form is open or
          a per-row "regenerate link" action surfaced one. */}
      {status.message && (
        <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: status.type === 'success' ? '#16a34a' : status.type === 'error' ? '#dc2626' : '#64748b' }}>
          {status.message}
        </div>
      )}
      {/* Invite-link modal — opens when a link is generated by add-partner
          or the per-row 🔗 button. Replaces the old inline strip so the
          link doesn't get lost below the fold. */}
      <Modal
        isOpen={inviteLink !== null}
        onClose={() => { setInviteLink(null); setPendingEmail(null) }}
        maxWidth="520px"
      >
        {inviteLink && (
          <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>קישור הזמנה נוצר</h3>
            {pendingEmail && (
              <div style={{ fontSize: '0.85rem', color: '#475569' }}>
                לשליחה ל-<strong style={{ direction: 'ltr', unicodeBidi: 'isolate' }}>{pendingEmail.to}</strong>
              </div>
            )}
            <div style={{
              display: 'flex', gap: '0.5rem', alignItems: 'center',
              padding: '0.5rem 0.6rem', background: '#f0f9ff', borderRadius: '0.375rem',
              border: '1px solid #bae6fd', fontSize: '0.8rem',
            }}>
              <input readOnly value={inviteLink} onFocus={e => e.target.select()}
                style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', fontSize: '0.78rem', direction: 'ltr' }} />
              <button
                onClick={() => { void navigator.clipboard.writeText(inviteLink); setStatus({ type: 'success', message: 'הקישור הועתק' }) }}
                style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', border: '1px solid #d1d5db', borderRadius: '0.25rem', background: '#fff', cursor: 'pointer' }}
              >📋 העתק</button>
            </div>
            {pendingEmail && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <button
                  onClick={() => void handleSendPendingEmail()}
                  disabled={loading}
                  style={{ padding: '0.55rem 1rem', fontSize: '0.9rem', border: '1px solid #93c5fd', borderRadius: '0.375rem', background: '#3b82f6', color: 'white', cursor: 'pointer', fontWeight: 600 }}
                >📧 שלח במייל</button>
                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                  השליחה משתמשת בהרשאת Gmail שכבר נתת בכניסה — לא תידרש לאשר שוב.
                </div>
              </div>
            )}
            {status.message && (
              <div style={{ fontSize: '0.8rem', color: status.type === 'success' ? '#16a34a' : status.type === 'error' ? '#dc2626' : '#64748b' }}>
                {status.message}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setInviteLink(null); setPendingEmail(null) }}
                disabled={loading}
                style={{ padding: '0.45rem 0.95rem', fontSize: '0.85rem', borderRadius: '0.375rem', border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}
              >סגור</button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  )
}
