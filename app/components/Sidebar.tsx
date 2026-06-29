'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { businessStore } from '@/app/stores/businessStore'
import { userTierStore, UserTier } from '@/app/stores/userTierStore'
import { config, routes } from '@/app/config'
import { VARIANT_CONFIG } from '@/app/config/variants'
import { isPageAllowed } from '@/app/config/variants'
import type { Business } from '@/app/db/financeDB'
import { BUSINESS_TYPE_CONFIG } from '@/app/types/businessColors'
import { BusinessStatusBadge } from '@/app/components/TaxExemptBadge'

type MenuItem = {
  id: string
  title: string
  href: string
  icon: string
  available: boolean
  requiredTier: UserTier
}

type Module = {
  id: string
  label: string
  icon: string
  items: MenuItem[]
  includeBusinesses?: boolean
}

const allModules: Module[] = [
  {
    id: 'main',
    label: 'ראשי',
    icon: '🏠',
    items: [
      { id: 'dashboard', title: 'משק בית', href: routes.dashboard, icon: '🏠', available: true, requiredTier: UserTier.FREE },
      { id: 'import', title: 'ייבוא קבצים', href: routes.import, icon: '📥', available: true, requiredTier: UserTier.FREE },
    ],
  },
  {
    id: 'finance',
    label: 'כספים',
    icon: '💰',
    items: [
      { id: 'cash-flow', title: 'תזרים מזומנים', href: routes.cashFlow, icon: '💰', available: true, requiredTier: UserTier.FREE },
      { id: 'budget', title: 'תקציב', href: routes.budget, icon: '📊', available: true, requiredTier: UserTier.FREE },
      { id: 'credit-cards', title: 'כרטיסי אשראי', href: routes.creditCards, icon: '💳', available: true, requiredTier: UserTier.FREE },
      { id: 'future-payments', title: 'תחזית תשלומים', href: routes.futurePayments, icon: '💳', available: true, requiredTier: UserTier.PRO },
      { id: 'capital', title: 'הון', href: routes.capital, icon: '💎', available: true, requiredTier: UserTier.PRO },
    ],
  },
  {
    id: 'tax-business',
    label: 'מסים ועסקים',
    icon: '🏛️',
    includeBusinesses: true,
    items: [
      { id: 'taxes', title: 'מסים', href: routes.taxes, icon: '🏛️', available: true, requiredTier: UserTier.PRO },
    ],
  },
  {
    id: 'shopping',
    label: VARIANT_CONFIG.id === 'aglamazo' ? 'צ׳אט' : 'קניות',
    icon: VARIANT_CONFIG.id === 'aglamazo' ? '💬' : '🛒',
    items: [
      { id: 'stores', title: 'חנויות', href: routes.stores, icon: '🛒', available: true, requiredTier: UserTier.FREE },
      { id: 'chat', title: 'צ׳אט', href: routes.chat, icon: '💬', available: true, requiredTier: UserTier.FREE },
    ],
  },
  {
    id: 'tools',
    label: 'כלים',
    icon: '✓',
    items: [
{ id: 'todo', title: 'משימות', href: routes.todo, icon: '✓', available: true, requiredTier: UserTier.FREE },
      { id: 'market-research', title: 'מחקר שוק', href: routes.marketResearch, icon: '🔍', available: true, requiredTier: UserTier.PRO },
      { id: 'gmail', title: 'Gmail', href: routes.gmail, icon: '📧', available: true, requiredTier: UserTier.PRO },
    ],
  },
  {
    id: 'system',
    label: 'מערכת',
    icon: '⚙️',
    items: [
      { id: 'profile', title: 'פרופיל', href: routes.profile, icon: '👤', available: true, requiredTier: UserTier.FREE },
      { id: 'settings', title: 'הגדרות', href: routes.settings, icon: '⚙️', available: true, requiredTier: UserTier.FREE },
      { id: 'dev-db', title: 'Dev DB', href: routes.devDb, icon: '🛠️', available: true, requiredTier: UserTier.PRO },
    ],
  },
  {
    id: 'info',
    label: 'מידע',
    icon: 'ℹ️',
    items: [
      { id: 'guide', title: 'מדריך שימוש', href: routes.guide, icon: '📖', available: true, requiredTier: UserTier.FREE },
      { id: 'about', title: 'אודות', href: routes.about, icon: 'ℹ️', available: true, requiredTier: UserTier.FREE },
    ],
  },
  {
    id: 'admin-section',
    label: 'ניהול',
    icon: '👑',
    items: [
      { id: 'admin', title: 'ניהול פלטפורמה', href: routes.admin, icon: '👑', available: true, requiredTier: UserTier.OWNER },
    ],
  },
]

const tierLabels: Record<UserTier, string> = {
  [UserTier.FREE]: 'חינם',
  [UserTier.HOME]: 'בית',
  [UserTier.PRO]: 'מקצועי',
  [UserTier.OWNER]: 'בעלים',
}

export default function Sidebar({ isOpen, onClose }: { isOpen?: boolean; onClose?: () => void }) {
  const pathname = usePathname()
  const [pinnedBusinesses, setPinnedBusinesses] = useState<Business[]>([])
  const [userTier, setUserTier] = useState<UserTier>(userTierStore.get())
  const [upgradePrompt, setUpgradePrompt] = useState<{ item: MenuItem } | null>(null)

  // Filter modules based on variant whitelist, dev-mode, and tier access.
  // Variant filter runs first so a missing page id doesn't reach the
  // tier-gated branch that would otherwise show "🔒 locked".
  const modules = useMemo(() => allModules.map(mod => ({
    ...mod,
    items: mod.items
      .filter(item => isPageAllowed(item.id))
      .filter(item => config.developerMode || item.id !== 'dev-db')
      .filter(item => item.requiredTier !== UserTier.OWNER || userTierStore.hasAccess(UserTier.OWNER)),
  })).filter(mod => mod.items.length > 0 || (mod.includeBusinesses && pinnedBusinesses.length > 0)),
  [pinnedBusinesses, userTier])

  useEffect(() => {
    const loadPinnedBusinesses = async () => {
      const all = await businessStore.getAll()
      setPinnedBusinesses(all.filter(b => b.pinnedToSidebar))
    }
    void loadPinnedBusinesses()

    const handleRefresh = () => void loadPinnedBusinesses()
    window.addEventListener('sidebar-refresh', handleRefresh)

    const unsubscribeTier = userTierStore.subscribe((tier) => {
      setUserTier(tier)
    })

    return () => {
      window.removeEventListener('sidebar-refresh', handleRefresh)
      unsubscribeTier()
    }
  }, [])

  const handleLockedClick = (item: MenuItem) => {
    setUpgradePrompt({ item })
  }

  // Flatten all modules into a single list with dividers
  const flatItems = useMemo(() => {
    const result: ({ type: 'item'; item: MenuItem } | { type: 'business'; business: Business })[] = []
    for (const mod of modules) {
      for (const item of mod.items) result.push({ type: 'item' as const, item })
      if (mod.includeBusinesses && (userTierStore.hasAccess(UserTier.PRO) || pinnedBusinesses.some(b => b.sharedWithMe))) {
        for (const business of pinnedBusinesses) {
          if (userTierStore.hasAccess(UserTier.PRO) || business.sharedWithMe) {
            result.push({ type: 'business' as const, business })
          }
        }
      }
    }
    return result
  }, [modules, pinnedBusinesses])

  return (
    <aside className={`sidebar ${isOpen ? 'sidebar-open' : ''}`}>
      <nav className="sidebar-nav">
        <ul className="mod-list">
          {flatItems.map((entry, i) => {
            if (entry.type === 'business') {
              const business = entry.business
              return (
                <li key={`business-${business.id}`}>
                  <Link
                    href={`/app/business/${business.id}`}
                    className={`mod-menu-item ${pathname === `/app/business/${business.id}` ? 'active' : ''}`}
                    onClick={onClose}
                  >
                    <span className="mod-menu-icon">{BUSINESS_TYPE_CONFIG[business.type].icon}</span>
                    <span className="mod-menu-title">{business.name}</span>
                    {business.id && <BusinessStatusBadge businessId={business.id} />}
                  </Link>
                </li>
              )
            }
            const item = entry.item
            const hasAccess = userTierStore.hasAccess(item.requiredTier)
            const isLocked = !hasAccess
            const isActive = pathname === item.href
            return (
              <li key={item.id}>
                {item.available && hasAccess ? (
                  <Link
                    href={item.href}
                    className={`mod-menu-item ${isActive ? 'active' : ''}`}
                    onClick={onClose}
                  >
                    <span className="mod-menu-icon">{item.icon}</span>
                    <span className="mod-menu-title">{item.title}</span>
                  </Link>
                ) : (
                  <div
                    className={`mod-menu-item disabled ${isLocked ? 'locked' : ''}`}
                    onClick={isLocked ? () => handleLockedClick(item) : undefined}
                  >
                    <span className="mod-menu-icon">{item.icon}</span>
                    <span className="mod-menu-title">{item.title}</span>
                    {isLocked && <span className="mod-menu-lock">🔒</span>}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </nav>

      {upgradePrompt && (
        <div className="upgrade-modal-overlay" onClick={() => setUpgradePrompt(null)}>
          <div className="upgrade-modal" onClick={(e) => e.stopPropagation()}>
            <h3>🔒 {upgradePrompt.item.title}</h3>
            <p>
              תכונה זו דורשת מנוי <strong>{tierLabels[upgradePrompt.item.requiredTier]}</strong>
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
    </aside>
  )
}
