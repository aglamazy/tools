/**
 * Create Household API Route
 * Creates a new household with the current user as owner
 */

import { NextRequest, NextResponse } from 'next/server'
import { setUserClaims, getAdminFirestore } from '@/app/lib/firebaseAdmin'
import { requireTc } from '@/app/lib/apiGuard'

export async function POST(request: NextRequest) {
  const guard = await requireTc(request)
  if (guard.error) return guard.error
  const uid = guard.uid

  try {
    // Check if user already has a household
    if (guard.claims.householdId) {
      return NextResponse.json({
        success: false,
        error: 'כבר חבר במשק בית',
        errorCode: 'already-in-household',
      })
    }

    const firestore = getAdminFirestore()

    // Verify user has HOME tier or higher
    const tierRank: Record<string, number> = { free: 1, home: 2, pro: 3, owner: 4 }
    if ((tierRank[guard.tier] || 0) < tierRank['home']) {
      return NextResponse.json({
        success: false,
        error: 'נדרשת מנוי בית כדי ליצור משק בית',
        errorCode: 'insufficient-tier',
      })
    }

    // Create household document
    const householdRef = firestore.collection('households').doc()
    const householdId = householdRef.id
    const now = new Date().toISOString()

    await householdRef.set({
      ownerId: uid,
      members: [uid],
      createdAt: now,
    })

    // Update user document with household info
    const userRef = firestore.collection('users').doc(uid)
    await userRef.set(
      {
        householdId,
        householdRole: 'owner',
      },
      { merge: true }
    )

    // Set custom claims on user (for Storage rules)
    await setUserClaims(uid, {
      householdId,
      householdRole: 'owner',
    })

    console.log(`[Household] Created household ${householdId} for user ${uid}`)

    return NextResponse.json({
      success: true,
      householdId,
    })
  } catch (error: any) {
    console.error('[Household] Create failed:', error)

    if (error.code === 'auth/id-token-expired') {
      return NextResponse.json({ success: false, error: 'פג תוקף ההתחברות', errorCode: 'token-expired' })
    }

    return NextResponse.json({ success: false, error: 'שגיאת שרת', errorCode: 'unknown' })
  }
}
