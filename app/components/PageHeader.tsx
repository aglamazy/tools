'use client'

import Link from 'next/link'
import NotificationCenter from './NotificationCenter'
import AuthStatus from './AuthStatus'
import { branding, routes } from '@/app/config'
import { useToast } from './ToastContainer'

export default function PageHeader({ onMenuToggle }: { onMenuToggle?: () => void }) {
  const { notifications, clearNotifications } = useToast()

  return (
    <header className="page-header">
      <div className="page-header-inner">
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <NotificationCenter notifications={notifications} onClear={clearNotifications} />
          <AuthStatus />
        </div>
        <div className="page-header-title">
          <h1>{branding.name}</h1>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <Link href={routes.home} className="home-link">
            <span role="img" aria-label="home">🏠</span>
          </Link>
          {onMenuToggle && (
            <button
              className="mobile-menu-toggle"
              onClick={onMenuToggle}
              aria-label="תפריט"
            >
              ☰
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
