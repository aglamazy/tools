'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import TcGate from '@/app/components/TcGate'
import ChatWidget from '@/app/components/ChatWidget'
import ChatTaskSync from '@/app/components/ChatTaskSync'
import SupplierSeedSync from '@/app/components/SupplierSeedSync'
import { routes } from '@/app/config'
import { chatPageActive } from '@/app/lib/chatPageActive'

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const onTermsPage = pathname === routes.terms
  const [onChatPage, setOnChatPage] = useState(chatPageActive.get())

  useEffect(() => chatPageActive.subscribe(setOnChatPage), [])

  return (
    <div className="app-layout">
      <div className="main-content">
        <TcGate>{children}</TcGate>
      </div>
      {/* Floating chat FAB overlaps the accept button on mobile — hide until T&C is accepted.
          Also hidden on the full-page chat route itself — redundant bubble over its own content. */}
      {!onTermsPage && !onChatPage && <ChatWidget />}
      <ChatTaskSync />
      <SupplierSeedSync />
    </div>
  )
}
