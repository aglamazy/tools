/**
 * Household Service
 * Client-side service for household sharing operations
 */

import { doc, getDoc, onSnapshot, collection, query, where, type Unsubscribe } from 'firebase/firestore'
import { getFirebaseFirestore, isFirebaseConfigured, getFirebaseAuth } from '@/app/lib/firebase'
import { getIdToken } from './firebaseAuthService'
import type {
  Household,
  HouseholdInvitation,
  HouseholdRole,
  CreateHouseholdResponse,
  InviteResponse,
  AcceptInviteResponse,
  HouseholdApiResponse,
  HouseholdInfoResponse,
  PendingInvitationResponse,
} from '@/app/types/household'

const API_BASE = '/api/household'

/**
 * Make authenticated API request to household endpoints
 */
async function apiRequest<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
  const idToken = await getIdToken()
  if (!idToken) {
    return { success: false, error: 'לא מחובר', errorCode: 'not-authenticated' } as T
  }

  const response = await fetch(`${API_BASE}/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`,
    },
    body: JSON.stringify(body),
  })

  return response.json()
}

/**
 * Create a new household (owner becomes first member)
 */
export async function createHousehold(): Promise<CreateHouseholdResponse> {
  return apiRequest<CreateHouseholdResponse>('create', {})
}

/**
 * Invite a partner to the household
 */
export async function invitePartner(email: string): Promise<InviteResponse> {
  return apiRequest<InviteResponse>('invite', { email })
}

/**
 * Accept a household invitation
 */
export async function acceptInvitation(invitationId: string): Promise<AcceptInviteResponse> {
  return apiRequest<AcceptInviteResponse>('accept', { invitationId })
}

/**
 * Leave the household
 */
export async function leaveHousehold(): Promise<HouseholdApiResponse> {
  return apiRequest<HouseholdApiResponse>('leave', {})
}

/**
 * Cancel a pending invitation (owner only)
 */
export async function cancelInvitation(invitationId: string): Promise<HouseholdApiResponse> {
  return apiRequest<HouseholdApiResponse>('cancel', { invitationId })
}

/**
 * Get household info for current user
 */
export async function getHouseholdInfo(): Promise<HouseholdInfoResponse> {
  return apiRequest<HouseholdInfoResponse>('info', {})
}

/**
 * Get pending invitation for current user (when accepting invite)
 */
export async function getPendingInvitation(invitationId: string): Promise<PendingInvitationResponse> {
  return apiRequest<PendingInvitationResponse>('invitation', { invitationId })
}

/**
 * Subscribe to household data changes
 */
export function subscribeToHousehold(
  householdId: string,
  callback: (household: Household | null) => void
): Unsubscribe {
  if (!isFirebaseConfigured()) {
    callback(null)
    return () => {}
  }

  const firestore = getFirebaseFirestore()
  const householdRef = doc(firestore, 'households', householdId)

  return onSnapshot(
    householdRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        callback(null)
        return
      }

      const data = snapshot.data()
      callback({
        id: snapshot.id,
        ownerId: data.ownerId,
        members: data.members || [],
        createdAt: data.createdAt,
      })
    },
    (error) => {
      console.error('[HouseholdService] Error subscribing to household:', error)
      callback(null)
    }
  )
}

/**
 * Subscribe to pending invitations for household (owner view)
 */
export function subscribeToPendingInvitations(
  householdId: string,
  callback: (invitations: HouseholdInvitation[]) => void
): Unsubscribe {
  if (!isFirebaseConfigured()) {
    callback([])
    return () => {}
  }

  const firestore = getFirebaseFirestore()
  const invitationsRef = collection(firestore, 'invitations')
  const q = query(
    invitationsRef,
    where('householdId', '==', householdId),
    where('status', '==', 'pending')
  )

  return onSnapshot(
    q,
    (snapshot) => {
      const invitations: HouseholdInvitation[] = snapshot.docs.map((doc) => {
        const data = doc.data()
        return {
          id: doc.id,
          householdId: data.householdId,
          inviterUid: data.inviterUid,
          inviterEmail: data.inviterEmail,
          inviteeEmail: data.inviteeEmail,
          status: data.status,
          createdAt: data.createdAt,
          expiresAt: data.expiresAt,
        }
      })
      callback(invitations)
    },
    (error) => {
      console.error('[HouseholdService] Error subscribing to invitations:', error)
      callback([])
    }
  )
}

/**
 * Get the user's householdId from their ID token claims
 * Returns null if not in a household
 */
export async function getHouseholdIdFromClaims(): Promise<string | null> {
  if (!isFirebaseConfigured()) return null

  const auth = getFirebaseAuth()
  const user = auth.currentUser
  if (!user) return null

  try {
    // Force refresh to get latest claims
    const tokenResult = await user.getIdTokenResult(true)
    return (tokenResult.claims.householdId as string) || null
  } catch (error) {
    console.error('[HouseholdService] Error getting claims:', error)
    return null
  }
}

/**
 * Check if user is household owner from their ID token claims
 */
export async function isHouseholdOwnerFromClaims(): Promise<boolean> {
  if (!isFirebaseConfigured()) return false

  const auth = getFirebaseAuth()
  const user = auth.currentUser
  if (!user) return false

  try {
    const tokenResult = await user.getIdTokenResult(true)
    return tokenResult.claims.householdRole === 'owner'
  } catch (error) {
    console.error('[HouseholdService] Error getting claims:', error)
    return false
  }
}
