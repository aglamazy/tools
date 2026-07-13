'use client'

import React, { useEffect, useState } from 'react'
import { businessStore } from '@/app/stores/businessStore'
import type { Business } from '@/app/db/financeDB'
import { ypayService } from '@/app/services/ypayService'
import { subscribeToAuthState } from '@/app/services/firebaseAuthService'
import { partnerStore, type Partner } from '@/app/stores/partnerStore'
import Modal from '@/app/components/Modal'
import BusinessSharingSection from './BusinessSharingSection'

type BizSettingsTabProps = {
  businessId: number
}


export default function BizSettingsTab({ businessId }: BizSettingsTabProps) {
  const [business, setBusiness] = useState<Business | null>(null)
  const [ypayClientId, setYpayClientId] = useState('')
  const [ypayClientSecret, setYpayClientSecret] = useState('')
  const [ypayUseSandbox, setYpayUseSandbox] = useState(false)
  const [ypaySandboxClientId, setYpaySandboxClientId] = useState('')
  const [ypaySandboxClientSecret, setYpaySandboxClientSecret] = useState('')
  const [ypayStatus, setYpayStatus] = useState<{ type: 'idle' | 'success' | 'error'; message: string }>({ type: 'idle', message: '' })
  const [householdMembers, setHouseholdMembers] = useState<Partner[]>(() =>
    typeof window !== 'undefined' ? partnerStore.getCachedByBusinessId(businessId) : []
  )
  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const [ownerSaved, setOwnerSaved] = useState(false)
  const [ownerSharePercent, setOwnerSharePercent] = useState<string>('100')
  const [editingOwner, setEditingOwner] = useState(false)

  useEffect(() => {
    // Subscribe to Firebase auth so the household members fetch only fires after a user
    // resolves — otherwise getUser() can return null at first render and the dropdown
    // ends up missing the current user.
    let syncIdForBiz: string | undefined
    // Initial sync read: show cached partners immediately to avoid empty-dropdown flash.
    void businessStore.getById(businessId).then(b => {
      syncIdForBiz = b?.syncId
      partnerStore.recordBusiness(b?.id, b?.syncId)
      setHouseholdMembers(partnerStore.getCached(syncIdForBiz))
    })
    const unsubStore = partnerStore.subscribe(() => {
      setHouseholdMembers(partnerStore.getCached(syncIdForBiz))
    })
    const unsubAuth = subscribeToAuthState(async (user) => {
      if (user) {
        const b = await businessStore.getById(businessId)
        syncIdForBiz = b?.syncId
        // Trigger background refresh; subscribe handler above picks up the result.
        await partnerStore.refresh(syncIdForBiz)
      } else {
        partnerStore.clear()
      }
    })
    const unsubscribe = () => { unsubStore(); unsubAuth() }
    void loadBusiness()
    const handleSync = () => void loadBusiness()
    window.addEventListener('shared-data-updated', handleSync)
    return () => {
      unsubscribe()
      window.removeEventListener('shared-data-updated', handleSync)
    }
  }, [businessId])

  const loadBusiness = async () => {
    const b = await businessStore.getById(businessId)
    if (b) {
      setBusiness(b)
      setYpayClientId(b.ypayClientId || '')
      setYpayClientSecret(b.ypayClientSecret || '')
      setYpayUseSandbox(b.ypayUseSandbox || false)
      setYpaySandboxClientId(b.ypaySandboxClientId || '')
      setYpaySandboxClientSecret(b.ypaySandboxClientSecret || '')
      setSelectedUserId(b.userId || '')
      setOwnerSharePercent(String(b.ownerSharePercent ?? 100))
    }
  }

  const saveOwner = async () => {
    const n = Number(ownerSharePercent)
    const validPercent = Number.isFinite(n) && n >= 0 && n <= 100 ? n : undefined
    await businessStore.update(businessId, {
      userId: selectedUserId || undefined,
      ...(validPercent !== undefined ? { ownerSharePercent: validPercent } : {}),
    })
    await loadBusiness()
    setEditingOwner(false)
    setOwnerSaved(true)
    setTimeout(() => setOwnerSaved(false), 2000)
  }

  const saveYpayCredentials = async () => {
    await businessStore.update(businessId, {
      ypayClientId: ypayClientId.trim(),
      ypayClientSecret: ypayClientSecret.trim(),
      ypayUseSandbox,
      ypaySandboxClientId: ypaySandboxClientId.trim(),
      ypaySandboxClientSecret: ypaySandboxClientSecret.trim(),
    })
    setYpayStatus({ type: 'success', message: 'נשמר' })
  }

  const testYpayConnection = async () => {
    const clientId = (ypayUseSandbox ? ypaySandboxClientId : ypayClientId).trim()
    const clientSecret = (ypayUseSandbox ? ypaySandboxClientSecret : ypayClientSecret).trim()
    if (!clientId || !clientSecret) {
      setYpayStatus({ type: 'error', message: 'יש להזין Client ID ו-Secret' })
      return
    }
    setYpayStatus({ type: 'idle', message: 'בודק...' })
    const result = await ypayService.testConnection({ clientId, clientSecret })
    if (result.success) {
      await businessStore.update(businessId, {
        ypayClientId: ypayClientId.trim(),
        ypayClientSecret: ypayClientSecret.trim(),
        ypayUseSandbox,
        ypaySandboxClientId: ypaySandboxClientId.trim(),
        ypaySandboxClientSecret: ypaySandboxClientSecret.trim(),
      })
    }
    setYpayStatus({ type: result.success ? 'success' : 'error', message: result.message })
  }

  if (!business) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Edit owner + percent modal (triggered from BusinessSharingSection's owner row pencil) */}
      <Modal isOpen={editingOwner} onClose={() => setEditingOwner(false)} maxWidth="420px">
        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>בעלים ואחוז שותפות</h3>
          <p style={{ margin: 0, color: '#64748b', fontSize: '0.8rem' }}>שייך את העסק למשתמש במשק הבית או לשותף עסקי</p>
          <select
            value={selectedUserId}
            onChange={e => setSelectedUserId(e.target.value)}
            style={{ padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', fontSize: '0.9rem' }}
          >
            <option value="">לא משויך</option>
            {householdMembers.map(m => (
              <option key={m.uid} value={m.uid}>{m.label}</option>
            ))}
          </select>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.85rem', color: '#1e40af', minWidth: '100px' }}>אחוז שותפות:</label>
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={ownerSharePercent}
              onChange={e => setOwnerSharePercent(e.target.value)}
              autoFocus
              style={{ width: '90px', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', fontSize: '0.95rem', textAlign: 'center' }}
            />
            <span style={{ fontSize: '0.85rem', color: '#64748b' }}>%</span>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button
              onClick={() => setEditingOwner(false)}
              style={{
                padding: '0.5rem 1rem', fontSize: '0.85rem', borderRadius: '0.375rem',
                border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer',
              }}
            >
              ביטול
            </button>
            <button
              onClick={() => void saveOwner()}
              className="file-picker"
              style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
            >
              שמור
            </button>
          </div>
        </div>
      </Modal>

      {/* Unified partners list (owner + shares + pending invitations + add) */}
      {(() => {
        const owner = householdMembers.find(m => m.uid === business.userId)
        const ownerLabelFinal = owner?.label || (business.userId ? business.userId : 'לא משויך')
        return (
          <BusinessSharingSection
            business={business}
            ownerLabel={ownerLabelFinal}
            ownerSharePercent={business.ownerSharePercent}
            onEditOwner={() => {
              setSelectedUserId(business.userId || '')
              setOwnerSharePercent(String(business.ownerSharePercent ?? 100))
              setEditingOwner(true)
            }}
          />
        )
      })()}

      <section style={{
        padding: '1rem', borderRadius: '0.75rem',
        border: ypayUseSandbox ? '1px solid #fbbf24' : '1px solid #e2e8f0',
        background: ypayUseSandbox ? '#fffbeb' : '#faf5ff',
      }}>
        <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 600 }}>YPAY - חשבוניות</h3>
        <p style={{ margin: '0 0 1rem', color: '#6b21a8', fontSize: '0.85rem' }}>הגדרות חיבור לשירות החשבוניות של YPAY</p>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={ypayUseSandbox}
            onChange={(e) => setYpayUseSandbox(e.target.checked)}
            style={{ width: '1.1rem', height: '1.1rem', cursor: 'pointer' }}
          />
          <span style={{ fontWeight: 600 }}>מצב Sandbox (בדיקה)</span>
          <span style={{ fontSize: '0.8rem', color: '#92400e' }}>— לאימות לפני יצירת מסמכים אמיתיים ב-YPAY</span>
        </label>
        {ypayUseSandbox && (
          <div style={{
            padding: '0.6rem 0.75rem', marginBottom: '0.75rem', borderRadius: '0.375rem',
            background: '#fef3c7', border: '1px solid #fde68a', fontSize: '0.8rem', color: '#92400e', fontWeight: 600,
          }}>
            ⚠️ מצב Sandbox פעיל — כל מסמך שייווצר יהיה לצורך בדיקה בלבד, לא מסמך אמיתי.
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <label style={{ minWidth: '90px', fontWeight: 500, fontSize: '0.9rem' }}>Client ID:</label>
            <input
              type="text"
              value={ypayUseSandbox ? ypaySandboxClientId : ypayClientId}
              onChange={(e) => ypayUseSandbox ? setYpaySandboxClientId(e.target.value) : setYpayClientId(e.target.value)}
              style={{ flex: 1, padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', fontSize: '0.9rem' }}
              placeholder="Client ID"
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <label style={{ minWidth: '90px', fontWeight: 500, fontSize: '0.9rem' }}>Secret:</label>
            <input
              type="password"
              value={ypayUseSandbox ? ypaySandboxClientSecret : ypayClientSecret}
              onChange={(e) => ypayUseSandbox ? setYpaySandboxClientSecret(e.target.value) : setYpayClientSecret(e.target.value)}
              style={{ flex: 1, padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', fontSize: '0.9rem' }}
              placeholder="Client Secret"
            />
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <button onClick={() => void saveYpayCredentials()} className="file-picker" style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}>
              שמור
            </button>
            <button onClick={() => void testYpayConnection()} className="upload-another-btn" style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}>
              בדוק חיבור
            </button>
            {ypayStatus.message && (
              <span style={{ fontSize: '0.85rem', color: ypayStatus.type === 'success' ? '#16a34a' : ypayStatus.type === 'error' ? '#dc2626' : '#64748b' }}>
                {ypayStatus.message}
              </span>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
