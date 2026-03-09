/**
 * API route guard helpers for authentication, tier, and T&C checks.
 *
 * Usage:
 *   const guard = await requireAuth(request)            // just auth
 *   const guard = await requireTier(request, 'owner')   // auth + tier
 *   const guard = await requireTc(request)              // auth + T&C accepted
 *
 * Returns { uid, tier, error? }. If error is set, return it directly.
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyIdToken, getAdminFirestore, isAdminConfigured } from '@/app/lib/firebaseAdmin'
import { config } from '@/app/config'

type UserTier = 'free' | 'home' | 'pro' | 'owner'

const TIER_RANK: Record<UserTier, number> = { free: 1, home: 2, pro: 3, owner: 4 }

type DecodedClaims = {
  email?: string
  householdId?: string
  householdRole?: string
  [key: string]: unknown
}

type GuardResult =
  | { uid: string; tier: UserTier; tcAccepted: boolean; claims: DecodedClaims; error?: undefined }
  | { uid?: undefined; tier?: undefined; tcAccepted?: undefined; claims?: undefined; error: NextResponse }

async function resolveUser(request: NextRequest): Promise<GuardResult> {
  if (!isAdminConfigured()) {
    return { error: NextResponse.json({ success: false, error: 'Server not configured' }, { status: 500 }) }
  }

  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) }
  }

  try {
    const decoded = await verifyIdToken(authHeader.slice(7))
    const firestore = getAdminFirestore()
    const userDoc = await firestore.collection('users').doc(decoded.uid).get()
    const data = userDoc.data() || {}
    const tier = (data.tier as UserTier) || 'free'

    // Check T&C: compare accepted version with latest from Firestore or config fallback
    const tcAcceptedAt = data.tcAcceptedAt as string | undefined
    let requiredVersion = config.tcVersion
    try {
      const latestTc = await firestore.collection('tcVersions').orderBy('version', 'desc').limit(1).get()
      if (!latestTc.empty) {
        requiredVersion = latestTc.docs[0].id
      }
    } catch { /* use config fallback */ }
    const tcAccepted = tcAcceptedAt != null && tcAcceptedAt >= requiredVersion

    const claims: DecodedClaims = {
      email: decoded.email,
      householdId: decoded.householdId as string | undefined,
      householdRole: decoded.householdRole as string | undefined,
    }

    return { uid: decoded.uid, tier, tcAccepted, claims }
  } catch {
    return { error: NextResponse.json({ success: false, error: 'Invalid token' }, { status: 401 }) }
  }
}

/** Require authenticated user */
export async function requireAuth(request: NextRequest): Promise<GuardResult> {
  return resolveUser(request)
}

/** Require authenticated user with minimum tier */
export async function requireTier(request: NextRequest, minTier: UserTier): Promise<GuardResult> {
  const result = await resolveUser(request)
  if (result.error) return result
  if (TIER_RANK[result.tier] < TIER_RANK[minTier]) {
    return { error: NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 }) }
  }
  return result
}

/** Require authenticated user who accepted T&C */
export async function requireTc(request: NextRequest): Promise<GuardResult> {
  const result = await resolveUser(request)
  if (result.error) return result
  if (!result.tcAccepted) {
    return { error: NextResponse.json({ success: false, error: 'Terms not accepted', code: 'tc-required' }, { status: 403 }) }
  }
  return result
}

/** Require authenticated user with minimum tier AND T&C accepted */
export async function requireTierAndTc(request: NextRequest, minTier: UserTier): Promise<GuardResult> {
  const result = await resolveUser(request)
  if (result.error) return result
  if (TIER_RANK[result.tier] < TIER_RANK[minTier]) {
    return { error: NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 }) }
  }
  if (!result.tcAccepted) {
    return { error: NextResponse.json({ success: false, error: 'Terms not accepted', code: 'tc-required' }, { status: 403 }) }
  }
  return result
}
