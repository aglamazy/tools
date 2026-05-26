/**
 * Partner Store — cached partner / invitation / access-grant state per business.
 *
 * A "partner" is anyone who can be assigned as owner of a business or as the
 * payer/receiver of one of its transactions: household members + users who
 * currently have access to this business via a BusinessAccessGrant.
 *
 * Why a cache: the candidate list is fetched from two endpoints
 * (/api/household/info + /api/business-share/list) and used by multiple tabs
 * (BizSettingsTab, ExpenseTab, IncomeTab, SettlementSummary). Refetching on
 * every mount caused visible "empty dropdown" flashes. Names + uids are
 * non-sensitive static data, so localStorage is fine.
 *
 * Pattern: components read getCached(syncId) synchronously for instant
 * render, then call refresh(syncId) on mount to update from API. Subscribe()
 * lets them re-render if the refresh returns new data.
 */

import { getHouseholdInfo } from '@/app/services/householdService'
import {
  listShares,
  type BusinessPartner,
  type BusinessShareInvitation,
  type BusinessAccessGrant,
} from '@/app/services/businessShareService'
import { getUser } from '@/app/stores/authStore'

export type Participant = { uid: string; label: string; sharePercent?: number }
/** Legacy alias — many call sites import as `Partner`. */
export type Partner = Participant

export type CachedBusinessPartners = {
  participants: Participant[]
  partners: BusinessPartner[]
  invitations: BusinessShareInvitation[]
  grants: BusinessAccessGrant[]
}
type CacheShape = Record<string /*businessSyncId*/, CachedBusinessPartners>

const STORAGE_KEY = 'aglamazo_partners_v2'

const listeners = new Set<() => void>()

function loadFromStorage(): CacheShape {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

function saveToStorage(c: CacheShape) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(c))
  } catch { /* quota — drop silently */ }
}

let cache: CacheShape = loadFromStorage()

async function fetchAll(businessSyncId: string): Promise<CachedBusinessPartners> {
  const participants: Participant[] = []
  const currentUser = getUser()

  // Fetch household + shares in parallel — they're independent endpoints.
  const [infoResult, sharesResult] = await Promise.all([
    getHouseholdInfo().catch(() => null),
    listShares().catch(() => null),
  ])

  // Household members — server-resolved displayNames in `memberNames`.
  if (infoResult?.household) {
    const emails = (infoResult.household as any).memberEmails || {}
    const names = (infoResult.household as any).memberNames || {}
    for (const uid of (infoResult.household.members || [])) {
      participants.push({ uid, label: names[uid] || emails[uid] || uid })
    }
  }

  // Always include current user (covers the no-household case).
  if (currentUser && !participants.find(p => p.uid === currentUser.uid)) {
    participants.push({ uid: currentUser.uid, label: currentUser.displayName || currentUser.email || currentUser.uid })
  }

  const partners = sharesResult?.success
    ? (sharesResult.partners || []).filter(p => p.businessSyncId === businessSyncId)
    : []
  const invitations = sharesResult?.success
    ? (sharesResult.ownedInvitations || []).filter(i => i.businessSyncId === businessSyncId)
    : []
  const grants = sharesResult?.success
    ? (sharesResult.grantsFromMe || []).filter(g => g.businessSyncId === businessSyncId)
    : []

  // Build a partner-uid → sharePercent map so participants entries (uids) can
  // surface the % of the partner record they're bound to.
  const partnerById = new Map(partners.map(p => [p.id, p]))
  for (const g of grants) {
    const partner = partnerById.get(g.partnerId)
    if (!partner) continue
    if (!participants.find(p => p.uid === g.uid)) {
      participants.push({
        uid: g.uid,
        label: g.grantedUserDisplayName || partner.displayName || partner.email,
        sharePercent: partner.sharePercent,
      })
    } else {
      // Existing participant (e.g., household member who also has a grant) —
      // backfill the partner's sharePercent.
      const existing = participants.find(p => p.uid === g.uid)
      if (existing && existing.sharePercent === undefined) {
        existing.sharePercent = partner.sharePercent
      }
    }
  }

  return { participants, partners, invitations, grants }
}

const EMPTY: CachedBusinessPartners = { participants: [], partners: [], invitations: [], grants: [] }

export const partnerStore = {
  /** Synchronous read — returns the merged participants list (Participant[]). */
  getCached(businessSyncId: string | undefined): Participant[] {
    if (!businessSyncId) return []
    return (cache[businessSyncId] || EMPTY).participants
  },

  /** Synchronous read — raw partner records for this business (durable identities). */
  getCachedPartners(businessSyncId: string | undefined): BusinessPartner[] {
    if (!businessSyncId) return []
    return (cache[businessSyncId] || EMPTY).partners
  },

  /** Synchronous read — pending invitations for this business. */
  getCachedInvitations(businessSyncId: string | undefined): BusinessShareInvitation[] {
    if (!businessSyncId) return []
    return (cache[businessSyncId] || EMPTY).invitations
  },

  /** Synchronous read — access grants for this business (who currently has access). */
  getCachedGrants(businessSyncId: string | undefined): BusinessAccessGrant[] {
    if (!businessSyncId) return []
    return (cache[businessSyncId] || EMPTY).grants
  },

  /**
   * Legacy alias used by SettlementSummary etc. — historically returned
   * `BusinessShare[]` which conflated partner + grant. Now returns grants,
   * which is what callers actually need (the uid bindings).
   */
  getCachedShares(businessSyncId: string | undefined): BusinessAccessGrant[] {
    return this.getCachedGrants(businessSyncId)
  },

  /** Fetch from API, update cache + notify subscribers. Idempotent and safe to call repeatedly. */
  async refresh(businessSyncId: string | undefined): Promise<CachedBusinessPartners> {
    if (!businessSyncId) return EMPTY
    const fresh = await fetchAll(businessSyncId)
    cache = { ...cache, [businessSyncId]: fresh }
    saveToStorage(cache)
    listeners.forEach(l => l())
    return fresh
  },

  /** Subscribe to cache changes (any business). Returns unsubscribe fn. */
  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  },

  /** Wipe — call on logout so the next user can't read stale household names. */
  clear(): void {
    cache = {}
    if (typeof window !== 'undefined') {
      try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
    }
    listeners.forEach(l => l())
  },
}
