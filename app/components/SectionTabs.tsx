'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { getActiveSection, sectionTabs, type SectionTab } from '@/app/lib/navigationSections'
import { businessStore } from '@/app/stores/businessStore'
import { userTierStore, UserTier } from '@/app/stores/userTierStore'
import { BUSINESS_TYPE_CONFIG } from '@/app/types/businessColors'
import type { Business } from '@/app/db/financeDB'
import { routes } from '@/app/config'

const tierLabels: Record<UserTier, string> = {
  [UserTier.FREE]: 'חינם',
  [UserTier.HOME]: 'בית',
  [UserTier.PRO]: 'מקצועי',
  [UserTier.OWNER]: 'בעלים',
}

export default function SectionTabs() {
  const pathname = usePathname()
  const section = getActiveSection(pathname)
  const [pinnedBusinesses, setPinnedBusinesses] = useState<Business[]>([])
  const [userTier, setUserTier] = useState<UserTier>(userTierStore.get())
  const [upgradePrompt, setUpgradePrompt] = useState<{ tab: SectionTab } | null>(null)

  useEffect(() => {
    const loadBusinesses = async () => {
      const all = await businessStore.getAll()
      setPinnedBusinesses(all.filter(b => b.pinnedToSidebar))
    }
    void loadBusinesses()

    const handleRefresh = () => void loadBusinesses()
    window.addEventListener('sidebar-refresh', handleRefresh)

    const unsubscribeTier = userTierStore.subscribe(setUserTier)

    return () => {
      window.removeEventListener('sidebar-refresh', handleRefresh)
      unsubscribeTier()
    }
  }, [])

  if (!section) return null

  const tabs = sectionTabs[section]

  // Build dynamic business tabs for the business section
  const businessTabs: { id: string; label: string; href: string; icon?: string }[] = []
  if (section === 'business' && userTierStore.hasAccess(UserTier.PRO)) {
    for (const biz of pinnedBusinesses) {
      businessTabs.push({
        id: `biz-${biz.id}`,
        label: biz.name,
        href: `/app/business/${biz.id}`,
        icon: BUSINESS_TYPE_CONFIG[biz.type]?.icon,
      })
    }
  }

  const allTabs = tabs.length + businessTabs.length
  if (allTabs <= 0) return null

  const handleLockedClick = (tab: SectionTab) => {
    setUpgradePrompt({ tab })
  }

  return (
    <>
      <div className="section-tabs">
        <div className="section-tabs-inner">
          {tabs.map((tab) => {
            const hasAccess = userTierStore.hasAccess(tab.requiredTier)
            const isActive = pathname === tab.href || pathname.startsWith(tab.href + '/')
            if (hasAccess) {
              return (
                <Link
                  key={tab.id}
                  href={tab.href}
                  className={`section-tab ${isActive ? 'section-tab-active' : ''}`}
                >
                  {tab.label}
                </Link>
              )
            }
            return (
              <button
                key={tab.id}
                className="section-tab section-tab-locked"
                onClick={() => handleLockedClick(tab)}
              >
                {tab.label} 🔒
              </button>
            )
          })}
          {businessTabs.map((biz) => {
            const isActive = pathname === biz.href
            return (
              <Link
                key={biz.id}
                href={biz.href}
                className={`section-tab ${isActive ? 'section-tab-active' : ''}`}
              >
                {biz.icon && <span className="section-tab-icon">{biz.icon}</span>}
                {biz.label}
              </Link>
            )
          })}
        </div>
      </div>

      {upgradePrompt && (
        <div className="upgrade-modal-overlay" onClick={() => setUpgradePrompt(null)}>
          <div className="upgrade-modal" onClick={(e) => e.stopPropagation()}>
            <h3>🔒 {upgradePrompt.tab.label}</h3>
            <p>
              תכונה זו דורשת מנוי <strong>{tierLabels[upgradePrompt.tab.requiredTier]}</strong>
            </p>
            <p className="upgrade-modal-current">
              המנוי הנוכחי שלך: {tierLabels[userTier]}
            </p>
            <div className="upgrade-modal-actions">
              <button onClick={() => setUpgradePrompt(null)}>סגור</button>
              <Link href={routes.pricing} className="upgrade-btn" onClick={() => setUpgradePrompt(null)}>
                שדרג עכשיו
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
