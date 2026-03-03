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

const TIER_RANK: Record<UserTier, number> = {
  [UserTier.FREE]: 1,
  [UserTier.HOME]: 2,
  [UserTier.PRO]: 3,
  [UserTier.OWNER]: 4,
}

// LOCAL segment = developer/owner mode = OWNER as minimum floor
const isLocalEnv = process.env.NEXT_PUBLIC_SEGMENT === 'local'

function getInitialTier(): UserTier {
  if (isLocalEnv) return UserTier.OWNER
  return UserTier.FREE
}

// Always false so Firestore is always consulted — env override is handled in set()
export const isEnvOverride = false

let currentTier: UserTier = getInitialTier()
const listeners: Set<Listener> = new Set()

export const userTierStore = {
  get(): UserTier {
    return currentTier
  },

  set(tier: UserTier): void {
    // env-var is an OR condition: local env keeps OWNER as floor
    const effective = isLocalEnv && TIER_RANK[tier] < TIER_RANK[UserTier.OWNER]
      ? UserTier.OWNER
      : tier
    if (currentTier !== effective) {
      currentTier = effective
      listeners.forEach((listener) => listener(effective))
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
    return TIER_RANK[currentTier] >= TIER_RANK[requiredTier]
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
