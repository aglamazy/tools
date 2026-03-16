import { routes } from '@/app/config'
import { UserTier } from '@/app/stores/userTierStore'

export interface NavigablePage {
  id: string
  label: string
  icon: string
  href: string
  requiredTier: UserTier
}

export const ALL_PAGES: NavigablePage[] = [
  { id: 'home', label: 'בית', icon: '🏠', href: routes.dashboard, requiredTier: UserTier.FREE },
  { id: 'cash-flow', label: 'תזרים', icon: '💰', href: routes.cashFlow, requiredTier: UserTier.FREE },
  { id: 'budget', label: 'תקציב', icon: '📊', href: routes.budget, requiredTier: UserTier.FREE },
  { id: 'todo', label: 'משימות', icon: '✅', href: routes.todo, requiredTier: UserTier.FREE },
  { id: 'credit-cards', label: 'כרטיסים', icon: '💳', href: routes.creditCards, requiredTier: UserTier.FREE },
  { id: 'import', label: 'ייבוא', icon: '📥', href: routes.import, requiredTier: UserTier.FREE },
  { id: 'future-payments', label: 'תחזית', icon: '📅', href: routes.futurePayments, requiredTier: UserTier.PRO },
  { id: 'capital', label: 'הון', icon: '🏦', href: routes.capital, requiredTier: UserTier.PRO },
  { id: 'taxes', label: 'מסים', icon: '🧾', href: routes.taxes, requiredTier: UserTier.PRO },
  { id: 'market-research', label: 'מחקר שוק', icon: '🔍', href: routes.marketResearch, requiredTier: UserTier.PRO },
  { id: 'gmail', label: 'Gmail', icon: '📧', href: routes.gmail, requiredTier: UserTier.PRO },
  { id: 'business-categories', label: 'עסקים', icon: '🏛️', href: routes.businessCategories, requiredTier: UserTier.PRO },
  { id: 'form-filler', label: 'מילוי טפסים', icon: '📋', href: '/form-filler', requiredTier: UserTier.FREE },
]

export const DEFAULT_TAB_IDS = ['home', 'cash-flow', 'todo', 'business-categories']

export function getPageById(id: string): NavigablePage | undefined {
  return ALL_PAGES.find(p => p.id === id)
}
