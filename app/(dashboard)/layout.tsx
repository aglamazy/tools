'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import TcGate from '@/app/components/TcGate'
import ChatWidget from '@/app/components/ChatWidget'
import ChatTaskSync from '@/app/components/ChatTaskSync'
import SupplierSeedSync from '@/app/components/SupplierSeedSync'
import { routes } from '@/app/config'

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const onTermsPage = pathname === routes.terms

  return (
    <div className="app-layout">
      <div className="main-content">
        <TcGate>{children}</TcGate>
      </div>
      {/* Floating chat FAB overlaps the accept button on mobile — hide until T&C is accepted */}
      {!onTermsPage && <ChatWidget />}
      <ChatTaskSync />
      <SupplierSeedSync />
    </div>
  )
}
