'use client'

import Link from 'next/link'
import NotificationCenter from './NotificationCenter'
import AuthStatus from './AuthStatus'
import PageSearch from './PageSearch'
import { branding, routes } from '@/app/config'
import { useToast } from './ToastContainer'

export default function PageHeader() {
  const { notifications, clearNotifications } = useToast()

  return (
    <header className="page-header">
      <div className="page-header-inner">
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <NotificationCenter notifications={notifications} onClear={clearNotifications} />
          <AuthStatus />
        </div>
        <PageSearch />
        <Link href={routes.dashboard} className="page-header-title" style={{ textDecoration: 'none' }}>
          <h1>{branding.name}</h1>
        </Link>
      </div>
    </header>
  )
}
