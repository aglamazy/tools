/**
 * Household Types
 * Types for household sharing feature (HOME tier)
 */

export type HouseholdRole = 'owner' | 'member'

export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'cancelled'

/**
 * Household document in Firestore (households/{householdId})
 */
export interface Household {
  id: string
  ownerId: string
  members: string[] // Array of user UIDs
  createdAt: string // ISO timestamp
}

/**
 * Invitation document in Firestore (invitations/{invitationId})
 */
export interface HouseholdInvitation {
  id: string
  householdId: string
  inviterUid: string
  inviterEmail?: string
  inviteeEmail: string
  status: InvitationStatus
  createdAt: string // ISO timestamp
  expiresAt: string // ISO timestamp
}

/**
 * User's household info (subset of user document)
 */
export interface UserHouseholdInfo {
  householdId?: string
  householdRole?: HouseholdRole
}

/**
 * API response types
 */
export interface HouseholdApiResponse {
  success: boolean
  error?: string
  errorCode?: string
}

export interface CreateHouseholdResponse extends HouseholdApiResponse {
  householdId?: string
}

export interface InviteResponse extends HouseholdApiResponse {
  invitationId?: string
}

export interface AcceptInviteResponse extends HouseholdApiResponse {
  householdId?: string
}

export interface HouseholdInfoResponse extends HouseholdApiResponse {
  household?: Household
  role?: HouseholdRole
  pendingInvitations?: HouseholdInvitation[]
}

export interface PendingInvitationResponse extends HouseholdApiResponse {
  invitation?: HouseholdInvitation
  inviterEmail?: string
}
