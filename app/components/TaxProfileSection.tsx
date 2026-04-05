'use client'

import React, { useEffect, useState } from 'react'
import { db } from '@/app/db/financeDB'

export type TaxProfile = {
  vatType?: 'exempt' | 'authorized'
  isTaxFree?: boolean
  btlAdvancePayment?: number
  incomeTaxAdvancePercent?: number
  incomeTaxAdvancePeriod?: 1 | 2
  taxOrder?: number
}

const TAX_PROFILE_KEY = 'taxProfile'

/**
 * Load tax profile from appSettings
 */
export async function getTaxProfile(): Promise<TaxProfile> {
  const row = await db.appSettings.where('key').equals(TAX_PROFILE_KEY).first()
  return (row?.value as TaxProfile) || {}
}

/**
 * Save tax profile to appSettings
 */
export async function saveTaxProfile(profile: TaxProfile): Promise<void> {
  const existing = await db.appSettings.where('key').equals(TAX_PROFILE_KEY).first()
  if (existing) {
    await db.appSettings.update(existing.id!, { value: profile, updatedAt: new Date().toISOString() })
  } else {
    await db.appSettings.add({ key: TAX_PROFILE_KEY, value: profile, updatedAt: new Date().toISOString() })
  }
}

export default function TaxProfileSection() {
  const [profile, setProfile] = useState<TaxProfile>({})
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getTaxProfile().then(p => { setProfile(p); setLoading(false) })
  }, [])

  const update = (changes: Partial<TaxProfile>) => {
    setProfile(prev => ({ ...prev, ...changes }))
    setSaved(false)
  }

  const handleSave = async () => {
    await saveTaxProfile(profile)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (loading) return null

  const showAdvances = !profile.isTaxFree
  const showTaxOrder = !profile.isTaxFree

  return (
    <section style={{
      padding: '1rem',
      border: '1px solid #e2e8f0',
      borderRadius: '0.75rem',
      background: '#f0f9ff',
      marginBottom: '1.5rem',
    }}>
      <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 600 }}>הגדרות מס</h3>
      <p style={{ margin: '0 0 1rem', color: '#1e40af', fontSize: '0.85rem' }}>
        הגדרות אלו חלות על כל העסקים שלך
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* VAT type */}
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
            סוג עוסק (למע"מ)
          </label>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="radio"
                name="profileVatType"
                checked={profile.vatType === 'exempt' && !profile.isTaxFree}
                onChange={() => update({ vatType: 'exempt', isTaxFree: false })}
              />
              <span>פטור</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="radio"
                name="profileVatType"
                checked={profile.vatType === 'authorized'}
                onChange={() => update({ vatType: 'authorized', isTaxFree: false })}
              />
              <span>עוסק מורשה</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="radio"
                name="profileVatType"
                checked={profile.isTaxFree === true}
                onChange={() => update({ vatType: 'exempt', isTaxFree: true })}
              />
              <span>השכרת דירה</span>
            </label>
          </div>
          <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
            {profile.isTaxFree ? 'השכרת דירה למגורים — פטור ממס עד לתקרה' : profile.vatType === 'exempt' ? 'יופק: קבלה' : profile.vatType === 'authorized' ? 'יופק: חשבונית מס קבלה' : ''}
          </span>
        </div>

        {/* Advance payments */}
        {showAdvances && (
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
              מקדמות
            </label>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <div style={{ flex: 1 }}>
                <input
                  type="number"
                  value={profile.btlAdvancePayment || ''}
                  onChange={e => update({ btlAdvancePayment: e.target.value ? Number(e.target.value) : undefined })}
                  style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0', fontSize: '0.9rem', direction: 'ltr' }}
                  placeholder="₪ בל״ל חודשי"
                  min={0}
                />
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>ביטוח לאומי (סכום חודשי)</span>
              </div>
              <div style={{ flex: 1 }}>
                <input
                  type="number"
                  value={profile.incomeTaxAdvancePercent ?? ''}
                  onChange={e => update({ incomeTaxAdvancePercent: e.target.value ? Number(e.target.value) : undefined })}
                  style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0', fontSize: '0.9rem', direction: 'ltr' }}
                  placeholder="% מס הכנסה"
                  min={0}
                  max={100}
                  step={0.1}
                />
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>מס הכנסה (% מההכנסה)</span>
              </div>
            </div>
            {(profile.incomeTaxAdvancePercent ?? 0) > 0 && (
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '0.25rem' }}>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>תקופת תשלום:</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer', fontSize: '0.8rem' }}>
                  <input type="radio" name="profileAdvancePeriod" checked={(profile.incomeTaxAdvancePeriod ?? 1) === 1} onChange={() => update({ incomeTaxAdvancePeriod: 1 })} />
                  חודשי
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer', fontSize: '0.8rem' }}>
                  <input type="radio" name="profileAdvancePeriod" checked={profile.incomeTaxAdvancePeriod === 2} onChange={() => update({ incomeTaxAdvancePeriod: 2 })} />
                  דו-חודשי
                </label>
              </div>
            )}
          </div>
        )}

        {/* Tax order */}
        {showTaxOrder && (
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
              סדר לחישוב מס
            </label>
            <input
              type="number"
              value={profile.taxOrder ?? ''}
              onChange={e => update({ taxOrder: e.target.value ? Number(e.target.value) : undefined })}
              style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0', fontSize: '0.9rem', direction: 'ltr' }}
              placeholder="1, 2, 3..."
              min={1}
            />
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
              1 = ראשון (מדרגות נמוכות), 2 = שני (ממשיך מהראשון), וכו׳
            </span>
          </div>
        )}

        {/* Save */}
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button onClick={() => void handleSave()} className="file-picker" style={{ padding: '0.5rem 1.5rem', fontSize: '0.875rem' }}>
            שמור
          </button>
          {saved && <span style={{ fontSize: '0.85rem', color: '#16a34a' }}>נשמר</span>}
        </div>
      </div>
    </section>
  )
}
