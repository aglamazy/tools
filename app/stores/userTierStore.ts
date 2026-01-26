/**
 * User Tier Store
 * Manages user subscription tier and feature access
 */

export enum UserTier {
  FREE = 'free',
  HOME = 'home',
  PRO = 'pro',
}

type Listener = (tier: UserTier) => void

// Default tier until fetched from Firestore
function getInitialTier(): UserTier {
  return UserTier.FREE
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
   * Tier hierarchy: PRO > HOME > FREE
   */
  hasAccess(requiredTier: UserTier): boolean {
    const tierRank = {
      [UserTier.FREE]: 1,
      [UserTier.HOME]: 2,
      [UserTier.PRO]: 3,
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
}
