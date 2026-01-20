/**
 * User Tier Store
 * Manages user subscription tier and feature access
 * - LOCAL tier: Use env var override for development
 * - Not logged in: Default to FREEMIUM
 * - Logged in: Fetch tier from Firestore and sync in real-time
 */

import { subscribeToAuthState, type AuthUser } from '@/app/services/firebaseAuthService'
import { getUserTier, subscribeToUserTier } from '@/app/services/userTierService'

export enum UserTier {
  FREEMIUM = 'freemium',
  BUSINESS = 'business',
  LOCAL = 'local',
}

type Listener = (tier: UserTier) => void

// Check if we're in local development mode
function isLocalMode(): boolean {
  return process.env.NEXT_PUBLIC_SEGMENT === 'local'
}

// Initialize from environment variable or default to freemium
function getInitialTier(): UserTier {
  if (isLocalMode()) {
    return UserTier.LOCAL
  }
  return UserTier.FREEMIUM
}

let currentTier: UserTier = getInitialTier()
const listeners: Set<Listener> = new Set()
let currentUser: AuthUser | null = null
let firestoreUnsubscribe: (() => void) | null = null
let isInitialized = false

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

  /**
   * Initialize auth-based tier syncing
   * Call this once when the app starts
   */
  initAuthSync(): void {
    if (isInitialized) return
    isInitialized = true

    // If we're in local mode, don't sync with Firestore
    if (isLocalMode()) {
      console.log('[UserTierStore] Local mode - using LOCAL tier')
      return
    }

    // Subscribe to auth state changes
    subscribeToAuthState((user) => {
      currentUser = user

      // Clean up previous Firestore subscription
      if (firestoreUnsubscribe) {
        firestoreUnsubscribe()
        firestoreUnsubscribe = null
      }

      if (user) {
        // User logged in - subscribe to their tier in Firestore
        firestoreUnsubscribe = subscribeToUserTier(user.uid, (tier) => {
          userTierStore.set(tier)
        })
      } else {
        // User logged out - reset to freemium
        userTierStore.set(UserTier.FREEMIUM)
      }
    })
  },

  /**
   * Fetch and update tier from Firestore (one-time)
   * Useful for manual refresh
   */
  async refreshTier(): Promise<void> {
    if (isLocalMode()) return
    if (!currentUser) return

    const tier = await getUserTier(currentUser.uid)
    userTierStore.set(tier)
  },

  /**
   * Get the current user if authenticated
   */
  getCurrentUser(): AuthUser | null {
    return currentUser
  },
}
