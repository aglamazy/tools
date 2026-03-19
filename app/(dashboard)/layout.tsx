'use client'

import type { ReactNode } from 'react'
import BottomTabBar from '@/app/components/BottomTabBar'
import TcGate from '@/app/components/TcGate'

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="app-layout">
        <div className="main-content">
          <TcGate>{children}</TcGate>
        </div>
      </div>
      <BottomTabBar />
    </>
  )
}
