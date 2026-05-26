/**
 * Business Share Service — client-side bindings for the partner / invitation
 * / access-grant data model.
 *
 * Three entities:
 *   - BusinessPartner     — durable identity + share %. Owns a slice of the 100%.
 *   - BusinessShareInvitation — transient access link (pending|accepted|expired|cancelled).
 *   - BusinessAccessGrant — current binding between a partner and a Firebase uid.
 *                            Granted via accepting an invitation; revoking it
 *                            removes the uid's access without deleting the partner.
 */

import { collection, query, where, onSnapshot, type Unsubscribe } from 'firebase/firestore'
import { getFirebaseFirestore, isFirebaseConfigured, getFirebaseAuth } from '@/app/lib/firebase'
import { getIdToken } from './firebaseAuthService'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BusinessPartner = {
  id: string
  ownerUid: string
  businessSyncId: string
  businessName: string
  email: string
  displayName: string | null
  sharePercent: number
  createdAt: string
  updatedAt: string
}

export type BusinessShareInvitation = {
  id: string
  partnerId?: string
  ownerUid: string
  businessSyncId: string
  businessName: string
  inviteeEmail: string
  status: 'pending' | 'accepted' | 'expired' | 'cancelled'
  createdAt: string
  expiresAt: string
  acceptedAt?: string
  acceptedBy?: string
}

export type BusinessAccessGrant = {
  id: string
  partnerId: string
  ownerUid: string
  businessSyncId: string
  uid: string
  email: string
  grantedAt: string
  grantedViaInvitationId: string
  /** Resolved server-side from Firebase Auth — display name of the granted user. */
  grantedUserDisplayName?: string
}

// ---------------------------------------------------------------------------
// API plumbing
// ---------------------------------------------------------------------------

type ApiResponse = {
  success: boolean
  error?: string
  errorCode?: string
}

type InviteResponse = ApiResponse & { invitationId?: string; partnerId?: string }
type AcceptResponse = ApiResponse & { grantId?: string; partnerId?: string }
type AddPartnerResponse = ApiResponse & { partnerId?: string }

export type ListResponse = ApiResponse & {
  partners?: BusinessPartner[]
  ownedInvitations?: BusinessShareInvitation[]
  receivedInvitations?: BusinessShareInvitation[]
  grantsToMe?: BusinessAccessGrant[]
  grantsFromMe?: BusinessAccessGrant[]
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
  if (body && method === 'POST') options.body = JSON.stringify(body)

  const response = await fetch(`${API_BASE}/${endpoint}`, options)
  return response.json()
}

// ---------------------------------------------------------------------------
// Partner CRUD
// ---------------------------------------------------------------------------

export async function addPartner(args: {
  businessSyncId: string
  businessName: string
  email: string
  displayName?: string
  sharePercent: number
}): Promise<AddPartnerResponse> {
  return apiRequest<AddPartnerResponse>('partner/add', 'POST', args as unknown as Record<string, unknown>)
}

export async function updatePartner(
  partnerId: string,
  patch: { sharePercent?: number; displayName?: string | null },
): Promise<ApiResponse> {
  return apiRequest<ApiResponse>('partner/update', 'POST', { partnerId, ...patch })
}

export async function removePartner(partnerId: string): Promise<ApiResponse> {
  return apiRequest<ApiResponse>('partner/remove', 'POST', { partnerId })
}

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------

/**
 * Send a new pending invitation. Either:
 *   - reuse an existing partner: pass `{ partnerId }`
 *   - or create-on-the-fly: pass `{ businessSyncId, businessName, email, ... }`
 *     and the route will look up or create the partner record first.
 */
export async function sendInvite(args:
  | { partnerId: string }
  | { businessSyncId: string; businessName: string; email: string; displayName?: string; sharePercent?: number }
): Promise<InviteResponse> {
  return apiRequest<InviteResponse>('invite', 'POST', args as unknown as Record<string, unknown>)
}

export async function acceptShareInvitation(invitationId: string): Promise<AcceptResponse> {
  return apiRequest<AcceptResponse>('accept', 'POST', { invitationId })
}

export async function cancelShareInvitation(invitationId: string): Promise<ApiResponse> {
  return apiRequest<ApiResponse>('cancel', 'POST', { invitationId })
}

// ---------------------------------------------------------------------------
// Access grants
// ---------------------------------------------------------------------------

export async function revokeAccess(grantId: string): Promise<ApiResponse> {
  return apiRequest<ApiResponse>('access/revoke', 'POST', { grantId })
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export async function listShares(): Promise<ListResponse> {
  return apiRequest<ListResponse>('list', 'GET')
}

// ---------------------------------------------------------------------------
// Realtime — invitee subscribes to pending invitations addressed to them.
// ---------------------------------------------------------------------------

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
          partnerId: data.partnerId,
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
