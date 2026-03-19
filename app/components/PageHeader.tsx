'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import NotificationCenter from './NotificationCenter'
import AuthStatus from './AuthStatus'
import PageSearch from './PageSearch'
import { branding, routes } from '@/app/config'
import { useToast } from './ToastContainer'

const publicLinks = [
  { href: routes.about, label: 'אודות' },
  { href: routes.guide, label: 'מדריך' },
  { href: routes.pricing, label: 'מחירון' },
  { href: routes.contact, label: 'צור קשר' },
]

export default function PageHeader() {
  const { notifications, clearNotifications } = useToast()
  const pathname = usePathname()
  const isApp = pathname.startsWith('/app')

  return (
    <header className="page-header">
      <div className="page-header-inner">
        {isApp ? (
          <>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <NotificationCenter notifications={notifications} onClear={clearNotifications} />
              <AuthStatus />
            </div>
            <PageSearch />
          </>
        ) : (
          <nav className="page-header-nav">
            {publicLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`page-header-nav-link${pathname === link.href ? ' active' : ''}`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        )}
        <Link href={isApp ? routes.dashboard : routes.home} className="page-header-title" style={{ textDecoration: 'none' }}>
          <h1>{branding.name}</h1>
        </Link>
      </div>
    </header>
  )
}
