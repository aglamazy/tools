'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

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

export default function Sidebar() {
  const pathname = usePathname()
  const [isCollapsed, setIsCollapsed] = useState(false)

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
        </ul>
      </nav>
    </aside>
  )
}
