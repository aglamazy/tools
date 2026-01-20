'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { businessStore } from '@/app/stores/businessStore'
import { userTierStore, UserTier } from '@/app/stores/userTierStore'
import UpgradeModal from './UpgradeModal'
import type { Business } from '@/app/db/financeDB'

type Tool = {
  id: string
  title: string
  href: string
  icon: string
  available: boolean
  requiredTier: UserTier
}

const allTools: Tool[] = [
  // Freemium features
  {
    id: 'import',
    title: 'ייבוא קבצים',
    href: '/tools/import',
    icon: '📥',
    available: true,
    requiredTier: UserTier.FREEMIUM,
  },
  {
    id: 'cash-flow',
    title: 'תזרים מזומנים',
    href: '/tools/cash-flow',
    icon: '💰',
    available: true,
    requiredTier: UserTier.FREEMIUM,
  },
  {
    id: 'budget',
    title: 'תקציב',
    href: '/tools/budget',
    icon: '📊',
    available: true,
    requiredTier: UserTier.FREEMIUM,
  },
  {
    id: 'todo',
    title: 'משימות',
    href: '/tools/todo',
    icon: '✓',
    available: true,
    requiredTier: UserTier.FREEMIUM,
  },
  {
    id: 'future-payments',
    title: 'תחזית תשלומים',
    href: '/tools/future-payments',
    icon: '💳',
    available: true,
    requiredTier: UserTier.LOCAL,
  },
  {
    id: 'settings',
    title: 'הגדרות',
    href: '/tools/settings',
    icon: '⚙️',
    available: true,
    requiredTier: UserTier.FREEMIUM,
  },
  {
    id: 'about',
    title: 'אודות',
    href: '/about',
    icon: 'ℹ️',
    available: true,
    requiredTier: UserTier.FREEMIUM,
  },
  {
    id: 'guide',
    title: 'מדריך שימוש',
    href: '/guide',
    icon: '📖',
    available: true,
    requiredTier: UserTier.FREEMIUM,
  },

  // Business features
  {
    id: 'capital',
    title: 'הון',
    href: '/tools/capital',
    icon: '💎',
    available: true,
    requiredTier: UserTier.BUSINESS,
  },

  // Local/developer features
  {
    id: 'dev-db',
    title: 'Dev DB',
    href: '/tools/dev-db',
    icon: '🛠️',
    available: true,
    requiredTier: UserTier.LOCAL,
  },
]

export default function Sidebar() {
  const pathname = usePathname()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [pinnedBusinesses, setPinnedBusinesses] = useState<Business[]>([])
  const [userTier, setUserTier] = useState<UserTier>(userTierStore.get())
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false)
  const [upgradeFeatureName, setUpgradeFeatureName] = useState<string | undefined>()

  // Show all tools except LOCAL tier tools (unless user has LOCAL access)
  const tools = allTools.filter(tool => {
    // Always hide LOCAL tier tools unless user is LOCAL
    if (tool.requiredTier === UserTier.LOCAL && !userTierStore.hasAccess(UserTier.LOCAL)) {
      return false
    }
    return true
  })

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

  const handleLockedToolClick = (tool: Tool) => {
    setUpgradeFeatureName(tool.title)
    setUpgradeModalOpen(true)
  }

  const isToolLocked = (tool: Tool) => !userTierStore.hasAccess(tool.requiredTier)

  return (
    <>
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
              const locked = isToolLocked(tool)

              return (
                <li key={tool.id}>
                  {!tool.available ? (
                    <div className="nav-item disabled" title={isCollapsed ? tool.title : undefined}>
                      <span className="nav-icon">{tool.icon}</span>
                      {!isCollapsed && (
                        <>
                          <span className="nav-title">{tool.title}</span>
                          <span className="nav-badge">בקרוב</span>
                        </>
                      )}
                    </div>
                  ) : locked ? (
                    <button
                      className="nav-item locked"
                      onClick={() => handleLockedToolClick(tool)}
                      title={isCollapsed ? `${tool.title} (נעול)` : undefined}
                    >
                      <span className="nav-icon">{tool.icon}</span>
                      {!isCollapsed && (
                        <>
                          <span className="nav-title">{tool.title}</span>
                          <span className="nav-lock">🔒</span>
                        </>
                      )}
                    </button>
                  ) : (
                    <Link
                      href={tool.href}
                      className={`nav-item ${pathname === tool.href ? 'active' : ''}`}
                      title={isCollapsed ? tool.title : undefined}
                    >
                      <span className="nav-icon">{tool.icon}</span>
                      {!isCollapsed && <span className="nav-title">{tool.title}</span>}
                    </Link>
                  )}
                </li>
              )
            })}

            {userTierStore.hasAccess(UserTier.BUSINESS) && pinnedBusinesses.length > 0 && (
              <>
                <li style={{ borderTop: '1px solid #e2e8f0', margin: '0.5rem 0' }} />
                {pinnedBusinesses.map((business) => (
                  <li key={`business-${business.id}`}>
                    <Link
                      href={`/business/${business.id}`}
                      className={`nav-item ${pathname === `/business/${business.id}` ? 'active' : ''}`}
                      title={isCollapsed ? business.name : undefined}
                    >
                      <span className="nav-icon">{business.type === 'personal' ? '🏠' : '🏢'}</span>
                      {!isCollapsed && <span className="nav-title">{business.name}</span>}
                    </Link>
                  </li>
                ))}
              </>
            )}
          </ul>
        </nav>

        <style jsx>{`
          .nav-item.locked {
            width: 100%;
            background: none;
            border: none;
            text-align: inherit;
            font: inherit;
            cursor: pointer;
            display: flex;
            align-items: center;
            padding: 0.625rem 0.75rem;
            border-radius: 0.5rem;
            color: #94a3b8;
            transition: all 0.15s ease;
          }

          .nav-item.locked:hover {
            background: #f1f5f9;
            color: #64748b;
          }

          .nav-lock {
            margin-right: auto;
            font-size: 0.75rem;
          }
        `}</style>
      </aside>

      <UpgradeModal
        isOpen={upgradeModalOpen}
        onClose={() => setUpgradeModalOpen(false)}
        featureName={upgradeFeatureName}
      />
    </>
  )
}
