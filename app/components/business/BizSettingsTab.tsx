'use client'

import React, { useEffect, useState } from 'react'
import { businessStore } from '@/app/stores/businessStore'
import type { Business } from '@/app/db/financeDB'
import { ypayService } from '@/app/services/ypayService'
import { getUser } from '@/app/stores/authStore'
import { getHouseholdInfo } from '@/app/services/householdService'
import BusinessSharingSection from './BusinessSharingSection'

type BizSettingsTabProps = {
  businessId: number
}

let cachedHouseholdMembers: { uid: string; label: string }[] | null = null

async function fetchHouseholdMembers(): Promise<{ uid: string; label: string }[]> {
  if (cachedHouseholdMembers) return cachedHouseholdMembers
  const currentUser = getUser()
  const members: { uid: string; label: string }[] = []
  try {
    const info = await getHouseholdInfo()
    if (info.household) {
      const emails = (info.household as any).memberEmails || {}
      const names = (info.household as any).memberNames || {}
      for (const uid of info.household.members) {
        members.push({ uid, label: names[uid] || emails[uid] || uid })
      }
      cachedHouseholdMembers = members
      return members
    }
  } catch { /* no household */ }
  if (currentUser) {
    members.push({ uid: currentUser.uid, label: currentUser.displayName || currentUser.email || currentUser.uid })
  }
  cachedHouseholdMembers = members
  return members
}

export default function BizSettingsTab({ businessId }: BizSettingsTabProps) {
  const [business, setBusiness] = useState<Business | null>(null)
  const [ypayClientId, setYpayClientId] = useState('')
  const [ypayClientSecret, setYpayClientSecret] = useState('')
  const [ypayStatus, setYpayStatus] = useState<{ type: 'idle' | 'success' | 'error'; message: string }>({ type: 'idle', message: '' })
  const [householdMembers, setHouseholdMembers] = useState<{ uid: string; label: string }[]>([])
  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const [ownerSaved, setOwnerSaved] = useState(false)

  useEffect(() => {
    const init = async () => {
      const members = await fetchHouseholdMembers()
      setHouseholdMembers(members)
      await loadBusiness()
    }
    void init()
    const handleSync = () => void loadBusiness()
    window.addEventListener('shared-data-updated', handleSync)
    return () => window.removeEventListener('shared-data-updated', handleSync)
  }, [businessId])

  const loadBusiness = async () => {
    const b = await businessStore.getById(businessId)
    if (b) {
      setBusiness(b)
      setYpayClientId(b.ypayClientId || '')
      setYpayClientSecret(b.ypayClientSecret || '')
      setSelectedUserId(b.userId || '')
    }
  }

  const saveOwner = async () => {
    await businessStore.update(businessId, { userId: selectedUserId || undefined })
    await loadBusiness()
    setOwnerSaved(true)
    setTimeout(() => setOwnerSaved(false), 2000)
  }

  const saveYpayCredentials = async () => {
    const clientId = ypayClientId.trim()
    const clientSecret = ypayClientSecret.trim()
    await businessStore.update(businessId, { ypayClientId: clientId, ypayClientSecret: clientSecret })
    setYpayStatus({ type: 'success', message: 'נשמר' })
  }

  const testYpayConnection = async () => {
    const clientId = ypayClientId.trim()
    const clientSecret = ypayClientSecret.trim()
    if (!clientId || !clientSecret) {
      setYpayStatus({ type: 'error', message: 'יש להזין Client ID ו-Secret' })
      return
    }
    setYpayStatus({ type: 'idle', message: 'בודק...' })
    const result = await ypayService.testConnection({ clientId, clientSecret })
    if (result.success) {
      await businessStore.update(businessId, { ypayClientId: clientId, ypayClientSecret: clientSecret })
    }
    setYpayStatus({ type: result.success ? 'success' : 'error', message: result.message })
  }

  if (!business) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Owner assignment */}
      <section style={{ padding: '1rem', border: '1px solid #e2e8f0', borderRadius: '0.75rem', background: '#f0f9ff' }}>
        <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 600 }}>בעלים</h3>
        <p style={{ margin: '0 0 1rem', color: '#1e40af', fontSize: '0.85rem' }}>שייך את העסק למשתמש במשק הבית</p>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <select
            value={selectedUserId}
            onChange={e => setSelectedUserId(e.target.value)}
            style={{ flex: 1, padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', fontSize: '0.9rem' }}
          >
            <option value="">לא משויך</option>
            {householdMembers.map(m => (
              <option key={m.uid} value={m.uid}>{m.label}</option>
            ))}
          </select>
          <button onClick={() => void saveOwner()} className="file-picker" style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}>
            שמור
          </button>
          {ownerSaved && <span style={{ fontSize: '0.85rem', color: '#16a34a' }}>נשמר</span>}
        </div>
      </section>

      {/* Business sharing */}
      <BusinessSharingSection business={business} />

      <section style={{ padding: '1rem', border: '1px solid #e2e8f0', borderRadius: '0.75rem', background: '#faf5ff' }}>
        <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 600 }}>YPAY - חשבוניות</h3>
        <p style={{ margin: '0 0 1rem', color: '#6b21a8', fontSize: '0.85rem' }}>הגדרות חיבור לשירות החשבוניות של YPAY</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <label style={{ minWidth: '90px', fontWeight: 500, fontSize: '0.9rem' }}>Client ID:</label>
            <input
              type="text"
              value={ypayClientId}
              onChange={(e) => setYpayClientId(e.target.value)}
              style={{ flex: 1, padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', fontSize: '0.9rem' }}
              placeholder="Client ID"
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <label style={{ minWidth: '90px', fontWeight: 500, fontSize: '0.9rem' }}>Secret:</label>
            <input
              type="password"
              value={ypayClientSecret}
              onChange={(e) => setYpayClientSecret(e.target.value)}
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
