'use client'

import React from 'react'
import SettingsTabs, { type TabItem } from './settings/SettingsTabs'
import CategoriesTab from './settings/CategoriesTab'
import BusinessesTab from './settings/BusinessesTab'
import SyncTab from './settings/SyncTab'
import AdvancedTab from './settings/AdvancedTab'

const TABS: TabItem[] = [
  { id: 'categories', label: 'נושאים', icon: '🏷️' },
  { id: 'businesses', label: 'עסקים', icon: '🏢' },
  { id: 'sync', label: 'סנכרון', icon: '☁️' },
  { id: 'advanced', label: 'מתקדם', icon: '⚙️' },
]

export default function Settings() {
  return (
    <div className="card">
      <header>
        <h1>הגדרות</h1>
        <p>ניהול נושאים, עסקים וסנכרון</p>
      </header>

      <SettingsTabs tabs={TABS} defaultTab="categories">
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
