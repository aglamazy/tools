import { routes } from '@/app/config'
import { isPageAllowed } from '@/app/config/variants'
import { UserTier } from '@/app/stores/userTierStore'

export type SectionId = 'home' | 'finance' | 'business' | 'tools'

export type SectionTab = {
  id: string
  label: string
  href: string
  requiredTier: UserTier
}

const ALL_SECTION_TABS: Record<SectionId, SectionTab[]> = {
  home: [],
  finance: [
    { id: 'cash-flow', label: 'תזרים', href: routes.cashFlow, requiredTier: UserTier.FREE },
    { id: 'budget', label: 'תקציב', href: routes.budget, requiredTier: UserTier.FREE },
    { id: 'credit-cards', label: 'כרטיסים', href: routes.creditCards, requiredTier: UserTier.FREE },
    { id: 'future-payments', label: 'תחזית', href: routes.futurePayments, requiredTier: UserTier.PRO },
    { id: 'capital', label: 'הון', href: routes.capital, requiredTier: UserTier.PRO },
  ],
  business: [
    { id: 'taxes', label: 'מסים', href: routes.taxes, requiredTier: UserTier.PRO },
  ],
  tools: [
    { id: 'import', label: 'ייבוא', href: routes.import, requiredTier: UserTier.FREE },
    { id: 'todo', label: 'משימות', href: routes.todo, requiredTier: UserTier.FREE },
    { id: 'stores', label: 'חנויות', href: routes.stores, requiredTier: UserTier.FREE },
    { id: 'market-research', label: 'מחקר שוק', href: routes.marketResearch, requiredTier: UserTier.PRO },
    { id: 'gmail', label: 'Gmail', href: routes.gmail, requiredTier: UserTier.PRO },
  ],
}

/**
 * Section tabs with the current variant's whitelist applied.
 * Consumers (e.g. SectionTabs.tsx) should import this directly — they get
 * the correctly-filtered set without having to know about variants.
 */
export const sectionTabs: Record<SectionId, SectionTab[]> = Object.fromEntries(
  Object.entries(ALL_SECTION_TABS).map(([section, tabs]) => [
    section,
    tabs.filter(t => isPageAllowed(t.id)),
  ]),
) as Record<SectionId, SectionTab[]>

export function getActiveSection(pathname: string): SectionId | null {
  if (pathname === '/app') return 'home'

  // Finance
  if (
    pathname.startsWith('/app/cash-flow') ||
    pathname.startsWith('/app/budget') ||
    pathname.startsWith('/app/credit-cards') ||
    pathname.startsWith('/app/future-payments') ||
    pathname.startsWith('/app/capital')
  ) return 'finance'

  // Business
  if (
    pathname.startsWith('/app/taxes') ||
    pathname.startsWith('/app/business/')
  ) return 'business'

  // Tools
  if (
    pathname.startsWith('/app/import') ||
    pathname.startsWith('/app/todo') ||
    pathname.startsWith('/app/stores') ||
    pathname.startsWith('/app/market-research') ||
    pathname.startsWith('/app/gmail')
  ) return 'tools'

  // Avatar menu pages (profile, settings, etc.) — no section
  return null
}
