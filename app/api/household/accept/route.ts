/**
 * Accept Invitation API Route
 * Accepts a household invitation and adds user as member
 */

import { NextRequest, NextResponse } from 'next/server'
import { setUserClaims, getAdminFirestore } from '@/app/lib/firebaseAdmin'
import { FieldValue } from 'firebase-admin/firestore'
import { requireTc } from '@/app/lib/apiGuard'
import { withServiceCall } from '@/app/lib/observe'

async function POSTHandler(request: NextRequest) {
  const guard = await requireTc(request)
  if (guard.error) return guard.error
  const uid = guard.uid
  const userEmail = guard.claims.email?.toLowerCase()

  try {
    const body = await request.json()
    const { invitationId } = body

    if (!invitationId || typeof invitationId !== 'string') {
      return NextResponse.json({ success: false, error: 'מזהה הזמנה חסר', errorCode: 'invalid-invitation' })
    }

    // Check if user already has a household
    if (guard.claims.householdId) {
      return NextResponse.json({
        success: false,
        error: 'כבר חבר במשק בית. עזוב את משק הבית הנוכחי לפני הצטרפות לאחר.',
        errorCode: 'already-in-household',
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

    // Verify invitation is pending
    if (invitation.status !== 'pending') {
      return NextResponse.json({
        success: false,
        error: 'הזמנה כבר נוצלה או בוטלה',
        errorCode: 'invitation-invalid',
      })
    }

    // Check expiration
    if (new Date(invitation.expiresAt) < new Date()) {
      await invitationRef.update({ status: 'expired' })
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

    const householdId = invitation.householdId

    // Get household and verify it exists
    const householdRef = firestore.collection('households').doc(householdId)
    const householdDoc = await householdRef.get()

    if (!householdDoc.exists) {
      return NextResponse.json({
        success: false,
        error: 'משק הבית לא נמצא',
        errorCode: 'household-not-found',
      })
    }

    const householdData = householdDoc.data()!
    const members = householdData.members || []

    // Check household isn't full
    if (members.length >= 2) {
      return NextResponse.json({
        success: false,
        error: 'משק הבית מלא',
        errorCode: 'household-full',
      })
    }

    // Add user to household members
    await householdRef.update({
      members: FieldValue.arrayUnion(uid),
    })

    // Update user document (set tier to 'home' so they can access household features)
    const userRef = firestore.collection('users').doc(uid)
    await userRef.set(
      {
        householdId,
        householdRole: 'member',
        tier: 'home',
      },
      { merge: true }
    )

    // Set custom claims (include tier so proxy can enforce it)
    await setUserClaims(uid, {
      householdId,
      householdRole: 'member',
      tier: 'home',
    })

    // Mark invitation as accepted
    await invitationRef.update({
      status: 'accepted',
      acceptedAt: new Date().toISOString(),
      acceptedBy: uid,
    })

    console.log(`[Household] User ${uid} joined household ${householdId}`)

    return NextResponse.json({
      success: true,
      householdId,
    })
  } catch (error: any) {
    console.error('[Household] Accept failed:', error)

    if (error.code === 'auth/id-token-expired') {
      return NextResponse.json({ success: false, error: 'פג תוקף ההתחברות', errorCode: 'token-expired' })
    }

    return NextResponse.json({ success: false, error: 'שגיאת שרת', errorCode: 'unknown' })
  }
}

export const POST = withServiceCall(POSTHandler)
