/**
 * User Service
 * Manages user data in Firestore (tier, household, etc.)
 */

import { doc, getDoc, onSnapshot, type Unsubscribe } from 'firebase/firestore'
import { getFirebaseFirestore, isFirebaseConfigured } from '@/app/lib/firebase'
import { UserTier } from '@/app/stores/userTierStore'

export interface UserData {
  tier: UserTier
  createdAt?: string
  // Future: householdId for HOME tier sharing
  householdId?: string
}

const DEFAULT_USER_DATA: UserData = {
  tier: UserTier.FREE,
}

/**
 * Fetch user data from Firestore
 * Returns default data if user document doesn't exist
 */
export async function fetchUserData(uid: string): Promise<UserData> {
  if (!isFirebaseConfigured()) {
    console.warn('[UserService] Firebase not configured, using default tier')
    return DEFAULT_USER_DATA
  }

  try {
    const firestore = getFirebaseFirestore()
    const userDoc = await getDoc(doc(firestore, 'users', uid))

    if (!userDoc.exists()) {
      console.log('[UserService] No user document found, using default tier')
      return DEFAULT_USER_DATA
    }

    const data = userDoc.data()
    return {
      tier: (data.tier as UserTier) || UserTier.FREE,
      createdAt: data.createdAt,
      householdId: data.householdId,
    }
  } catch (error) {
    console.error('[UserService] Error fetching user data:', error)
    return DEFAULT_USER_DATA
  }
}

/**
 * Subscribe to real-time user data updates
 * Useful for detecting tier changes without page refresh
 */
export function subscribeToUserData(
  uid: string,
  callback: (data: UserData) => void
): Unsubscribe {
  if (!isFirebaseConfigured()) {
    callback(DEFAULT_USER_DATA)
    return () => {}
  }

  const firestore = getFirebaseFirestore()
  const userDocRef = doc(firestore, 'users', uid)

  return onSnapshot(
    userDocRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        callback(DEFAULT_USER_DATA)
        return
      }

      const data = snapshot.data()
      callback({
        tier: (data.tier as UserTier) || UserTier.FREE,
        createdAt: data.createdAt,
        householdId: data.householdId,
      })
    },
    (error) => {
      console.error('[UserService] Error subscribing to user data:', error)
      callback(DEFAULT_USER_DATA)
    }
  )
}
