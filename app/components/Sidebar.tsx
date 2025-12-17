'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { config } from '@/app/config'
import { businessStore } from '@/app/stores/businessStore'
import type { Business } from '@/app/db/financeDB'

type Tool = {
  id: string
  title: string
  href: string
  icon: string
  available: boolean
}

const tools: Tool[] = [
  {
    id: 'import',
    title: 'ייבוא קבצים',
    href: '/tools/import',
    icon: '📥',
    available: true,
  },
  {
    id: 'cash-flow',
    title: 'תזרים מזומנים',
    href: '/tools/cash-flow',
    icon: '💰',
    available: true,
  },
  {
    id: 'budget',
    title: 'תקציב',
    href: '/tools/budget',
    icon: '📊',
    available: true,
  },
  {
    id: 'todo',
    title: 'משימות',
    href: '/tools/todo',
    icon: '✓',
    available: true,
  },
  {
    id: 'future-payments',
    title: 'תחזית תשלומים',
    href: '/tools/future-payments',
    icon: '💳',
    available: false,
  },
  {
    id: 'settings',
    title: 'הגדרות',
    href: '/tools/settings',
    icon: '⚙️',
    available: true,
  },
  {
    id: 'about',
    title: 'אודות',
    href: '/about',
    icon: 'ℹ️',
    available: true,
  },
  {
    id: 'guide',
    title: 'מדריך שימוש',
    href: '/guide',
    icon: '📖',
    available: true,
  },
]

if (config.developerMode) {
  tools.splice(3, 0, {
    id: 'dev-db',
    title: 'Dev DB',
    href: '/tools/dev-db',
    icon: '🛠️',
    available: true,
  })
}

export default function Sidebar() {
  const pathname = usePathname()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [pinnedBusinesses, setPinnedBusinesses] = useState<Business[]>([])

  useEffect(() => {
    const loadPinnedBusinesses = async () => {
      const all = await businessStore.getAll()
      setPinnedBusinesses(all.filter(b => b.pinnedToSidebar))
    }
    void loadPinnedBusinesses()
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

          {pinnedBusinesses.length > 0 && (
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
