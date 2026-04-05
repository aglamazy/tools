/**
 * Cancel Business Share Invitation API Route
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
    const { invitationId } = body

    if (!invitationId || typeof invitationId !== 'string') {
      return NextResponse.json({ success: false, error: 'מזהה הזמנה חסר', errorCode: 'invalid-invitation' })
    }

    const firestore = getAdminFirestore()
    const invitationRef = firestore.collection('businessShareInvitations').doc(invitationId)
    const invitationDoc = await invitationRef.get()

    if (!invitationDoc.exists) {
      return NextResponse.json({ success: false, error: 'הזמנה לא נמצאה', errorCode: 'invitation-not-found' })
    }

    const invitation = invitationDoc.data()!

    if (invitation.ownerUid !== uid) {
      return NextResponse.json({ success: false, error: 'רק היוצר יכול לבטל', errorCode: 'not-owner' })
    }

    if (invitation.status !== 'pending') {
      return NextResponse.json({ success: false, error: 'ההזמנה כבר נוצלה או בוטלה', errorCode: 'invitation-invalid' })
    }

    await invitationRef.update({ status: 'cancelled' })

    console.log(`[BusinessShare] Cancelled invitation ${invitationId}`)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[BusinessShare] Cancel failed:', error)

    if (error.code === 'auth/id-token-expired') {
      return NextResponse.json({ success: false, error: 'פג תוקף ההתחברות', errorCode: 'token-expired' })
    }

    return NextResponse.json({ success: false, error: 'שגיאת שרת', errorCode: 'unknown' })
  }
}
