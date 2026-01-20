'use client'

import React, { Suspense, useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

export type TabItem = {
  id: string
  label: string
  icon: string
  locked?: boolean
}

type SettingsTabsProps = {
  tabs: TabItem[]
  defaultTab?: string
  children: (activeTab: string) => React.ReactNode
  onLockedTabClick?: (tabLabel: string) => void
}

export default function SettingsTabs(props: SettingsTabsProps) {
  return (
    <Suspense fallback={<div>טוען...</div>}>
      <SettingsTabsContent {...props} />
    </Suspense>
  )
}

function SettingsTabsContent({ tabs, defaultTab, children, onLockedTabClick }: SettingsTabsProps) {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()

  // Only consider non-locked tabs for default and navigation
  const accessibleTabs = tabs.filter(t => !t.locked)
  const fallbackTab = defaultTab || accessibleTabs[0]?.id || ''
  const tabFromQuery = searchParams.get('tab')
  const initialTab = accessibleTabs.some((t) => t.id === tabFromQuery) ? tabFromQuery! : fallbackTab

  const [activeTab, setActiveTab] = useState(initialTab)

  useEffect(() => {
    const tabParam = searchParams.get('tab')
    if (tabParam && tabParam !== activeTab && accessibleTabs.some((t) => t.id === tabParam)) {
      setActiveTab(tabParam)
    }
  }, [searchParams, accessibleTabs, activeTab])

  const handleTabChange = (tab: TabItem) => {
    if (tab.locked) {
      onLockedTabClick?.(tab.label)
      return
    }

    setActiveTab(tab.id)
    const params = new URLSearchParams(Array.from(searchParams.entries()))
    params.set('tab', tab.id)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  const tabStyle = (tab: TabItem) => ({
    padding: '0.75rem 1.5rem',
    fontSize: '0.95rem',
    fontWeight: 500,
    background: activeTab === tab.id ? '#ffffff' : 'transparent',
    border: 'none',
    borderBottom: activeTab === tab.id ? '2px solid #3b82f6' : '2px solid transparent',
    cursor: tab.locked ? 'pointer' : 'pointer',
    color: tab.locked ? '#94a3b8' : activeTab === tab.id ? '#1e40af' : '#64748b',
    transition: 'all 0.15s ease',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  })

  return (
    <>
      <div style={{
        display: 'flex',
        gap: '0.25rem',
        borderBottom: '1px solid #e2e8f0',
        marginBottom: '1.5rem',
        background: '#f8fafc',
        borderRadius: '0.5rem 0.5rem 0 0',
        padding: '0.25rem 0.25rem 0',
      }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            style={tabStyle(tab)}
            onClick={() => handleTabChange(tab)}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
            {tab.locked && <span style={{ fontSize: '0.75rem' }}>🔒</span>}
          </button>
        ))}
      </div>
      {children(activeTab)}
    </>
  )
}
