'use client'

import type { ReactNode } from 'react'
import TcGate from '@/app/components/TcGate'
import ChatWidget from '@/app/components/ChatWidget'
import ChatTaskSync from '@/app/components/ChatTaskSync'
import MigrationsRegistry from '@/app/components/MigrationsRegistry'

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-layout">
      <div className="main-content">
        <TcGate>{children}</TcGate>
      </div>
      <ChatWidget />
      <ChatTaskSync />
      <MigrationsRegistry />
    </div>
  )
}
