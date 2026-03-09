/**
 * User Tier Store
 * Manages user subscription tier and feature access.
 * Also owns Firestore subscription for real-time tier sync.
 */

import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore'
import { getFirebaseFirestore, isFirebaseConfigured } from '@/app/lib/firebase'
import { config } from '@/app/config'

export enum UserTier {
  FREE = 'free',
  HOME = 'home',
  PRO = 'pro',
  OWNER = 'owner',
}

export interface UserData {
  tier: UserTier
  createdAt?: string
  householdId?: string
  householdRole?: 'owner' | 'member'
  tcAcceptedAt?: string
}

export type TcState = { accepted: boolean; loading: boolean }

type Listener = (tier: UserTier) => void

const TIER_RANK: Record<UserTier, number> = {
  [UserTier.FREE]: 1,
  [UserTier.HOME]: 2,
  [UserTier.PRO]: 3,
  [UserTier.OWNER]: 4,
}

let currentTier: UserTier = UserTier.FREE
const listeners: Set<Listener> = new Set()
let firestoreUnsubscribe: Unsubscribe | null = null

let tcAcceptedAt: string | null = null
let tcLoading = true
const tcListeners = new Set<(state: TcState) => void>()

function notifyTcListeners() {
  const accepted = tcAcceptedAt != null && tcAcceptedAt >= config.tcVersion
  tcListeners.forEach((l) => l({ accepted, loading: tcLoading }))
}

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
   * Start real-time Firestore subscription for the logged-in user's tier.
   * Updates the in-memory tier whenever Firestore changes.
   */
  subscribeFirestore(uid: string): void {
    if (!isFirebaseConfigured()) {
      // Offline/unconfigured: default tier to FREE, TC to accepted
      this.set(UserTier.FREE)
      tcAcceptedAt = null
      tcLoading = false
      tcListeners.forEach((l) => l({ accepted: true, loading: false }))
      return
    }
    this.unsubscribeFirestore()
    const firestore = getFirebaseFirestore()
    firestoreUnsubscribe = onSnapshot(
      doc(firestore, 'users', uid),
      (snapshot) => {
        if (!snapshot.exists()) {
          this.set(UserTier.FREE)
          tcAcceptedAt = null
          tcLoading = false
          notifyTcListeners()
          return
        }
        const data = snapshot.data()
        this.set((data.tier as UserTier) || UserTier.FREE)
        tcAcceptedAt = (data?.tcAcceptedAt as string | undefined) ?? null
        tcLoading = false
        notifyTcListeners()
      },
      (error) => {
        console.error('[UserTierStore] Firestore subscription error:', error)
        this.set(UserTier.FREE)
        tcAcceptedAt = null
        tcLoading = false
        notifyTcListeners()
      }
    )
  },

  /**
   * Stop the Firestore subscription (call on sign-out).
   */
  unsubscribeFirestore(): void {
    if (firestoreUnsubscribe) {
      firestoreUnsubscribe()
      firestoreUnsubscribe = null
    }
    tcAcceptedAt = null
    tcLoading = true
    notifyTcListeners()
  },

  getTcState(): TcState {
    const accepted = tcAcceptedAt != null && tcAcceptedAt >= config.tcVersion
    return { accepted, loading: tcLoading }
  },

  subscribeTc(listener: (state: TcState) => void): () => void {
    tcListeners.add(listener)
    listener(this.getTcState())
    return () => {
      tcListeners.delete(listener)
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
