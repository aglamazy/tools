'use client'

import React, { Suspense, useState, useCallback } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

export type TabItem = {
  id: string
  label: string
  icon: string
}

type SettingsTabsProps = {
  tabs: TabItem[]
  defaultTab?: string
  children: (activeTab: string) => React.ReactNode
}

export default function SettingsTabs(props: SettingsTabsProps) {
  return (
    <Suspense fallback={<div>טוען...</div>}>
      <SettingsTabsContent {...props} />
    </Suspense>
  )
}

function SettingsTabsContent({ tabs, defaultTab, children }: SettingsTabsProps) {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()

  const fallbackTab = defaultTab || tabs[0]?.id || ''
  const tabFromQuery = searchParams.get('tab')
  const initialTab = tabs.some((t) => t.id === tabFromQuery) ? tabFromQuery! : fallbackTab

  const [activeTab, setActiveTab] = useState(initialTab)

  const handleTabChange = useCallback((tabId: string) => {
    setActiveTab(tabId)
    const params = new URLSearchParams(window.location.search)
    params.set('tab', tabId)
    window.history.replaceState(null, '', `${pathname}?${params.toString()}`)
  }, [pathname])

  const tabStyle = (tabId: string) => ({
    padding: '0.75rem 1.5rem',
    fontSize: '0.95rem',
    fontWeight: 500,
    background: activeTab === tabId ? '#ffffff' : 'transparent',
    border: 'none',
    borderBottom: activeTab === tabId ? '2px solid #3b82f6' : '2px solid transparent',
    cursor: 'pointer',
    color: activeTab === tabId ? '#1e40af' : '#64748b',
    transition: 'all 0.15s ease',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    whiteSpace: 'nowrap',
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
        flexWrap: 'wrap',
      }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            style={tabStyle(tab.id)}
            onClick={() => handleTabChange(tab.id)}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>
      {children(activeTab)}
    </>
  )
}
