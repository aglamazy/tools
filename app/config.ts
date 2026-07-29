// Application configuration
import { VARIANT_CONFIG } from './config/variants'

export const branding = {
  name: VARIANT_CONFIG.name,
  tagline: VARIANT_CONFIG.tagline,
} as const

export const routes = {
  home: '/',
  dashboard: '/app',
  import: '/app/import',
  cashFlow: '/app/cash-flow',
  budget: '/app/budget',
  todo: '/app/todo',
  creditCards: '/app/credit-cards',
  futurePayments: '/app/future-payments',
  settings: '/app/settings',
  gmail: '/app/gmail',
  taxes: '/app/taxes',
  capital: '/app/capital',
  chat: '/app/chat',
  marketResearch: '/app/market-research',
  devDb: '/app/dev-db',
  profile: '/app/profile',
  admin: '/app/admin',
  businessCategories: '/app/business-categories',
  stores: '/app/stores',
  terms: '/app/terms',
  publicTerms: '/terms',
  about: '/about',
  guide: '/guide',
  pricing: '/pricing',
  extension: '/extension',
  contact: '/contact',
  invite: '/invite',
  // Prefer the human-readable slug when available — the numeric id is a
  // mutable Dexie auto-increment (same fragility class the FK migration
  // fixed for foreign keys), so any link/bookmark built from it can go stale
  // if the business row is ever deleted+reinserted. Falls back to id for
  // businesses that haven't been assigned a slug yet.
  business: (biz: { id?: number | string; slug?: string | null }) => `/app/business/${biz.slug || biz.id}`,
} as const

export const config = {
  // Developer mode - enables additional validation and debugging
  developerMode: process.env.NEXT_PUBLIC_DEVELOPER_MODE === 'true',

  // Sync cadence (minutes). Update here to change auto-sync frequency across app.
  syncIntervalMinutes: 5,

  // Terms & Conditions latest version date. Update this to force re-acceptance.
  tcVersion: '2026-03-09',
}
