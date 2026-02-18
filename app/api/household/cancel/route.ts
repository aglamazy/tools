/**
 * Cancel Invitation API Route
 * Cancels a pending invitation (owner only)
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyIdToken, getAdminFirestore, isAdminConfigured } from '@/app/lib/firebaseAdmin'

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
    const body = await request.json()
    const { invitationId } = body

    if (!invitationId || typeof invitationId !== 'string') {
      return NextResponse.json({ success: false, error: 'מזהה הזמנה חסר', errorCode: 'invalid-invitation' })
    }

    const decodedToken = await verifyIdToken(idToken)
    const uid = decodedToken.uid
    const householdId = decodedToken.householdId as string
    const householdRole = decodedToken.householdRole as string

    // Check if user is household owner
    if (householdRole !== 'owner') {
      return NextResponse.json({
        success: false,
        error: 'רק בעל משק הבית יכול לבטל הזמנות',
        errorCode: 'not-owner',
      })
    }

    const firestore = getAdminFirestore()

    // Get invitation
    const invitationRef = firestore.collection('invitations').doc(invitationId)
    const invitationDoc = await invitationRef.get()

    if (!invitationDoc.exists) {
      return NextResponse.json({
        success: false,
        error: 'הזמנה לא נמצאה',
        errorCode: 'invitation-not-found',
      })
    }

    const invitation = invitationDoc.data()!

    // Verify invitation belongs to user's household
    if (invitation.householdId !== householdId) {
      return NextResponse.json({
        success: false,
        error: 'ההזמנה לא שייכת למשק הבית שלך',
        errorCode: 'not-authorized',
      })
    }

    // Check if already cancelled or accepted
    if (invitation.status !== 'pending') {
      return NextResponse.json({
        success: false,
        error: 'ההזמנה כבר נוצלה או בוטלה',
        errorCode: 'invitation-invalid',
      })
    }

    // Cancel the invitation
    await invitationRef.update({
      status: 'cancelled',
      cancelledAt: new Date().toISOString(),
      cancelledBy: uid,
    })

    console.log(`[Household] Invitation ${invitationId} cancelled by ${uid}`)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[Household] Cancel invitation failed:', error)

    if (error.code === 'auth/id-token-expired') {
      return NextResponse.json({ success: false, error: 'פג תוקף ההתחברות', errorCode: 'token-expired' })
    }

    return NextResponse.json({ success: false, error: 'שגיאת שרת', errorCode: 'unknown' })
  }
}
