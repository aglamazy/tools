/**
 * Create Household API Route
 * Creates a new household with the current user as owner
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyIdToken, setUserClaims, getAdminFirestore, isAdminConfigured } from '@/app/lib/firebaseAdmin'
import { FieldValue } from 'firebase-admin/firestore'

export async function POST(request: NextRequest) {
  if (!isAdminConfigured()) {
    return NextResponse.json({ success: false, error: 'שרת לא מוגדר', errorCode: 'not-configured' })
  }

  // Verify authentication
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ success: false, error: 'לא מחובר', errorCode: 'not-authenticated' })
  }

  const idToken = authHeader.substring(7)

  try {
    const decodedToken = await verifyIdToken(idToken)
    const uid = decodedToken.uid
    const email = decodedToken.email

    // Check if user already has a household
    if (decodedToken.householdId) {
      return NextResponse.json({
        success: false,
        error: 'כבר חבר במשק בית',
        errorCode: 'already-in-household',
      })
    }

    const firestore = getAdminFirestore()

    // Verify user has HOME tier or higher
    const userDoc = await firestore.collection('users').doc(uid).get()
    const userData = userDoc.data()
    const tier = userData?.tier || 'free'
    const tierRank: Record<string, number> = { free: 1, home: 2, pro: 3, owner: 4 }
    if ((tierRank[tier] || 0) < tierRank['home']) {
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
