/**
 * Admin: Promote/Demote Account API Route
 * Changes tier for an account (all members in household, or solo user)
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyIdToken, getAdminFirestore, isAdminConfigured } from '@/app/lib/firebaseAdmin'

const VALID_TIERS = ['free', 'home', 'pro', 'owner'] as const

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
    const callerUid = decodedToken.uid

    // Verify caller is OWNER tier (or bootstrap owner from env)
    const ownerEmail = process.env.OWNER_EMAIL?.trim().toLowerCase()
    const isBootstrapOwner = ownerEmail && decodedToken.email?.toLowerCase() === ownerEmail
    const firestore = getAdminFirestore()
    const callerDoc = await firestore.collection('users').doc(callerUid).get()
    const callerData = callerDoc.data()
    const callerTier = callerData?.tier || 'free'
    if (callerTier !== 'owner' && !isBootstrapOwner) {
      return NextResponse.json({ success: false, error: 'אין הרשאה', errorCode: 'forbidden' })
    }

    // Parse and validate body
    const body = await request.json()
    const { accountId, tier } = body as { accountId: string; tier: string }

    if (!accountId || !tier) {
      return NextResponse.json({ success: false, error: 'חסרים פרטים', errorCode: 'invalid-body' })
    }

    if (!VALID_TIERS.includes(tier as typeof VALID_TIERS[number])) {
      return NextResponse.json({ success: false, error: 'דרגה לא חוקית', errorCode: 'invalid-tier' })
    }

    // Check if accountId is a household
    const householdDoc = await firestore.collection('households').doc(accountId).get()

    if (householdDoc.exists) {
      // Household: update tier on all members
      const householdData = householdDoc.data()!
      const memberUids: string[] = householdData.members || []

      const batch = firestore.batch()
      for (const uid of memberUids) {
        batch.update(firestore.collection('users').doc(uid), { tier })
      }
      await batch.commit()
    } else {
      // Solo user: update that user's doc
      const userDoc = await firestore.collection('users').doc(accountId).get()
      if (!userDoc.exists) {
        // Create user doc if it doesn't exist
        await firestore.collection('users').doc(accountId).set({ tier }, { merge: true })
      } else {
        await firestore.collection('users').doc(accountId).update({ tier })
      }
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[Admin] Promote failed:', error)

    if (error.code === 'auth/id-token-expired') {
      return NextResponse.json({ success: false, error: 'פג תוקף ההתחברות', errorCode: 'token-expired' })
    }

    return NextResponse.json({ success: false, error: 'שגיאת שרת', errorCode: 'unknown' })
  }
}
