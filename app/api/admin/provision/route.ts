/**
 * Admin: Pre-provision Account API Route
 * Creates a provision record for a user who hasn't signed up yet
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyIdToken, getAdminFirestore, isAdminConfigured } from '@/app/lib/firebaseAdmin'
import { UserTier } from '@/app/stores/userTierStore'

const VALID_TIERS = Object.values(UserTier)

export async function POST(request: NextRequest) {
  if (!isAdminConfigured()) {
    return NextResponse.json({ success: false, error: 'שרת לא מוגדר', errorCode: 'not-configured' })
  }

  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ success: false, error: 'לא מחובר', errorCode: 'not-authenticated' })
  }

  const idToken = authHeader.substring(7)

  try {
    const decodedToken = await verifyIdToken(idToken)
    const callerUid = decodedToken.uid

    // Verify caller is OWNER tier
    const firestore = getAdminFirestore()
    const callerDoc = await firestore.collection('users').doc(callerUid).get()
    const callerData = callerDoc.data()
    const callerTier = (callerData?.tier as UserTier) || UserTier.FREE
    if (callerTier !== UserTier.OWNER) {
      return NextResponse.json({ success: false, error: 'אין הרשאה', errorCode: 'forbidden' })
    }

    const body = await request.json()
    const { email, tier, isLifetime } = body as { email: string; tier: UserTier; isLifetime: boolean }

    if (!email || !tier) {
      return NextResponse.json({ success: false, error: 'חסרים פרטים', errorCode: 'invalid-body' })
    }

    if (!VALID_TIERS.includes(tier)) {
      return NextResponse.json({ success: false, error: 'דרגה לא חוקית', errorCode: 'invalid-tier' })
    }

    const normalizedEmail = email.toLowerCase().trim()

    await firestore.collection('provisions').doc(normalizedEmail).set({
      email: normalizedEmail,
      tier,
      isLifetime: isLifetime === true,
      createdAt: new Date(),
      createdBy: callerUid,
      claimedAt: null,
      claimedBy: null,
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[Admin] Provision failed:', error)

    if (error.code === 'auth/id-token-expired') {
      return NextResponse.json({ success: false, error: 'פג תוקף ההתחברות', errorCode: 'token-expired' })
    }

    return NextResponse.json({ success: false, error: 'שגיאת שרת', errorCode: 'unknown' })
  }
}
