/**
 * User Tier Store
 * Manages user subscription tier and feature access
 */

export enum UserTier {
  FREEMIUM = 'freemium',
  BUSINESS = 'business',
  LOCAL = 'local',
}

type Listener = (tier: UserTier) => void

// Initialize from environment variable or default to freemium
function getInitialTier(): UserTier {
  if (typeof window === 'undefined') {
    // Server-side: check env var
    return process.env.NEXT_PUBLIC_SEGMENT === 'local' ? UserTier.LOCAL : UserTier.FREEMIUM
  }

  // Client-side: check env var (will be embedded at build time)
  return process.env.NEXT_PUBLIC_SEGMENT === 'local' ? UserTier.LOCAL : UserTier.FREEMIUM
}

let currentTier: UserTier = getInitialTier()
const listeners: Set<Listener> = new Set()

export const userTierStore = {
  get(): UserTier {
    return currentTier
  },

  set(tier: UserTier): void {
    if (currentTier !== tier) {
      currentTier = tier
      listeners.forEach((listener) => listener(tier))
    }
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener)
    // Return unsubscribe function
    return () => {
      listeners.delete(listener)
    }
  },

  /**
   * Check if user has access to a feature requiring a specific tier
   * Tier hierarchy: LOCAL > BUSINESS > FREEMIUM
   */
  hasAccess(requiredTier: UserTier): boolean {
    const tierRank = {
      [UserTier.FREEMIUM]: 1,
      [UserTier.BUSINESS]: 2,
      [UserTier.LOCAL]: 3,
    }

    return tierRank[currentTier] >= tierRank[requiredTier]
  },

  isFreemium(): boolean {
    return currentTier === UserTier.FREEMIUM
  },

  isBusiness(): boolean {
    return currentTier === UserTier.BUSINESS
  },

  isLocal(): boolean {
    return currentTier === UserTier.LOCAL
  },
}
