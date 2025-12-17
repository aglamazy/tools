'use client'

import React, { useEffect, useState } from 'react'
import { businessStore } from '@/app/stores/businessStore'
import type { Business } from '@/app/db/financeDB'
import SettingsTabs, { type TabItem } from '../settings/SettingsTabs'
import TimingTab from './TimingTab'
import BusinessSettingsTab from './BusinessSettingsTab'

const TABS: TabItem[] = [
  { id: 'timing', label: 'תיעוד זמן', icon: '⏱️' },
  { id: 'settings', label: 'הגדרות', icon: '⚙️' },
]

type BusinessPageProps = {
  businessId: number
}

export default function BusinessPage({ businessId }: BusinessPageProps) {
  const [business, setBusiness] = useState<Business | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const b = await businessStore.getById(businessId)
      setBusiness(b || null)
      setLoading(false)
    }
    void load()
  }, [businessId])

  if (loading) {
    return (
      <div className="card">
        <p>טוען...</p>
      </div>
    )
  }

  if (!business) {
    return (
      <div className="card">
        <p>עסק לא נמצא</p>
      </div>
    )
  }

  return (
    <div className="card">
      <header>
        <h1>
          <span style={{ marginLeft: '0.5rem' }}>
            {business.type === 'personal' ? '🏠' : '🏢'}
          </span>
          {business.name}
        </h1>
      </header>

      <SettingsTabs tabs={TABS} defaultTab="timing">
        {(activeTab) => (
          <>
            {activeTab === 'timing' && <TimingTab businessId={businessId} />}
            {activeTab === 'settings' && <BusinessSettingsTab businessId={businessId} />}
          </>
        )}
      </SettingsTabs>
    </div>
  )
}
