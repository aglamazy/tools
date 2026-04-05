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
import AuditionsTab from './AuditionsTab'
import OpenDocumentsTab from './OpenDocumentsTab'
import BizSettingsTab from './BizSettingsTab'
import ExpenseTab from './ExpenseTab'
import ExtensionLink from './ExtensionLink'
import BusinessTasksTab from './BusinessTasksTab'
import FilesSubTab from './TaxFilesSubTab'
import { getUser } from '@/app/stores/authStore'
import { getHouseholdInfo } from '@/app/services/householdService'
import { getTaxProfile } from '@/app/components/TaxProfileSection'

async function loadHouseholdMembers() {
  const currentUser = getUser()
  const members: { uid: string; label: string }[] = []
  try {
    const info = await getHouseholdInfo()
    if (info.household) {
      const names = (info.household as any).memberNames || {}
      const emails = (info.household as any).memberEmails || {}
      for (const uid of info.household.members) {
        members.push({ uid, label: names[uid] || emails[uid] || uid })
      }
      return members
    }
  } catch { /* no household */ }
  if (currentUser) {
    members.push({ uid: currentUser.uid, label: currentUser.displayName || currentUser.email || currentUser.uid })
  }
  return members
}
const TABS: TabItem[] = [
  { id: 'income', label: 'הכנסות', icon: '💰' },
  { id: 'expenses', label: 'הוצאות', icon: '💸' },
  { id: 'timing', label: 'תיעוד זמן', icon: '⏱️' },
  { id: 'open-docs', label: 'מסמכים פתוחים', icon: '📄' },
  { id: 'tasks', label: 'משימות', icon: '✅' },
  { id: 'projects', label: 'פרויקטים', icon: '📂' },
  { id: 'settings', label: 'הגדרות', icon: '⚙️' },
  { id: 'extension', label: 'תוסף', icon: '🧩' },
]

const APARTMENT_TABS: TabItem[] = [
  { id: 'income', label: 'הכנסות', icon: '💰' },
]

const TEACHER_TABS: TabItem[] = [
  { id: 'students', label: 'תלמידים', icon: '👨‍🎓' },
  { id: 'accounting', label: 'חשבונאות חודשית', icon: '📊' },
  { id: 'tasks', label: 'משימות', icon: '✅' },
  { id: 'projects', label: 'פרויקטים', icon: '📂' },
  { id: 'settings', label: 'הגדרות', icon: '⚙️' },
]

const EMPLOYEE_TABS: TabItem[] = [
  { id: 'payslips', label: 'תלושים', icon: '📄' },
  { id: 'tasks', label: 'משימות', icon: '✅' },
  { id: 'settings', label: 'הגדרות', icon: '⚙️' },
]

const ARTIST_TABS: TabItem[] = [
  { id: 'profile', label: 'פרופיל', icon: '📋' },
  { id: 'auditions', label: 'אודישנים', icon: '🔍' },
  { id: 'income', label: 'הכנסות', icon: '💰' },
  { id: 'expenses', label: 'הוצאות', icon: '💸' },
  { id: 'tasks', label: 'משימות', icon: '✅' },
  { id: 'projects', label: 'פרויקטים', icon: '📂' },
  { id: 'settings', label: 'הגדרות', icon: '⚙️' },
  { id: 'extension', label: 'תוסף', icon: '🧩' },
]

type BusinessPageProps = {
  businessId: number
}

export default function BusinessPage({ businessId }: BusinessPageProps) {
  const [business, setBusiness] = useState<Business | null>(null)
  const [loading, setLoading] = useState(true)
  const [isTaxFree, setIsTaxFree] = useState(false)

  useEffect(() => {
    const load = async () => {
      const [b, profile] = await Promise.all([
        businessStore.getById(businessId),
        getTaxProfile(),
      ])
      setBusiness(b || null)
      setIsTaxFree(!!profile.isTaxFree)
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

      {business.type === BusinessType.Employee ? (
        <SettingsTabs tabs={EMPLOYEE_TABS} defaultTab="payslips">
          {(activeTab) => (
            <>
              {activeTab === 'payslips' && <FilesSubTab loadHouseholdMembers={loadHouseholdMembers} businessId={businessId} />}
              {activeTab === 'tasks' && <BusinessTasksTab businessId={businessId} />}
              {activeTab === 'settings' && <BizSettingsTab businessId={businessId} />}
            </>
          )}
        </SettingsTabs>
      ) : business.type === BusinessType.Teacher ? (
        <SettingsTabs tabs={TEACHER_TABS} defaultTab="students">
          {(activeTab) => (
            <>
              {activeTab === 'students' && <StudentsTab businessId={businessId} />}
              {activeTab === 'accounting' && <AccountingTab businessId={businessId} />}
              {activeTab === 'tasks' && <BusinessTasksTab businessId={businessId} />}
              {activeTab === 'projects' && <BusinessSettingsTab businessId={businessId} />}
              {activeTab === 'settings' && <BizSettingsTab businessId={businessId} />}
            </>
          )}
        </SettingsTabs>
      ) : business.type === BusinessType.Artist ? (
        <SettingsTabs tabs={ARTIST_TABS} defaultTab="profile">
          {(activeTab) => (
            <>
              {activeTab === 'profile' && <ProfileTab businessId={businessId} />}
              {activeTab === 'auditions' && <AuditionsTab businessId={businessId} />}
              {activeTab === 'income' && <IncomeTab businessId={businessId} />}
              {activeTab === 'expenses' && <ExpenseTab businessId={businessId} />}
              {activeTab === 'tasks' && <BusinessTasksTab businessId={businessId} />}
              {activeTab === 'projects' && <BusinessSettingsTab businessId={businessId} />}
              {activeTab === 'settings' && <BizSettingsTab businessId={businessId} />}
              {activeTab === 'extension' && <ExtensionLink />}
            </>
          )}
        </SettingsTabs>
      ) : isTaxFree ? (
        <SettingsTabs tabs={APARTMENT_TABS} defaultTab="income">
          {(activeTab) => (
            <>
              {activeTab === 'income' && <IncomeTab businessId={businessId} />}
            </>
          )}
        </SettingsTabs>
      ) : (
        <SettingsTabs tabs={isTaxFree ? APARTMENT_TABS : TABS} defaultTab="income">
          {(activeTab) => (
            <>
              {activeTab === 'income' && <IncomeTab businessId={businessId} />}
              {activeTab === 'expenses' && <ExpenseTab businessId={businessId} />}
              {activeTab === 'timing' && <TimingTab businessId={businessId} />}
              {activeTab === 'open-docs' && <OpenDocumentsTab businessId={businessId} />}
              {activeTab === 'tasks' && <BusinessTasksTab businessId={businessId} />}
              {activeTab === 'projects' && <BusinessSettingsTab businessId={businessId} />}
              {activeTab === 'settings' && <BizSettingsTab businessId={businessId} />}
            </>
          )}
        </SettingsTabs>
      )}
    </div>
  )
}
