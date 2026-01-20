/**
 * User Tier Service
 * Store/fetch user tier from Firestore
 * Collection: users/{uid} → { tier: 'freemium' | 'business', updatedAt }
 */

import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import { getFirebaseFirestore, isFirebaseConfigured } from '@/app/lib/firebase'
import { UserTier } from '@/app/stores/userTierStore'

export type UserTierData = {
  tier: UserTier
  updatedAt: Date
  stripeCustomerId?: string
  stripeSessionId?: string
}

const USERS_COLLECTION = 'users'

/**
 * Get user tier from Firestore
 */
export async function getUserTier(uid: string): Promise<UserTier> {
  if (!isFirebaseConfigured()) {
    console.warn('[UserTierService] Firebase not configured, returning FREEMIUM')
    return UserTier.FREEMIUM
  }

  try {
    const db = getFirebaseFirestore()
    const userDoc = await getDoc(doc(db, USERS_COLLECTION, uid))

    if (userDoc.exists()) {
      const data = userDoc.data() as UserTierData
      return data.tier || UserTier.FREEMIUM
    }

    // New user, create with freemium tier
    await setUserTier(uid, UserTier.FREEMIUM)
    return UserTier.FREEMIUM
  } catch (err) {
    console.error('[UserTierService] Failed to get user tier:', err)
    return UserTier.FREEMIUM
  }
}

/**
 * Set user tier in Firestore
 */
export async function setUserTier(
  uid: string,
  tier: UserTier,
  additionalData?: Partial<UserTierData>
): Promise<void> {
  if (!isFirebaseConfigured()) {
    console.warn('[UserTierService] Firebase not configured, cannot set tier')
    return
  }

  try {
    const db = getFirebaseFirestore()
    await setDoc(
      doc(db, USERS_COLLECTION, uid),
      {
        tier,
        updatedAt: new Date(),
        ...additionalData,
      },
      { merge: true }
    )
    console.log('[UserTierService] User tier set to:', tier)
  } catch (err) {
    console.error('[UserTierService] Failed to set user tier:', err)
    throw err
  }
}

/**
 * Subscribe to user tier changes in Firestore
 */
export function subscribeToUserTier(
  uid: string,
  callback: (tier: UserTier) => void
): Unsubscribe {
  if (!isFirebaseConfigured()) {
    console.warn('[UserTierService] Firebase not configured, returning FREEMIUM')
    callback(UserTier.FREEMIUM)
    return () => {}
  }

  const db = getFirebaseFirestore()
  const userDocRef = doc(db, USERS_COLLECTION, uid)

  return onSnapshot(
    userDocRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as UserTierData
        callback(data.tier || UserTier.FREEMIUM)
      } else {
        callback(UserTier.FREEMIUM)
      }
    },
    (error) => {
      console.error('[UserTierService] Subscription error:', error)
      callback(UserTier.FREEMIUM)
    }
  )
}
