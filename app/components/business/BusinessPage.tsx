'use client'

import React, { useEffect, useState } from 'react'
import { businessStore } from '@/app/stores/businessStore'
import type { Business } from '@/app/db/financeDB'
import { BusinessType } from '@/app/types/business'
import { BUSINESS_TYPE_CONFIG } from '@/app/types/businessColors'
import SettingsTabs, { type TabItem } from '../settings/SettingsTabs'
import TimingTab from './TimingTab'
import IncomeTab from './IncomeTab'
import BusinessSettingsTab from './BusinessSettingsTab'
import StudentsTab from './StudentsTab'
import AccountingTab from './AccountingTab'
import ProfileTab from './ProfileTab'

const TABS: TabItem[] = [
  { id: 'income', label: 'הכנסות', icon: '💰' },
  { id: 'timing', label: 'תיעוד זמן', icon: '⏱️' },
  { id: 'settings', label: 'הגדרות', icon: '⚙️' },
]

const TEACHER_TABS: TabItem[] = [
  { id: 'students', label: 'תלמידים', icon: '👨‍🎓' },
  { id: 'accounting', label: 'חשבונאות חודשית', icon: '📊' },
  { id: 'settings', label: 'הגדרות', icon: '⚙️' },
]

const ARTIST_TABS: TabItem[] = [
  { id: 'profile', label: 'פרופיל', icon: '📋' },
  { id: 'income', label: 'הכנסות', icon: '💰' },
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
            {BUSINESS_TYPE_CONFIG[business.type].icon}
          </span>
          {business.name}
        </h1>
      </header>

      {business.type === BusinessType.Teacher ? (
        <SettingsTabs tabs={TEACHER_TABS} defaultTab="students">
          {(activeTab) => (
            <>
              {activeTab === 'students' && <StudentsTab businessId={businessId} />}
              {activeTab === 'accounting' && <AccountingTab businessId={businessId} />}
              {activeTab === 'settings' && <BusinessSettingsTab businessId={businessId} />}
            </>
          )}
        </SettingsTabs>
      ) : business.type === BusinessType.Artist ? (
        <SettingsTabs tabs={ARTIST_TABS} defaultTab="profile">
          {(activeTab) => (
            <>
              {activeTab === 'profile' && <ProfileTab businessId={businessId} />}
              {activeTab === 'income' && <IncomeTab businessId={businessId} />}
              {activeTab === 'settings' && <BusinessSettingsTab businessId={businessId} />}
            </>
          )}
        </SettingsTabs>
      ) : (
        <SettingsTabs tabs={TABS} defaultTab="income">
          {(activeTab) => (
            <>
              {activeTab === 'income' && <IncomeTab businessId={businessId} />}
              {activeTab === 'timing' && <TimingTab businessId={businessId} />}
              {activeTab === 'settings' && <BusinessSettingsTab businessId={businessId} />}
            </>
          )}
        </SettingsTabs>
      )}
    </div>
  )
}
