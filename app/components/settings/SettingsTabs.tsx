'use client'

import React, { Suspense, useState, useCallback, useEffect } from 'react'
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

  // useState's initializer only runs on mount — if a real Next.js navigation
  // (router.push, e.g. the chat's navigateTo) changes ?tab= while this page is
  // already mounted, activeTab would otherwise stay stuck on whatever it was
  // before. Manual tab clicks use window.history.replaceState below, which
  // Next's useSearchParams doesn't observe, so this effect never fights them.
  useEffect(() => {
    const tabFromQuery = searchParams.get('tab')
    if (tabFromQuery && tabFromQuery !== activeTab && tabs.some((t) => t.id === tabFromQuery)) {
      setActiveTab(tabFromQuery)
    }
  }, [searchParams, activeTab, tabs])

  const handleTabChange = useCallback((tabId: string) => {
    setActiveTab(tabId)
    const params = new URLSearchParams(window.location.search)
    params.set('tab', tabId)
    window.history.replaceState(null, '', `${pathname}?${params.toString()}`)
  }, [pathname])

  const tabStyle = (tabId: string) => ({
    padding: '0.6rem 1rem',
    fontSize: '0.9rem',
    fontWeight: 500,
    background: activeTab === tabId ? '#ffffff' : 'transparent',
    border: 'none',
    borderBottom: activeTab === tabId ? '2px solid #3b82f6' : '2px solid transparent',
    cursor: 'pointer',
    color: activeTab === tabId ? '#1e40af' : '#64748b',
    transition: 'all 0.15s ease',
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
  })

  return (
    <>
      <div style={{
        display: 'flex',
        gap: '0.15rem',
        borderBottom: '1px solid #e2e8f0',
        marginBottom: '1.5rem',
        background: '#f8fafc',
        borderRadius: '0.5rem 0.5rem 0 0',
        padding: '0.25rem 0.25rem 0',
        flexWrap: 'nowrap',
        overflowX: 'auto',
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
