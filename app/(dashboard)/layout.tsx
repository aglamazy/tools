'use client'

import type { ReactNode } from 'react'
import { useState, useCallback, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Sidebar from '@/app/components/Sidebar'
import PageHeader from '@/app/components/PageHeader'
import TcGate from '@/app/components/TcGate'

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = usePathname()

  const toggleSidebar = useCallback(() => {
    setSidebarOpen(prev => !prev)
  }, [])

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false)
  }, [])

  // Close sidebar on route change
  useEffect(() => {
    setSidebarOpen(false)
  }, [pathname])

  return (
    <>
      <PageHeader onMenuToggle={toggleSidebar} />
      <div className="app-layout">
        <div
          className={`sidebar-backdrop ${sidebarOpen ? 'sidebar-backdrop-visible' : ''}`}
          onClick={closeSidebar}
        />
        <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} />
        <div className="main-content">
          <TcGate>{children}</TcGate>
        </div>
      </div>
    </>
  )
}
