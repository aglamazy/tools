/**
 * User Tier Store
 * Manages user subscription tier and feature access.
 * Also owns Firestore subscription for real-time tier sync.
 */

import { doc, onSnapshot, collection, query, orderBy, limit, type Unsubscribe } from 'firebase/firestore'
import { getFirebaseFirestore, isFirebaseConfigured } from '@/app/lib/firebase'
import { config } from '@/app/config'

const TC_COLLECTION = 'tcVersions'

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
let userDocLoading = true
let requiredTcVersion: string | null = null
let requiredTcVersionLoading = true
let tcVersionsUnsubscribe: Unsubscribe | null = null

const tcListeners = new Set<(state: TcState) => void>()
const requiredVersionListeners = new Set<(version: string | null) => void>()

function notifyTcListeners() {
  const required = requiredTcVersion ?? config.tcVersion
  const accepted = tcAcceptedAt != null && tcAcceptedAt >= required
  const loading = userDocLoading || requiredTcVersionLoading
  tcListeners.forEach((l) => l({ accepted, loading }))
}

function notifyRequiredVersionListeners() {
  requiredVersionListeners.forEach(l => l(requiredTcVersion))
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
    listener(currentTier)
    return () => {
      listeners.delete(listener)
    }
  },

  /**
   * Subscribe to the latest required T&C version from Firestore tcVersions.
   * Idempotent — safe to call multiple times; starts the subscription once.
   */
  subscribeRequiredTcVersion(): () => void {
    if (tcVersionsUnsubscribe) return () => {}
    if (!isFirebaseConfigured()) {
      requiredTcVersion = config.tcVersion
      requiredTcVersionLoading = false
      notifyTcListeners()
      notifyRequiredVersionListeners()
      return () => {}
    }
    const firestore = getFirebaseFirestore()
    const q = query(collection(firestore, TC_COLLECTION), orderBy('version', 'desc'), limit(1))
    tcVersionsUnsubscribe = onSnapshot(
      q,
      (snapshot) => {
        requiredTcVersion = snapshot.empty ? config.tcVersion : snapshot.docs[0].id
        requiredTcVersionLoading = false
        notifyTcListeners()
        notifyRequiredVersionListeners()
      },
      (error) => {
        console.error('[UserTierStore] tcVersions subscription error:', error)
        requiredTcVersion = config.tcVersion
        requiredTcVersionLoading = false
        notifyTcListeners()
        notifyRequiredVersionListeners()
      }
    )
    return () => {
      if (tcVersionsUnsubscribe) {
        tcVersionsUnsubscribe()
        tcVersionsUnsubscribe = null
        requiredTcVersion = null
        requiredTcVersionLoading = true
      }
    }
  },

  /**
   * Subscribe to required T&C version changes (starts Firestore subscription if not running).
   * Emits immediately with current value (null if not yet loaded), then on updates.
   */
  subscribeRequiredVersion(listener: (version: string | null) => void): () => void {
    requiredVersionListeners.add(listener)
    listener(requiredTcVersion)
    this.subscribeRequiredTcVersion()
    return () => requiredVersionListeners.delete(listener)
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
      userDocLoading = false
      requiredTcVersion = config.tcVersion
      requiredTcVersionLoading = false
      tcListeners.forEach((l) => l({ accepted: true, loading: false }))
      return
    }
    this.unsubscribeFirestore()
    this.subscribeRequiredTcVersion()
    const firestore = getFirebaseFirestore()
    firestoreUnsubscribe = onSnapshot(
      doc(firestore, 'users', uid),
      (snapshot) => {
        if (!snapshot.exists()) {
          this.set(UserTier.FREE)
          tcAcceptedAt = null
          userDocLoading = false
          notifyTcListeners()
          return
        }
        const data = snapshot.data()
        this.set((data.tier as UserTier) || UserTier.FREE)
        tcAcceptedAt = (data?.tcAcceptedAt as string | undefined) ?? null
        userDocLoading = false
        notifyTcListeners()
      },
      (error) => {
        console.error('[UserTierStore] Firestore subscription error:', error)
        this.set(UserTier.FREE)
        tcAcceptedAt = null
        userDocLoading = false
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
    userDocLoading = true
    notifyTcListeners()
  },

  getTcState(): TcState {
    const required = requiredTcVersion ?? config.tcVersion
    const accepted = tcAcceptedAt != null && tcAcceptedAt >= required
    const loading = userDocLoading || requiredTcVersionLoading
    return { accepted, loading }
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
