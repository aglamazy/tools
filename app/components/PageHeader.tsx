'use client'

import Link from 'next/link'
import NotificationCenter from './NotificationCenter'
import { useToast } from './ToastContainer'
import SyncStatusBadge from './SyncStatusBadge'

export default function PageHeader() {
  const { notifications, clearNotifications } = useToast()

  return (
    <header className="page-header">
      <div className="page-header-inner">
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <NotificationCenter notifications={notifications} onClear={clearNotifications} />
          <SyncStatusBadge />
        </div>
        <div className="page-header-title">
          <h1>ארגז כלים פיננסיים</h1>
        </div>
        <Link href="/" className="home-link">
          <span role="img" aria-label="home">🏠</span>
        </Link>
      </div>
    </header>
  )
}
