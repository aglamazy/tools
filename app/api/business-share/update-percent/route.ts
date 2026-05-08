/**
 * Business Share Update Percent API Route
 * Updates the partnership share % on either an active share or a pending invitation.
 * Body: { shareId, sharePercent } or { invitationId, sharePercent }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminFirestore } from '@/app/lib/firebaseAdmin'
import { requireAuth } from '@/app/lib/apiGuard'

export async function POST(request: NextRequest) {
  const guard = await requireAuth(request)
  if (guard.error) return guard.error
  const uid = guard.uid

  try {
    const body = await request.json()
    const { shareId, invitationId, sharePercent } = body

    if (typeof sharePercent !== 'number' || sharePercent < 0 || sharePercent > 100) {
      return NextResponse.json({ success: false, error: 'אחוז שותפות חייב להיות בין 0 ל-100', errorCode: 'invalid-share-percent' })
    }

    if (!shareId && !invitationId) {
      return NextResponse.json({ success: false, error: 'מזהה שיתוף או הזמנה חסר', errorCode: 'invalid-target' })
    }

    const firestore = getAdminFirestore()

    if (shareId) {
      const ref = firestore.collection('businessShares').doc(shareId)
      const doc = await ref.get()
      if (!doc.exists) {
        return NextResponse.json({ success: false, error: 'שיתוף לא נמצא', errorCode: 'share-not-found' })
      }
      if (doc.data()!.ownerUid !== uid) {
        return NextResponse.json({ success: false, error: 'אין הרשאה', errorCode: 'forbidden' })
      }
      await ref.update({ sharePercent })
      return NextResponse.json({ success: true })
    }

    // invitationId path
    const ref = firestore.collection('businessShareInvitations').doc(invitationId)
    const doc = await ref.get()
    if (!doc.exists) {
      return NextResponse.json({ success: false, error: 'הזמנה לא נמצאה', errorCode: 'invitation-not-found' })
    }
    if (doc.data()!.ownerUid !== uid) {
      return NextResponse.json({ success: false, error: 'אין הרשאה', errorCode: 'forbidden' })
    }
    await ref.update({ sharePercent })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[BusinessShare] Update percent failed:', error)
    if (error.code === 'auth/id-token-expired') {
      return NextResponse.json({ success: false, error: 'פג תוקף ההתחברות', errorCode: 'token-expired' })
    }
    return NextResponse.json({ success: false, error: 'שגיאת שרת', errorCode: 'unknown' })
  }
}
