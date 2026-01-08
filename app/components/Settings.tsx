'use client'

import React, { useState, useEffect } from 'react'
import SettingsTabs, { type TabItem } from './settings/SettingsTabs'
import CategoriesTab from './settings/CategoriesTab'
import BusinessesTab from './settings/BusinessesTab'
import SyncTab from './settings/SyncTab'
import AdvancedTab from './settings/AdvancedTab'
import { userTierStore, UserTier } from '@/app/stores/userTierStore'

type TabItemWithTier = TabItem & { requiredTier?: UserTier }

const ALL_TABS: TabItemWithTier[] = [
  { id: 'categories', label: 'נושאים', icon: '🏷️', requiredTier: UserTier.FREEMIUM },
  { id: 'businesses', label: 'עסקים', icon: '🏢', requiredTier: UserTier.BUSINESS },
  { id: 'sync', label: 'סנכרון', icon: '☁️', requiredTier: UserTier.FREEMIUM },
  { id: 'advanced', label: 'מתקדם', icon: '⚙️', requiredTier: UserTier.FREEMIUM },
]

export default function Settings() {
  const [userTier, setUserTier] = useState<UserTier>(userTierStore.get())

  // Filter tabs based on user tier
  const tabs = ALL_TABS.filter(tab =>
    !tab.requiredTier || userTierStore.hasAccess(tab.requiredTier)
  )

  useEffect(() => {
    // Subscribe to tier changes
    const unsubscribe = userTierStore.subscribe((tier) => {
      setUserTier(tier)
    })

    return unsubscribe
  }, [])

  return (
    <div className="card">
      <header>
        <h1>הגדרות</h1>
        <p>ניהול נושאים, עסקים וסנכרון</p>
      </header>

      <SettingsTabs tabs={tabs} defaultTab="categories">
        {(activeTab) => (
          <>
            {activeTab === 'categories' && <CategoriesTab />}
            {activeTab === 'businesses' && <BusinessesTab />}
            {activeTab === 'sync' && <SyncTab />}
            {activeTab === 'advanced' && <AdvancedTab />}
          </>
        )}
      </SettingsTabs>
    </div>
  )
}
