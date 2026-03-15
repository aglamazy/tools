'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { getActiveSection } from '@/app/lib/navigationSections'

const tabs = [
  { id: 'home', label: 'בית', icon: '🏠', href: '/app' },
  { id: 'finance', label: 'כספים', icon: '💰', href: '/app/cash-flow' },
  { id: 'business', label: 'עסקים', icon: '🏛️', href: '/app/taxes' },
  { id: 'tools', label: 'כלים', icon: '🔧', href: '/app/import' },
] as const

export default function BottomTabBar() {
  const pathname = usePathname()
  const activeSection = getActiveSection(pathname)

  return (
    <nav className="bottom-tab-bar">
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href}
          className={`bottom-tab ${activeSection === tab.id ? 'bottom-tab-active' : ''}`}
        >
          <span className="bottom-tab-icon">{tab.icon}</span>
          <span className="bottom-tab-label">{tab.label}</span>
        </Link>
      ))}
    </nav>
  )
}
