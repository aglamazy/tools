'use client'

import Link from 'next/link'
import NotificationCenter from './NotificationCenter'
import AuthStatus from './AuthStatus'
import { branding, routes } from '@/app/config'
import { useToast } from './ToastContainer'

export default function PageHeader() {
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
        <Link href={routes.home} className="home-link">
          <span role="img" aria-label="home">🏠</span>
        </Link>
      </div>
    </header>
  )
}
