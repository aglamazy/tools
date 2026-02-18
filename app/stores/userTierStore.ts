/**
 * User Tier Store
 * Manages user subscription tier and feature access
 */

export enum UserTier {
  FREE = 'free',
  HOME = 'home',
  PRO = 'pro',
  OWNER = 'owner',
}

type Listener = (tier: UserTier) => void

// Check for LOCAL env override, otherwise default to FREE until Firestore fetch
function getInitialTier(): UserTier {
  // LOCAL segment = developer/owner mode = max tier
  if (process.env.NEXT_PUBLIC_SEGMENT === 'local') {
    return UserTier.OWNER
  }
  return UserTier.FREE
}

// Track if tier is from env override (shouldn't be overwritten by Firestore)
export const isEnvOverride = process.env.NEXT_PUBLIC_SEGMENT === 'local'

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
   * Tier hierarchy: OWNER > PRO > HOME > FREE
   */
  hasAccess(requiredTier: UserTier): boolean {
    const tierRank = {
      [UserTier.FREE]: 1,
      [UserTier.HOME]: 2,
      [UserTier.PRO]: 3,
      [UserTier.OWNER]: 4,
    }

    return tierRank[currentTier] >= tierRank[requiredTier]
  },

  isFree(): boolean {
    return currentTier === UserTier.FREE
  },

  isHome(): boolean {
    return currentTier === UserTier.HOME
  },

  isPro(): boolean {
    return currentTier === UserTier.PRO
  },

  isOwner(): boolean {
    return currentTier === UserTier.OWNER
  },
}
