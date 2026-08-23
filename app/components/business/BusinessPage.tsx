'use client'

import React, { useEffect, useState } from 'react'
import { businessStore } from '@/app/stores/businessStore'
import type { Business } from '@/app/db/financeDB'
import { BusinessType } from '@/app/types/business'
import { BUSINESS_TYPE_CONFIG } from '@/app/types/businessColors'
import SettingsTabs, { type TabItem } from '../settings/SettingsTabs'
import TimingTab from './TimingTab'
import InvoicesTab from './InvoicesTab'
import IncomeTab from './IncomeTab'
import BusinessSettingsTab from './BusinessSettingsTab'
import StudentsTab from './StudentsTab'
import AccountingTab from './AccountingTab'
import ProfileTab from './ProfileTab'
import AuditionsTab from './AuditionsTab'
import OpenDocumentsTab from './OpenDocumentsTab'
import BizSettingsTab from './BizSettingsTab'
import ExpenseTab from './ExpenseTab'
import SettlementSummary from './SettlementSummary'
import BusinessTasksTab from './BusinessTasksTab'
import FilesSubTab from './TaxFilesSubTab'
import { getUser } from '@/app/stores/authStore'
import { getHouseholdInfo } from '@/app/services/householdService'

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
  { id: 'settlement', label: 'התחשבנות', icon: '⚖️' },
  { id: 'timing', label: 'תיעוד זמן', icon: '⏱️' },
  { id: 'invoices', label: 'חשבוניות', icon: '🧾' },
  { id: 'open-docs', label: 'מסמכים פתוחים', icon: '📄' },
  { id: 'tasks', label: 'משימות', icon: '✅' },
  { id: 'projects', label: 'פרויקטים', icon: '📂' },
  { id: 'settings', label: 'הגדרות', icon: '⚙️' },
]

// Tabs hidden from sharees (sharedWithMe businesses)
const OWNER_ONLY_TABS = new Set(['settings'])

const APARTMENT_TABS: TabItem[] = [
  { id: 'income', label: 'הכנסות', icon: '💰' },
]

const TEACHER_TABS: TabItem[] = [
  { id: 'students', label: 'תלמידים', icon: '👨‍🎓' },
  { id: 'income', label: 'הכנסות', icon: '💰' },
  { id: 'expenses', label: 'הוצאות', icon: '💸' },
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
      const b = await businessStore.getById(businessId)
      setBusiness(b || null)
      setIsTaxFree(!!b?.isTaxFree)
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

  if (!business.syncId) {
    // Every business gets a syncId assigned at creation (Dexie hook in
    // financeDB.ts) — a missing one here means a genuinely broken record,
    // not a normal "not found" case.
    return (
      <div className="card">
        <p>עסק לא תקין — חסר מזהה סנכרון</p>
      </div>
    )
  }
  // Child tabs' `businessId` prop identifies the business by its stable
  // syncId (matches every FK field that references businesses post-2026-07-28
  // migration), not the mutable local auto-increment id used for the page's
  // own top-level lookup above.
  const businessSyncId = business.syncId

  const isSharedWithMe = !!business.sharedWithMe
  const filterTabs = (tabs: TabItem[]) =>
    isSharedWithMe ? tabs.filter(t => !OWNER_ONLY_TABS.has(t.id)) : tabs

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
        <SettingsTabs tabs={filterTabs(EMPLOYEE_TABS)} defaultTab="payslips">
          {(activeTab) => (
            <>
              {activeTab === 'payslips' && <FilesSubTab loadHouseholdMembers={loadHouseholdMembers} businessId={businessSyncId} />}
              {activeTab === 'tasks' && <BusinessTasksTab businessId={businessSyncId} />}
              {activeTab === 'settings' && <BizSettingsTab businessId={businessSyncId} />}
            </>
          )}
        </SettingsTabs>
      ) : business.type === BusinessType.Teacher ? (
        <SettingsTabs tabs={filterTabs(TEACHER_TABS)} defaultTab="students">
          {(activeTab) => (
            <>
              {activeTab === 'students' && <StudentsTab businessId={businessSyncId} />}
              {activeTab === 'income' && <IncomeTab businessId={businessSyncId} />}
              {activeTab === 'expenses' && <ExpenseTab businessId={businessSyncId} />}
              {activeTab === 'accounting' && <AccountingTab businessId={businessSyncId} />}
              {activeTab === 'tasks' && <BusinessTasksTab businessId={businessSyncId} />}
              {activeTab === 'projects' && <BusinessSettingsTab businessId={businessSyncId} />}
              {activeTab === 'settings' && <BizSettingsTab businessId={businessSyncId} />}
            </>
          )}
        </SettingsTabs>
      ) : business.type === BusinessType.Artist ? (
        <SettingsTabs tabs={filterTabs(ARTIST_TABS)} defaultTab="profile">
          {(activeTab) => (
            <>
              {activeTab === 'profile' && <ProfileTab businessId={businessSyncId} />}
              {activeTab === 'auditions' && <AuditionsTab businessId={businessSyncId} />}
              {activeTab === 'income' && <IncomeTab businessId={businessSyncId} />}
              {activeTab === 'expenses' && <ExpenseTab businessId={businessSyncId} />}
              {activeTab === 'tasks' && <BusinessTasksTab businessId={businessSyncId} />}
              {activeTab === 'projects' && <BusinessSettingsTab businessId={businessSyncId} />}
              {activeTab === 'settings' && <BizSettingsTab businessId={businessSyncId} />}
            </>
          )}
        </SettingsTabs>
      ) : isTaxFree ? (
        <SettingsTabs tabs={APARTMENT_TABS} defaultTab="income">
          {(activeTab) => (
            <>
              {activeTab === 'income' && <IncomeTab businessId={businessSyncId} />}
            </>
          )}
        </SettingsTabs>
      ) : (
        <SettingsTabs tabs={filterTabs(isTaxFree ? APARTMENT_TABS : TABS)} defaultTab="income">
          {(activeTab) => (
            <>
              {activeTab === 'income' && <IncomeTab businessId={businessSyncId} />}
              {activeTab === 'expenses' && <ExpenseTab businessId={businessSyncId} />}
              {activeTab === 'settlement' && <SettlementSummary businessId={businessSyncId} />}
              {activeTab === 'timing' && <TimingTab businessId={businessSyncId} />}
              {activeTab === 'invoices' && <InvoicesTab businessId={businessSyncId} />}
              {activeTab === 'open-docs' && <OpenDocumentsTab businessId={businessSyncId} />}
              {activeTab === 'tasks' && <BusinessTasksTab businessId={businessSyncId} />}
              {activeTab === 'projects' && <BusinessSettingsTab businessId={businessSyncId} />}
              {activeTab === 'settings' && <BizSettingsTab businessId={businessSyncId} />}
            </>
          )}
        </SettingsTabs>
      )}
    </div>
  )
}
