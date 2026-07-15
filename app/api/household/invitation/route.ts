/**
 * Get Invitation API Route
 * Returns invitation details for accepting
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminFirestore, getAdminAuth } from '@/app/lib/firebaseAdmin'
import { requireTc } from '@/app/lib/apiGuard'
import { withServiceCall } from '@/app/lib/observe'

async function POSTHandler(request: NextRequest) {
  const guard = await requireTc(request)
  if (guard.error) return guard.error
  const userEmail = guard.claims.email?.toLowerCase()

  try {
    const body = await request.json()
    const { invitationId } = body

    if (!invitationId || typeof invitationId !== 'string') {
      return NextResponse.json({ success: false, error: 'מזהה הזמנה חסר', errorCode: 'invalid-invitation' })
    }

    const firestore = getAdminFirestore()
    const auth = getAdminAuth()

    // Get invitation
    const invitationDoc = await firestore.collection('invitations').doc(invitationId).get()

    if (!invitationDoc.exists) {
      return NextResponse.json({
        success: false,
        error: 'הזמנה לא נמצאה',
        errorCode: 'invitation-not-found',
      })
    }

    const invitation = invitationDoc.data()!

    // Check if invitation is still valid
    if (invitation.status !== 'pending') {
      return NextResponse.json({
        success: false,
        error: 'הזמנה כבר נוצלה או בוטלה',
        errorCode: 'invitation-invalid',
      })
    }

    if (new Date(invitation.expiresAt) < new Date()) {
      return NextResponse.json({
        success: false,
        error: 'ההזמנה פגה',
        errorCode: 'invitation-expired',
      })
    }

    // Verify email matches (if user has email)
    if (userEmail && invitation.inviteeEmail !== userEmail) {
      return NextResponse.json({
        success: false,
        error: 'ההזמנה נשלחה לאימייל אחר',
        errorCode: 'email-mismatch',
      })
    }

    // Get inviter email for display
    let inviterEmail = invitation.inviterEmail
    if (!inviterEmail && invitation.inviterUid) {
      try {
        const inviterUser = await auth.getUser(invitation.inviterUid)
        inviterEmail = inviterUser.email
      } catch {
        inviterEmail = 'לא ידוע'
      }
    }

    return NextResponse.json({
      success: true,
      invitation: {
        id: invitationDoc.id,
        householdId: invitation.householdId,
        inviterUid: invitation.inviterUid,
        inviteeEmail: invitation.inviteeEmail,
        status: invitation.status,
        createdAt: invitation.createdAt,
        expiresAt: invitation.expiresAt,
      },
      inviterEmail,
    })
  } catch (error: any) {
    console.error('[Household] Get invitation failed:', error)

    if (error.code === 'auth/id-token-expired') {
      return NextResponse.json({ success: false, error: 'פג תוקף ההתחברות', errorCode: 'token-expired' })
    }

    return NextResponse.json({ success: false, error: 'שגיאת שרת', errorCode: 'unknown' })
  }
}

export const POST = withServiceCall(POSTHandler)
