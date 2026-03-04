/**
 * Admin: List Provisions API Route
 * Returns all pre-provisioned accounts
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyIdToken, getAdminFirestore, isAdminConfigured } from '@/app/lib/firebaseAdmin'
import { UserTier } from '@/app/stores/userTierStore'

export async function GET(request: NextRequest) {
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

    const snapshot = await firestore.collection('provisions').get()
    const provisions = snapshot.docs.map((doc) => {
      const data = doc.data()
      return {
        email: data.email,
        tier: data.tier,
        isLifetime: data.isLifetime,
        createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
        createdBy: data.createdBy,
        claimedAt: data.claimedAt?.toDate?.()?.toISOString() ?? null,
        claimedBy: data.claimedBy ?? null,
      }
    })

    return NextResponse.json({ success: true, provisions })
  } catch (error: any) {
    console.error('[Admin] List provisions failed:', error)

    if (error.code === 'auth/id-token-expired') {
      return NextResponse.json({ success: false, error: 'פג תוקף ההתחברות', errorCode: 'token-expired' })
    }

    return NextResponse.json({ success: false, error: 'שגיאת שרת', errorCode: 'unknown' })
  }
}
