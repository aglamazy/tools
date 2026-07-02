/**
 * Product-variant config — one codebase, multiple deployments.
 *
 * Each Vercel project sets `NEXT_PUBLIC_PRODUCT` to one of the variant ids;
 * this module exposes the resolved variant + helpers used by the sidebar,
 * section tabs, page registry, chat brain, and home page.
 *
 * Variants share the entire backend; the variant flag only filters UI
 * surfaces and changes branding strings. Backend job gating is intentionally
 * a SEPARATE env (`GROCERY_CRON_ENABLED`) so UI hiding and cron disabling
 * can flip at different moments during the cutover.
 */

import { SALIKO_CONTACT_EMAIL } from '@/app/saliko/canon'

export type ProductVariant = 'aglamazo' | 'saliko'

const RAW = (process.env.NEXT_PUBLIC_PRODUCT || 'aglamazo').toLowerCase()
export const VARIANT: ProductVariant = (RAW === 'saliko' ? 'saliko' : 'aglamazo')

export interface VariantConfig {
  id: ProductVariant
  /** Display name used in titles, headings, system prompts. */
  name: string
  /** Tagline shown in branding header / og description. */
  tagline: string
  /** Telegram bot self-name (used in the chat brain system prompt). */
  botName: string
  /** The ONLY contact address this variant's bot may give out (C09 — never invent one). */
  contactEmail: string
  /** Logged-in landing route for this variant. */
  landingPath: string
  /**
   * Whitelist of page ids visible in this variant's navigation surfaces
   * (sidebar, section tabs, page registry). `undefined` = no filtering
   * except for shared variant-gates in `isPageAllowed` (for example, the
   * grocery/stores surface stays hidden in Aglamazo).
   */
  allowedPages?: ReadonlySet<string>
  /** Public landing-page hero copy. */
  homeHero: {
    headline: string
    subheadline: string
    cta: string
  }
  /**
   * Service-call monitoring status for the product itself. Saliko is a
   * live/in-service product, so the billing/status read path should surface
   * it as such for cockpit reconciliation.
   */
  serviceStatus?: 'in_service'
}

/**
 * Saliko deliberately exposes a tiny nav surface: stores (the main thing)
 * and settings, plus the owner-only admin tab. Chat lives as a floating
 * bubble (not a sidebar item) and profile lives in the AuthStatus dropdown
 * — both still reachable by URL, just not on the nav.
 */
const SALIKO_ALLOWED_PAGES = new Set([
  'stores',        // main: connect grocery store + manage standing list
  'settings',
  'admin',         // owner-only system tab
])

const VARIANTS: Record<ProductVariant, VariantConfig> = {
  aglamazo: {
    id: 'aglamazo',
    name: 'Aglamazo',
    tagline: 'הראש השקט של העסק שלך',
    botName: 'AglamazoBot',
    contactEmail: 'support@aglamaz.com',
    landingPath: '/app',
    allowedPages: undefined,
    homeHero: {
      headline: 'הראש השקט של העסק שלך',
      subheadline: 'ניהול תזרים, מסים, משימות וקניות במקום אחד.',
      cta: 'התחל',
    },
  },
  saliko: {
    id: 'saliko',
    name: 'Saliko',
    tagline: 'הסל שלך, על אוטומט',
    botName: 'SalikoBot',
    contactEmail: SALIKO_CONTACT_EMAIL,
    landingPath: '/app/stores',
    allowedPages: SALIKO_ALLOWED_PAGES,
    homeHero: {
      headline: 'הסל שלך, על אוטומט',
      subheadline: 'אנחנו קונים בשבילך — בלי הרעש של אתר הסופר. סוכן חכם שמכיר את ההרגלים שלך.',
      cta: 'נסה חינם',
    },
    serviceStatus: 'in_service',
  },
}

export const VARIANT_CONFIG: VariantConfig = VARIANTS[VARIANT]

/**
 * Returns true if a page id is visible in the current variant.
 *
 * Used by:
 *   - app/components/Sidebar.tsx — filters menu items
 *   - app/lib/navigationSections.ts (consumers) — filters section tabs
 *   - app/lib/pageRegistry.ts (consumers) — filters customizable tab list
 *
 * Items not in the whitelist are still REACHABLE by URL — we don't 404 them.
 * They just don't appear in navigation. This keeps the codebase shareable
 * across variants without per-variant route trees.
 */
export function isPageAllowed(pageId: string): boolean {
  if (VARIANT === 'aglamazo' && pageId === 'stores') return false
  if (!VARIANT_CONFIG.allowedPages) return true
  return VARIANT_CONFIG.allowedPages.has(pageId)
}
