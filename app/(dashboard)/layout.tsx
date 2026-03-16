'use client'

import type { ReactNode } from 'react'
import PageHeader from '@/app/components/PageHeader'
import BottomTabBar from '@/app/components/BottomTabBar'
import TcGate from '@/app/components/TcGate'

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PageHeader />
      <div className="app-layout">
        <div className="main-content">
          <TcGate>{children}</TcGate>
        </div>
      </div>
      <BottomTabBar />
    </>
  )
}
