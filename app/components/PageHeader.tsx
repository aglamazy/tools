'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import NotificationCenter from './NotificationCenter'
import AuthStatus from './AuthStatus'
import PageSearch from './PageSearch'
import AppLauncher from './AppLauncher'
import HamburgerMenu from './HamburgerMenu'
import { branding, routes } from '@/app/config'
import { VARIANT } from '@/app/config/variants'
import { useToast } from './ToastContainer'

// Saliko has no /about, /guide, /pricing, /contact yet — proxy rewrites
// them to /saliko/* which 404. Hide the public nav for Saliko until those
// pages exist; brand-link only.
const ALL_PUBLIC_LINKS = [
  { href: routes.about, label: 'אודות' },
  { href: routes.guide, label: 'מדריך' },
  { href: routes.pricing, label: 'מחירון' },
  { href: routes.contact, label: 'צור קשר' },
]
const publicLinks = VARIANT === 'saliko' ? [] : ALL_PUBLIC_LINKS

export default function PageHeader() {
  const { notifications, clearNotifications, dismissNotification } = useToast()
  const pathname = usePathname()
  const isApp = pathname.startsWith('/app')

  return (
    <header className="page-header">
      <div className="page-header-inner">
        {isApp ? (
          <>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {/* Saliko has only a few pages — page search + 9-grid launcher
                  are noise. Aglamazo keeps both for cross-feature navigation.
                  Launcher first so it sits flush at the RTL start (right edge);
                  the wider search input sits inside it, away from the edge. */}
              {VARIANT !== 'saliko' && <AppLauncher />}
              {VARIANT !== 'saliko' && <PageSearch />}
              {/* Saliko mobile: chat is the full-page landing view (task #19),
                  so stores/settings/admin need a way back in — this is the
                  only place that surfaces them there. Desktop is unaffected
                  (still lands on /app/stores); CSS hides this above 768px. */}
              {VARIANT === 'saliko' && <HamburgerMenu />}
            </div>
            <Link href={routes.dashboard} className="page-header-title" style={{ textDecoration: 'none' }}>
              <h1>{branding.name}</h1>
            </Link>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <NotificationCenter
                notifications={notifications}
                onClear={clearNotifications}
                onDismiss={dismissNotification}
              />
              <AuthStatus />
            </div>
          </>
        ) : (
          <>
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
            <Link href={routes.home} className="page-header-title" style={{ textDecoration: 'none' }}>
              <h1>{branding.name}</h1>
            </Link>
          </>
        )}
      </div>
    </header>
  )
}
