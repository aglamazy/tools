/**
 * Business Share Service
 * Client-side service for per-business sharing operations
 */

import { collection, query, where, onSnapshot, type Unsubscribe } from 'firebase/firestore'
import { getFirebaseFirestore, isFirebaseConfigured, getFirebaseAuth } from '@/app/lib/firebase'
import { getIdToken } from './firebaseAuthService'

export type BusinessShare = {
  id: string
  ownerUid: string
  businessSyncId: string
  businessName: string
  sharedWithUid: string
  sharedWithEmail: string
  sharedWithDisplayName?: string // Firebase Auth displayName, resolved server-side at list time
  status: 'active' | 'revoked'
  sharePercent?: number // partnership share % (0-100); undefined = legacy share with no % set
  createdAt: string
}

export type BusinessShareInvitation = {
  id: string
  ownerUid: string
  businessSyncId: string
  businessName: string
  inviteeEmail: string
  status: 'pending' | 'accepted' | 'expired' | 'cancelled'
  sharePercent?: number // partnership share % (0-100); copied to BusinessShare on accept
  createdAt: string
  expiresAt: string
}

type ApiResponse = {
  success: boolean
  error?: string
  errorCode?: string
}

type InviteResponse = ApiResponse & { invitationId?: string }
type AcceptResponse = ApiResponse & { shareId?: string }

type ListResponse = ApiResponse & {
  ownedShares?: BusinessShare[]
  receivedShares?: BusinessShare[]
  pendingInvitations?: BusinessShareInvitation[]
}

const API_BASE = '/api/business-share'

async function apiRequest<T>(endpoint: string, method: 'GET' | 'POST', body?: Record<string, unknown>): Promise<T> {
  const idToken = await getIdToken()
  if (!idToken) {
    return { success: false, error: 'לא מחובר', errorCode: 'not-authenticated' } as T
  }

  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`,
    },
  }

  if (body && method === 'POST') {
    options.body = JSON.stringify(body)
  }

  const response = await fetch(`${API_BASE}/${endpoint}`, options)
  return response.json()
}

/**
 * Invite someone to share a business
 */
export async function inviteToShare(
  businessSyncId: string,
  businessName: string,
  email: string,
  sharePercent?: number,
): Promise<InviteResponse> {
  return apiRequest<InviteResponse>('invite', 'POST', { businessSyncId, businessName, email, sharePercent })
}

/**
 * Update partnership share % on an active business share
 */
export async function updateSharePercent(shareId: string, sharePercent: number): Promise<ApiResponse> {
  return apiRequest<ApiResponse>('update-percent', 'POST', { shareId, sharePercent })
}

/**
 * Update partnership share % on a pending invitation (before it's accepted)
 */
export async function updateInvitationPercent(invitationId: string, sharePercent: number): Promise<ApiResponse> {
  return apiRequest<ApiResponse>('update-percent', 'POST', { invitationId, sharePercent })
}

/**
 * Accept a business share invitation
 */
export async function acceptShareInvitation(invitationId: string): Promise<AcceptResponse> {
  return apiRequest<AcceptResponse>('accept', 'POST', { invitationId })
}

/**
 * Cancel a pending business share invitation (owner only)
 */
export async function cancelShareInvitation(invitationId: string): Promise<ApiResponse> {
  return apiRequest<ApiResponse>('cancel', 'POST', { invitationId })
}

/**
 * Revoke a business share (owner only)
 */
export async function revokeShare(shareId: string): Promise<ApiResponse> {
  return apiRequest<ApiResponse>('revoke', 'POST', { shareId })
}

/**
 * List all shares for the current user
 */
export async function listShares(): Promise<ListResponse> {
  return apiRequest<ListResponse>('list', 'GET')
}

/**
 * Subscribe to pending business share invitations for the current user (as invitee)
 */
export function subscribeToPendingShareInvitations(
  callback: (invitations: BusinessShareInvitation[]) => void,
): Unsubscribe {
  if (!isFirebaseConfigured()) {
    callback([])
    return () => {}
  }

  const auth = getFirebaseAuth()
  const user = auth.currentUser
  if (!user?.email) {
    callback([])
    return () => {}
  }

  const firestore = getFirebaseFirestore()
  const invitationsRef = collection(firestore, 'businessShareInvitations')
  const q = query(
    invitationsRef,
    where('inviteeEmail', '==', user.email.toLowerCase()),
    where('status', '==', 'pending'),
  )

  return onSnapshot(
    q,
    (snapshot) => {
      const invitations: BusinessShareInvitation[] = snapshot.docs.map((doc) => {
        const data = doc.data()
        return {
          id: doc.id,
          ownerUid: data.ownerUid,
          businessSyncId: data.businessSyncId,
          businessName: data.businessName,
          inviteeEmail: data.inviteeEmail,
          status: data.status,
          createdAt: data.createdAt,
          expiresAt: data.expiresAt,
        }
      })
      callback(invitations)
    },
    (error) => {
      console.error('[BusinessShare] Error subscribing to invitations:', error)
      callback([])
    },
  )
}
