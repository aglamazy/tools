'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { businessStore } from '@/app/stores/businessStore'
import { userTierStore, UserTier } from '@/app/stores/userTierStore'
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

  // Filter tools based on user tier
  const tools = allTools.filter(tool => userTierStore.hasAccess(tool.requiredTier))

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
          {tools.map((tool) => (
            <li key={tool.id}>
              {tool.available ? (
                <Link
                  href={tool.href}
                  className={`nav-item ${pathname === tool.href ? 'active' : ''}`}
                  title={isCollapsed ? tool.title : undefined}
                >
                  <span className="nav-icon">{tool.icon}</span>
                  {!isCollapsed && <span className="nav-title">{tool.title}</span>}
                </Link>
              ) : (
                <div className="nav-item disabled" title={isCollapsed ? tool.title : undefined}>
                  <span className="nav-icon">{tool.icon}</span>
                  {!isCollapsed && (
                    <>
                      <span className="nav-title">{tool.title}</span>
                      <span className="nav-badge">בקרוב</span>
                    </>
                  )}
                </div>
              )}
            </li>
          ))}

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
    </aside>
  )
}
