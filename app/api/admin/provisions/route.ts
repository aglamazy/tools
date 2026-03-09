/**
 * Admin: List Provisions API Route
 * Returns all pre-provisioned accounts
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminFirestore } from '@/app/lib/firebaseAdmin'
import { requireTier } from '@/app/lib/apiGuard'

export async function GET(request: NextRequest) {
  const guard = await requireTier(request, 'owner')
  if (guard.error) return guard.error

  try {
    const firestore = getAdminFirestore()
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
