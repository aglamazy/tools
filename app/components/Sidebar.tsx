'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { businessStore } from '@/app/stores/businessStore'
import { userTierStore, UserTier } from '@/app/stores/userTierStore'
import { config, routes } from '@/app/config'
import type { Business } from '@/app/db/financeDB'
import { BUSINESS_TYPE_CONFIG } from '@/app/types/businessColors'

type Tool = {
  id: string
  title: string
  href: string
  icon: string
  available: boolean
  requiredTier: UserTier
}

const allTools: Tool[] = [
  // Free features
  {
    id: 'import',
    title: 'ייבוא קבצים',
    href: routes.import,
    icon: '📥',
    available: true,
    requiredTier: UserTier.FREE,
  },
  {
    id: 'cash-flow',
    title: 'תזרים מזומנים',
    href: routes.cashFlow,
    icon: '💰',
    available: true,
    requiredTier: UserTier.FREE,
  },
  {
    id: 'budget',
    title: 'תקציב',
    href: routes.budget,
    icon: '📊',
    available: true,
    requiredTier: UserTier.FREE,
  },
  {
    id: 'todo',
    title: 'משימות',
    href: routes.todo,
    icon: '✓',
    available: true,
    requiredTier: UserTier.FREE,
  },
  {
    id: 'future-payments',
    title: 'תחזית תשלומים',
    href: routes.futurePayments,
    icon: '💳',
    available: true,
    requiredTier: UserTier.PRO,
  },
  {
    id: 'settings',
    title: 'הגדרות',
    href: routes.settings,
    icon: '⚙️',
    available: true,
    requiredTier: UserTier.FREE,
  },
  {
    id: 'about',
    title: 'אודות',
    href: routes.about,
    icon: 'ℹ️',
    available: true,
    requiredTier: UserTier.FREE,
  },
  {
    id: 'guide',
    title: 'מדריך שימוש',
    href: routes.guide,
    icon: '📖',
    available: true,
    requiredTier: UserTier.FREE,
  },

  // Pro features
  {
    id: 'gmail',
    title: 'Gmail',
    href: routes.gmail,
    icon: '📧',
    available: true,
    requiredTier: UserTier.PRO,
  },
  {
    id: 'capital',
    title: 'הון',
    href: routes.capital,
    icon: '💎',
    available: true,
    requiredTier: UserTier.PRO,
  },
  {
    id: 'dev-db',
    title: 'Dev DB',
    href: routes.devDb,
    icon: '🛠️',
    available: true,
    requiredTier: UserTier.PRO,
  },
  {
    id: 'admin',
    title: 'ניהול',
    href: routes.admin,
    icon: '👑',
    available: true,
    requiredTier: UserTier.OWNER,
  },
]

const tierLabels: Record<UserTier, string> = {
  [UserTier.FREE]: 'חינם',
  [UserTier.HOME]: 'בית',
  [UserTier.PRO]: 'מקצועי',
  [UserTier.OWNER]: 'בעלים',
}

export default function Sidebar() {
  const pathname = usePathname()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [pinnedBusinesses, setPinnedBusinesses] = useState<Business[]>([])
  const [userTier, setUserTier] = useState<UserTier>(userTierStore.get())
  const [upgradePrompt, setUpgradePrompt] = useState<{ tool: Tool } | null>(null)

  // Hide dev-db unless developer mode is on
  const tools = config.developerMode ? allTools : allTools.filter(t => t.id !== 'dev-db')

  const handleLockedClick = (tool: Tool) => {
    setUpgradePrompt({ tool })
  }

  useEffect(() => {
    const loadPinnedBusinesses = async () => {
      const all = await businessStore.getAll()
      setPinnedBusinesses(all.filter(b => b.pinnedToSidebar))
    }
    void loadPinnedBusinesses()

    // Listen for pin changes
    const handleRefresh = () => void loadPinnedBusinesses()
    window.addEventListener('sidebar-refresh', handleRefresh)

    // Subscribe to tier changes
    const unsubscribeTier = userTierStore.subscribe((tier) => {
      setUserTier(tier)
    })

    return () => {
      window.removeEventListener('sidebar-refresh', handleRefresh)
      unsubscribeTier()
    }
  }, [])

  return (
    <aside className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      <nav className="sidebar-nav">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="sidebar-toggle"
          aria-label={isCollapsed ? 'הרחב תפריט' : 'צמצם תפריט'}
        >
          {isCollapsed ? '◀' : '▶'}
        </button>

        <ul className="nav-list">
          {tools.map((tool) => {
            const hasAccess = userTierStore.hasAccess(tool.requiredTier)
            const isLocked = !hasAccess

            // Hide admin-only items entirely if user lacks access
            if (tool.requiredTier === UserTier.OWNER && !hasAccess) return null

            return (
              <li key={tool.id}>
                {tool.available && hasAccess ? (
                  <Link
                    href={tool.href}
                    className={`nav-item ${pathname === tool.href ? 'active' : ''}`}
                    title={isCollapsed ? tool.title : undefined}
                  >
                    <span className="nav-icon">{tool.icon}</span>
                    {!isCollapsed && <span className="nav-title">{tool.title}</span>}
                  </Link>
                ) : (
                  <div
                    className={`nav-item disabled ${isLocked ? 'locked' : ''}`}
                    title={isCollapsed ? tool.title : `${tool.title}${isLocked ? ' (נעול)' : ''}`}
                    onClick={isLocked ? () => handleLockedClick(tool) : undefined}
                    style={isLocked ? { cursor: 'pointer' } : undefined}
                  >
                    <span className="nav-icon">{tool.icon}</span>
                    {!isCollapsed && (
                      <>
                        <span className="nav-title">{tool.title}</span>
                        {isLocked && <span className="nav-lock">🔒</span>}
                        {!tool.available && !isLocked && <span className="nav-badge">בקרוב</span>}
                      </>
                    )}
                  </div>
                )}
              </li>
            )
          })}

          {userTierStore.hasAccess(UserTier.PRO) && pinnedBusinesses.length > 0 && (
            <>
              <li style={{ borderTop: '1px solid #e2e8f0', margin: '0.5rem 0' }} />
              {pinnedBusinesses.map((business) => (
                <li key={`business-${business.id}`}>
                  <Link
                    href={`/business/${business.id}`}
                    className={`nav-item ${pathname === `/business/${business.id}` ? 'active' : ''}`}
                    title={isCollapsed ? business.name : undefined}
                  >
                    <span className="nav-icon">{BUSINESS_TYPE_CONFIG[business.type].icon}</span>
                    {!isCollapsed && <span className="nav-title">{business.name}</span>}
                  </Link>
                </li>
              ))}
            </>
          )}
        </ul>
      </nav>

      {upgradePrompt && (
        <div className="upgrade-modal-overlay" onClick={() => setUpgradePrompt(null)}>
          <div className="upgrade-modal" onClick={(e) => e.stopPropagation()}>
            <h3>🔒 {upgradePrompt.tool.title}</h3>
            <p>
              תכונה זו דורשת מנוי <strong>{tierLabels[upgradePrompt.tool.requiredTier]}</strong>
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
