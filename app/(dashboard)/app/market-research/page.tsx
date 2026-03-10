'use client'

import { useState, useEffect } from 'react'
import MarketResearchChat from '@/app/components/MarketResearchChat'
import { db } from '@/app/db/financeDB'
import type { SearchStrategyId } from '@/app/services/product-search/types'

type Tab = {
  id: SearchStrategyId
  label: string
  subtitle: string
  requiresUserKey: boolean
}

const TABS: Tab[] = [
  {
    id: 'gemini-web',
    label: 'Gemini + Web Search',
    subtitle: 'Gemini עם חיפוש אינטרנט',
    requiresUserKey: false,
  },
  {
    id: 'claude-web',
    label: 'Claude + Web Search',
    subtitle: 'Claude עם חיפוש אינטרנט',
    requiresUserKey: true,
  },
]

const tabBarStyle: React.CSSProperties = {
  display: 'flex',
  gap: '4px',
  padding: '8px 12px',
  background: '#f5f5f5',
  borderBottom: '1px solid #e0e0e0',
  flexShrink: 0,
  width: '100%',
}

const tabBtnBase: React.CSSProperties = {
  padding: '6px 16px',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '13px',
  transition: 'all 0.15s ease',
}

export default function MarketResearchPage() {
  const [activeTab, setActiveTab] = useState<SearchStrategyId>('gemini-web')
  const [claudeKey, setClaudeKey] = useState('')

  useEffect(() => {
    db.appSettings.where('key').equals('claudeApiKey').first().then(row => {
      if (row?.value) setClaudeKey(row.value as string)
    }).catch(() => {})
  }, [])

  return (
    <div dir="rtl" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)' }}>
      {/* Tab bar */}
      <div style={tabBarStyle}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              ...tabBtnBase,
              fontWeight: activeTab === tab.id ? 600 : 400,
              background: activeTab === tab.id ? '#4f46e5' : 'transparent',
              color: activeTab === tab.id ? '#fff' : '#555',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Active tab content — uses mr-page layout */}
      {TABS.map((tab) => (
        <main
          key={tab.id}
          className="mr-page"
          style={{
            display: activeTab === tab.id ? 'flex' : 'none',
            flex: 1,
            minHeight: 0,
            height: 'auto',
          }}
        >
          <MarketResearchChat
            title={tab.label}
            subtitle={tab.subtitle}
            strategy={tab.id}
            apiKey={tab.requiresUserKey ? claudeKey : undefined}
          />
        </main>
      ))}
    </div>
  )
}
