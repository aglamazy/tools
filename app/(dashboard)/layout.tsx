'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import TcGate from '@/app/components/TcGate'
import ChatWidget from '@/app/components/ChatWidget'
import ChatTaskSync from '@/app/components/ChatTaskSync'
import SupplierSeedSync from '@/app/components/SupplierSeedSync'
import AppChat from '@/app/components/AppChat'
import { routes } from '@/app/config'
import { VARIANT } from '@/app/config/variants'
import { useIsMobile } from '@/app/hooks/useIsMobile'

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const onTermsPage = pathname === routes.terms
  const isMobile = useIsMobile()

  // Saliko #19: on mobile, Saliko's dashboard landing route (routes.dashboard)
  // shows full-page chat instead of the dashboard tiles — the primary
  // post-login view for this variant+viewport. Every OTHER dashboard route
  // (stores/settings/...) still renders `children` normally; users reach
  // them via the hamburger drawer (see PageHeader -> SalikoMobileMenu).
  // Aglamazo and desktop are untouched by this flag.
  const isSalikoMobile = VARIANT === 'saliko' && isMobile
  const showFullPageChatHome = isSalikoMobile && pathname === routes.dashboard

  return (
    <div className="app-layout">
      <div className="main-content">
        <TcGate>
          {showFullPageChatHome ? (
            // Reuses the same wrapper class as the existing mobile-only
            // /app/chat route (app/(dashboard)/app/chat/page.tsx) — same
            // full-viewport-minus-header sizing, already proven there.
            <div dir="rtl" className="app-chat-page">
              <AppChat />
            </div>
          ) : children}
        </TcGate>
      </div>
      {/* Floating chat FAB overlaps the accept button on mobile — hide until T&C is
          accepted. Also hidden for Saliko+mobile: chat is now the primary full-page
          view there (Saliko #19), so the floating bubble/panel would be a redundant
          second entry point to the same chat. */}
      {!onTermsPage && !isSalikoMobile && <ChatWidget />}
      <ChatTaskSync />
      <SupplierSeedSync />
    </div>
  )
}
