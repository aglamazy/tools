'use client'

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
    id: 'analyze-transactions',
    title: 'ניתוח עסקאות',
    href: '/tools/analyze-transactions',
    icon: '📊',
    available: true,
  },
  {
    id: 'future-payments',
    title: 'תחזית תשלומים',
    href: '/tools/future-payments',
    icon: '💳',
    available: true,
  },
  {
    id: 'settings',
    title: 'הגדרות',
    href: '/tools/settings',
    icon: '⚙️',
    available: true,
  },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="sidebar">
      <nav className="sidebar-nav">
        <ul className="nav-list">
          {tools.map((tool) => (
            <li key={tool.id}>
              {tool.available ? (
                <Link
                  href={tool.href}
                  className={`nav-item ${pathname === tool.href ? 'active' : ''}`}
                >
                  <span className="nav-icon">{tool.icon}</span>
                  <span className="nav-title">{tool.title}</span>
                </Link>
              ) : (
                <div className="nav-item disabled">
                  <span className="nav-icon">{tool.icon}</span>
                  <span className="nav-title">{tool.title}</span>
                  <span className="nav-badge">בקרוב</span>
                </div>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  )
}
