/**
 * Partner Store — cached list of partner candidates per business.
 *
 * A "partner" is anyone who can be assigned as owner of a business or as the
 * payer/receiver of one of its transactions: household members + users this
 * business is explicitly shared with.
 *
 * Why a cache: the candidate list is fetched from two endpoints
 * (/api/household/info + /api/business-share/list) and used by multiple tabs
 * (BizSettingsTab, ExpenseTab, IncomeTab). Refetching on every mount caused
 * visible "empty dropdown" flashes. Names + uids are non-sensitive static
 * data, so localStorage is fine.
 *
 * Pattern: components read getCached(syncId) synchronously for instant
 * render, then call refresh(syncId) on mount to update from API. Subscribe()
 * lets them re-render if the refresh returns new data.
 */

import { getHouseholdInfo } from '@/app/services/householdService'
import { listShares, type BusinessShare, type BusinessShareInvitation } from '@/app/services/businessShareService'
import { getUser } from '@/app/stores/authStore'

export type Partner = { uid: string; label: string; sharePercent?: number }
export type CachedBusinessPartners = {
  participants: Partner[]
  shares: BusinessShare[]
  invitations: BusinessShareInvitation[]
}
type CacheShape = Record<string /*businessSyncId*/, CachedBusinessPartners>

const STORAGE_KEY = 'aglamazo_partners_v1'

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
  const participants: Partner[] = []
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

  const shares = sharesResult?.success ? (sharesResult.ownedShares || []).filter(s => s.businessSyncId === businessSyncId) : []
  const invitations = sharesResult?.success ? (sharesResult.pendingInvitations || []).filter(i => i.businessSyncId === businessSyncId) : []

  // Share-with users for this business — server-resolved displayName via list endpoint.
  for (const s of shares) {
    if (!participants.find(p => p.uid === s.sharedWithUid)) {
      participants.push({
        uid: s.sharedWithUid,
        label: s.sharedWithDisplayName || s.sharedWithEmail,
        sharePercent: s.sharePercent,
      })
    }
  }

  return { participants, shares, invitations }
}

const EMPTY: CachedBusinessPartners = { participants: [], shares: [], invitations: [] }

export const partnerStore = {
  /** Synchronous read — returns the merged participants list (Partner[]). */
  getCached(businessSyncId: string | undefined): Partner[] {
    if (!businessSyncId) return []
    return (cache[businessSyncId] || EMPTY).participants
  },

  /** Synchronous read — raw active shares for this business. */
  getCachedShares(businessSyncId: string | undefined): BusinessShare[] {
    if (!businessSyncId) return []
    return (cache[businessSyncId] || EMPTY).shares
  },

  /** Synchronous read — pending invitations for this business. */
  getCachedInvitations(businessSyncId: string | undefined): BusinessShareInvitation[] {
    if (!businessSyncId) return []
    return (cache[businessSyncId] || EMPTY).invitations
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
