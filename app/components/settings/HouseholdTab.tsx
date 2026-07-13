'use client'

import React, { useState, useEffect } from 'react'
import Modal from '../Modal'
import YesNoModal from '../YesNoModal'
import {
  createHousehold,
  invitePartner,
  leaveHousehold,
  cancelInvitation,
  getHouseholdInfo,
} from '@/app/services/householdService'
import { refreshIdToken } from '@/app/services/firebaseAuthService'
import { migrateToHouseholdStorage } from '@/app/services/cloudBackupService'
import { appSettingsStore, AccountOwners } from '@/app/stores/appSettingsStore'
import { getUser } from '@/app/stores/authStore'
import { db } from '@/app/db/financeDB'
import type { Household, HouseholdInvitation, HouseholdRole } from '@/app/types/household'
import TaxProfileSection from '@/app/components/TaxProfileSection'

type HouseholdWithEmails = Household & { memberEmails?: Record<string, string> }

export default function HouseholdTab() {
  const [loading, setLoading] = useState(true)
  const [household, setHousehold] = useState<HouseholdWithEmails | null>(null)
  const [role, setRole] = useState<HouseholdRole | null>(null)
  const [pendingInvitations, setPendingInvitations] = useState<HouseholdInvitation[]>([])

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)

  const [accountOwners, setAccountOwners] = useState<AccountOwners>({})
  const [accounts, setAccounts] = useState<{ key: string; label: string }[]>([])

  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; message: string; isError?: boolean; copyText?: string }>({
    isOpen: false,
    message: '',
  })
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [cancelInviteId, setCancelInviteId] = useState<string | null>(null)
  const [memberSettings, setMemberSettings] = useState<{ uid: string; label: string } | null>(null)

  useEffect(() => {
    loadHouseholdInfo()
  }, [])

  useEffect(() => {
    if (household && (household.members || []).length === 2) {
      loadAccountAssignments()
    }
  }, [household])

  const loadHouseholdInfo = async () => {
    setLoading(true)
    try {
      const result = await getHouseholdInfo()
      if (result.success) {
        setHousehold(result.household as HouseholdWithEmails || null)
        setRole(result.role || null)
        setPendingInvitations(result.pendingInvitations || [])
      } else {
        console.error('[HouseholdTab] Failed to load info:', result.error)
      }
    } catch (error) {
      console.error('[HouseholdTab] Error loading household info:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadAccountAssignments = async () => {
    try {
      const importedFiles = await db.importedFiles.toArray()
      const accountSet = new Map<string, string>()

      importedFiles.forEach(file => {
        if (file.fileType === 'credit-card' && file.cardNumber) {
          accountSet.set(`card:${file.cardNumber}`, `כרטיס ${file.cardNumber}`)
        } else if (file.fileType === 'bank' && file.accountNumber) {
          accountSet.set(`bank:${file.accountNumber}`, `בנק ${file.accountNumber}`)
        }
      })

      const sorted = Array.from(accountSet.entries())
        .map(([key, label]) => ({ key, label }))
        .sort((a, b) => a.label.localeCompare(b.label, 'he'))

      setAccounts(sorted)
      const owners = await appSettingsStore.getAccountOwners()
      setAccountOwners(owners)
    } catch (error) {
      console.error('[HouseholdTab] Error loading account assignments:', error)
    }
  }

  const handleAssign = async (accountKey: string, uid: string | null) => {
    const updated = { ...accountOwners }
    if (uid === null) {
      delete updated[accountKey]
    } else {
      updated[accountKey] = uid
    }
    setAccountOwners(updated)
    await appSettingsStore.setAccountOwners(updated)
  }

  const handleCreateHousehold = async () => {
    setLoading(true)
    try {
      const result = await createHousehold()
      if (result.success) {
        // Refresh token to get new claims (needed for household storage path)
        await refreshIdToken()
        // Migrate existing personal backup to household storage
        const migration = await migrateToHouseholdStorage()
        await loadHouseholdInfo()
        setAlertModal({
          isOpen: true,
          message: migration.success
            ? 'משק הבית נוצר בהצלחה! הגיבוי הועבר לאחסון המשותף.'
            : 'משק הבית נוצר בהצלחה!',
        })
      } else {
        setAlertModal({ isOpen: true, message: result.error || 'שגיאה ביצירת משק בית', isError: true })
      }
    } finally {
      setLoading(false)
    }
  }

  const handleInvite = async () => {
    if (!inviteEmail.trim()) {
      setAlertModal({ isOpen: true, message: 'יש להזין כתובת אימייל', isError: true })
      return
    }

    setInviting(true)
    try {
      const result = await invitePartner(inviteEmail.trim())
      if (result.success) {
        const inviteLink = `${window.location.origin}/invite?id=${result.invitationId}`
        setInviteEmail('')
        await loadHouseholdInfo()
        setAlertModal({
          isOpen: true,
          message: 'הזמנה נשלחה! שתף את הקישור עם השותף/ה:',
          copyText: inviteLink,
        })
      } else {
        setAlertModal({ isOpen: true, message: result.error || 'שגיאה בשליחת הזמנה', isError: true })
      }
    } finally {
      setInviting(false)
    }
  }

  const handleLeave = async () => {
    setConfirmLeave(false)
    setLoading(true)
    try {
      const result = await leaveHousehold()
      if (result.success) {
        // Refresh token to clear claims
        await refreshIdToken()
        await loadHouseholdInfo()
        setAlertModal({
          isOpen: true,
          message: role === 'owner' ? 'משק הבית פורק בהצלחה' : 'עזבת את משק הבית',
        })
      } else {
        setAlertModal({ isOpen: true, message: result.error || 'שגיאה בעזיבת משק בית', isError: true })
      }
    } finally {
      setLoading(false)
    }
  }

  const handleCancelInvite = async () => {
    if (!cancelInviteId) return
    setCancelInviteId(null)
    try {
      const result = await cancelInvitation(cancelInviteId)
      if (result.success) {
        await loadHouseholdInfo()
        setAlertModal({ isOpen: true, message: 'ההזמנה בוטלה' })
      } else {
        setAlertModal({ isOpen: true, message: result.error || 'שגיאה בביטול הזמנה', isError: true })
      }
    } catch (error) {
      setAlertModal({ isOpen: true, message: 'שגיאה בביטול הזמנה', isError: true })
    }
  }

  if (loading) {
    return (
      <section style={{ padding: '2rem', textAlign: 'center' }}>
        <p>טוען...</p>
      </section>
    )
  }

  // No household - show create option
  if (!household) {
    return (
      <>
        <section
          style={{
            marginBottom: '2rem',
            padding: '1.5rem',
            border: '1px solid #e2e8f0',
            borderRadius: '0.75rem',
            background: '#f0fdf4',
          }}
        >
          <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.1rem', color: '#166534' }}>משק בית משותף</h2>
          <p style={{ margin: '0 0 1rem', color: '#15803d', fontSize: '0.95rem' }}>
            צור משק בית כדי לשתף נתונים פיננסיים עם בן/בת הזוג.
            <br />
            שני השותפים יוכלו לגשת לאותם נתונים מוצפנים בענן.
          </p>

          <div
            style={{
              padding: '1rem',
              background: '#fefce8',
              borderRadius: '0.5rem',
              marginBottom: '1rem',
              border: '1px solid #fef08a',
            }}
          >
            <p style={{ margin: 0, fontSize: '0.9rem', color: '#854d0e' }}>
              <strong>איך זה עובד:</strong>
              <br />
              1. צור משק בית והזמן את השותף/ה באמצעות אימייל
              <br />
              2. שתף את סיסמת ההצפנה עם השותף/ה (בטלפון או בהודעה)
              <br />
              3. שניכם תוכלו לסנכרן לאותו גיבוי מוצפן בענן
            </p>
          </div>

          <button onClick={handleCreateHousehold} className="file-picker" style={{ fontSize: '1rem' }}>
            צור משק בית
          </button>
        </section>

        <Modal isOpen={alertModal.isOpen} onClose={() => setAlertModal({ isOpen: false, message: '' })} maxWidth="450px">
          <div className="modal-body" style={{ textAlign: 'center', padding: '2rem' }}>
            <p
              style={{
                fontSize: '1rem',
                margin: '0 0 1.5rem 0',
                whiteSpace: 'pre-wrap',
                color: alertModal.isError ? '#dc2626' : 'inherit',
              }}
            >
              {alertModal.message}
            </p>
            <button onClick={() => setAlertModal({ isOpen: false, message: '' })} className="file-picker" autoFocus>
              אישור
            </button>
          </div>
        </Modal>
      </>
    )
  }

  // Has household - show management UI
  const isOwner = role === 'owner'
  const members = household.members || []
  const otherMember = members.find((m) => m !== household.ownerId)

  return (
    <>
      {/* Household Info */}
      <section
        style={{
          marginBottom: '2rem',
          padding: '1.5rem',
          border: '1px solid #e2e8f0',
          borderRadius: '0.75rem',
          background: '#f0f9ff',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', color: '#0369a1' }}>משק הבית שלי</h2>
            <p style={{ margin: '0 0 0.25rem', color: '#0284c7', fontSize: '0.9rem' }}>
              תפקיד: <strong>{isOwner ? 'בעלים' : 'חבר/ה'}</strong>
            </p>
            <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem' }}>
              נוצר: {new Date(household.createdAt).toLocaleDateString('he-IL')}
            </p>
          </div>
          <button
            onClick={loadHouseholdInfo}
            className="file-picker secondary"
            style={{ fontSize: '0.875rem', padding: '0.4rem 0.8rem' }}
          >
            רענן
          </button>
        </div>
      </section>

      {/* Members */}
      <section
        style={{
          marginBottom: '2rem',
          padding: '1.5rem',
          border: '1px solid #e2e8f0',
          borderRadius: '0.75rem',
          background: '#fafafa',
        }}
      >
        <h3 style={{ margin: '0 0 1rem', fontSize: '1rem' }}>חברי משק הבית</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {members.map((memberId) => {
            const memberEmail = household.memberEmails?.[memberId] || 'טוען...'
            const isSelf = memberId === household.ownerId ? isOwner : !isOwner
            const memberIsOwner = memberId === household.ownerId

            return (
              <button
                key={memberId}
                type="button"
                onClick={() => setMemberSettings({ uid: memberId, label: memberEmail })}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.75rem 1rem',
                  background: '#fff',
                  borderRadius: '0.5rem',
                  border: '1px solid #e2e8f0',
                  cursor: 'pointer',
                  textAlign: 'inherit',
                  font: 'inherit',
                  color: 'inherit',
                  width: '100%',
                }}
                title="פתח הגדרות של חבר/ה זה/ו"
              >
                <span style={{ fontSize: '1.25rem' }}>{memberIsOwner ? '👑' : '👤'}</span>
                <span style={{ flex: 1 }}>
                  {memberEmail}
                  {isSelf && <span style={{ color: '#64748b', marginRight: '0.5rem' }}>(אני)</span>}
                </span>
                <span
                  style={{
                    fontSize: '0.8rem',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '0.25rem',
                    background: memberIsOwner ? '#dcfce7' : '#e0f2fe',
                    color: memberIsOwner ? '#166534' : '#0369a1',
                  }}
                >
                  {memberIsOwner ? 'בעלים' : 'חבר/ה'}
                </span>
                <span style={{ fontSize: '1rem', color: '#94a3b8' }}>⚙️</span>
              </button>
            )
          })}
        </div>

        {members.length < 2 && (
          <p style={{ margin: '1rem 0 0', color: '#64748b', fontSize: '0.9rem' }}>
            ממתין לשותף/ה להצטרף למשק הבית
          </p>
        )}
      </section>

      {/* Account Assignment - only when 2 members */}
      {members.length === 2 && accounts.length > 0 && (() => {
        const currentUid = getUser()?.uid
        const memberA = currentUid || members[0]
        const memberB = members.find(m => m !== memberA) || members[1]
        const emailA = household.memberEmails?.[memberA] || 'אני'
        const emailB = household.memberEmails?.[memberB] || 'שותף/ה'

        return (
          <section
            style={{
              marginBottom: '2rem',
              padding: '1.5rem',
              border: '1px solid #e2e8f0',
              borderRadius: '0.75rem',
              background: '#f8fafc',
            }}
          >
            <h3 style={{ margin: '0 0 1rem', fontSize: '1rem' }}>שיוך חשבונות</h3>
            <p style={{ margin: '0 0 1rem', color: '#64748b', fontSize: '0.9rem' }}>
              שייכו כל חשבון לבן/בת הזוג הרלוונטי/ת. משימות אוטומטיות יוצגו רק למי שהחשבון שייך אליו.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {accounts.map(({ key, label }) => {
                const owner = accountOwners[key]
                const value: 'a' | 'b' | 'both' = !owner ? 'both' : owner === memberA ? 'a' : 'b'

                return (
                  <div
                    key={key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.75rem 1rem',
                      background: '#fff',
                      borderRadius: '0.5rem',
                      border: '1px solid #e2e8f0',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span style={{ minWidth: '120px', fontWeight: 500 }}>{label}</span>
                    <div style={{ display: 'flex', gap: 0, borderRadius: '0.375rem', overflow: 'hidden', border: '1px solid #cbd5e1' }}>
                      {([
                        { id: 'a' as const, uid: memberA, text: emailA },
                        { id: 'b' as const, uid: memberB, text: emailB },
                        { id: 'both' as const, uid: null, text: 'שניהם' },
                      ]).map(opt => (
                        <button
                          key={opt.id}
                          onClick={() => handleAssign(key, opt.uid)}
                          style={{
                            padding: '0.4rem 0.75rem',
                            fontSize: '0.85rem',
                            border: 'none',
                            borderRight: opt.id !== 'both' ? '1px solid #cbd5e1' : 'none',
                            cursor: 'pointer',
                            background: value === opt.id ? '#3b82f6' : '#fff',
                            color: value === opt.id ? '#fff' : '#374151',
                            fontWeight: value === opt.id ? 600 : 400,
                            transition: 'background 0.15s, color 0.15s',
                          }}
                        >
                          {opt.text}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )
      })()}

      {/* Invite (Owner only) */}
      {isOwner && members.length < 2 && (
        <section
          style={{
            marginBottom: '2rem',
            padding: '1.5rem',
            border: '1px solid #e2e8f0',
            borderRadius: '0.75rem',
            background: '#fefce8',
          }}
        >
          <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', color: '#854d0e' }}>הזמן שותף/ה</h3>
          <p style={{ margin: '0 0 1rem', color: '#a16207', fontSize: '0.9rem' }}>
            הזן את כתובת האימייל של השותף/ה לקבלת קישור הצטרפות
          </p>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleInvite()
              }}
              placeholder="email@example.com"
              style={{
                flex: 1,
                padding: '0.75rem',
                borderRadius: '0.375rem',
                border: '1px solid #d1d5db',
                fontSize: '0.95rem',
                direction: 'ltr',
              }}
            />
            <button
              onClick={handleInvite}
              disabled={inviting}
              className="file-picker"
              style={{ fontSize: '0.95rem', minWidth: '80px' }}
            >
              {inviting ? '...' : 'הזמן'}
            </button>
          </div>
        </section>
      )}

      {/* Pending Invitations (Owner only) */}
      {isOwner && pendingInvitations.length > 0 && (
        <section
          style={{
            marginBottom: '2rem',
            padding: '1.5rem',
            border: '1px solid #fed7aa',
            borderRadius: '0.75rem',
            background: '#fff7ed',
          }}
        >
          <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', color: '#9a3412' }}>הזמנות ממתינות</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {pendingInvitations.map((invite) => (
              <div
                key={invite.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.75rem 1rem',
                  background: '#fff',
                  borderRadius: '0.5rem',
                  border: '1px solid #fed7aa',
                }}
              >
                <span style={{ flex: 1 }}>{invite.inviteeEmail}</span>
                <span style={{ fontSize: '0.8rem', color: '#78716c' }}>
                  פג: {new Date(invite.expiresAt).toLocaleDateString('he-IL')}
                </span>
                <button
                  onClick={() =>
                    navigator.clipboard.writeText(`${window.location.origin}/invite?id=${invite.id}`)
                  }
                  style={{
                    padding: '0.3rem 0.6rem',
                    fontSize: '0.8rem',
                    background: '#e0f2fe',
                    border: '1px solid #bae6fd',
                    borderRadius: '0.25rem',
                    cursor: 'pointer',
                    color: '#0369a1',
                  }}
                >
                  העתק קישור
                </button>
                <button
                  onClick={() => setCancelInviteId(invite.id)}
                  style={{
                    padding: '0.3rem 0.6rem',
                    fontSize: '0.8rem',
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: '0.25rem',
                    cursor: 'pointer',
                    color: '#dc2626',
                  }}
                >
                  בטל
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Leave Household */}
      <section
        style={{
          padding: '1.5rem',
          border: '1px solid #fecaca',
          borderRadius: '0.75rem',
          background: '#fef2f2',
        }}
      >
        <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', color: '#991b1b' }}>
          {isOwner ? 'פרק משק בית' : 'עזוב משק בית'}
        </h3>
        <p style={{ margin: '0 0 1rem', color: '#b91c1c', fontSize: '0.9rem' }}>
          {isOwner
            ? 'פירוק משק הבית יסיר את כל החברים ויבטל הזמנות ממתינות. הנתונים המקומיים יישארו.'
            : 'עזיבת משק הבית תנתק אותך מהנתונים המשותפים. הנתונים המקומיים יישארו.'}
        </p>
        <button
          onClick={() => setConfirmLeave(true)}
          style={{
            padding: '0.5rem 1rem',
            fontSize: '0.9rem',
            background: '#dc2626',
            color: 'white',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: 'pointer',
          }}
        >
          {isOwner ? 'פרק משק בית' : 'עזוב משק בית'}
        </button>
      </section>

      {/* Modals */}
      <YesNoModal
        isOpen={confirmLeave}
        question={
          isOwner
            ? 'האם לפרק את משק הבית? פעולה זו תסיר את כל החברים ותבטל הזמנות ממתינות.'
            : 'האם לעזוב את משק הבית?'
        }
        onYes={handleLeave}
        onNo={() => setConfirmLeave(false)}
      />

      <YesNoModal
        isOpen={!!cancelInviteId}
        question="האם לבטל את ההזמנה?"
        onYes={handleCancelInvite}
        onNo={() => setCancelInviteId(null)}
      />

      <Modal isOpen={!!memberSettings} onClose={() => setMemberSettings(null)} maxWidth="640px">
        <div className="modal-header">
          <h2>הגדרות חבר/ה</h2>
        </div>
        <div className="modal-body">
          {memberSettings && (
            <TaxProfileSection userId={memberSettings.uid} memberLabel={memberSettings.label} />
          )}
        </div>
      </Modal>

      <Modal isOpen={alertModal.isOpen} onClose={() => setAlertModal({ isOpen: false, message: '' })} maxWidth="450px">
        <div className="modal-body" style={{ textAlign: 'center', padding: '2rem' }}>
          <p
            style={{
              fontSize: '1rem',
              margin: '0 0 1.5rem 0',
              whiteSpace: 'pre-wrap',
              color: alertModal.isError ? '#dc2626' : 'inherit',
            }}
          >
            {alertModal.message}
          </p>
          {alertModal.copyText && (
            <div style={{ margin: '0 0 1.5rem 0' }}>
              <code
                style={{
                  display: 'block',
                  padding: '0.75rem',
                  background: '#f1f5f9',
                  borderRadius: '0.375rem',
                  fontSize: '0.8rem',
                  wordBreak: 'break-all',
                  direction: 'ltr',
                  marginBottom: '0.75rem',
                }}
              >
                {alertModal.copyText}
              </code>
              <button
                onClick={() => navigator.clipboard.writeText(alertModal.copyText!)}
                style={{
                  padding: '0.4rem 1rem',
                  fontSize: '0.9rem',
                  background: '#e0f2fe',
                  border: '1px solid #bae6fd',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  color: '#0369a1',
                }}
              >
                העתק קישור
              </button>
            </div>
          )}
          <button onClick={() => setAlertModal({ isOpen: false, message: '' })} className="file-picker" autoFocus>
            אישור
          </button>
        </div>
      </Modal>
    </>
  )
}
