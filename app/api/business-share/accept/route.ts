/**
 * Business Share Accept API Route
 * Accepts a business sharing invitation
 */

import { NextRequest, NextResponse } from 'next/server'
import { setUserClaims, getAdminFirestore, getUserClaims } from '@/app/lib/firebaseAdmin'
import { requireAuth } from '@/app/lib/apiGuard'

export async function POST(request: NextRequest) {
  const guard = await requireAuth(request)
  if (guard.error) return guard.error
  const uid = guard.uid
  const userEmail = guard.claims.email?.toLowerCase()

  try {
    const body = await request.json()
    const { invitationId } = body

    if (!invitationId || typeof invitationId !== 'string') {
      return NextResponse.json({ success: false, error: 'מזהה הזמנה חסר', errorCode: 'invalid-invitation' })
    }

    const firestore = getAdminFirestore()

    // Get invitation
    const invitationRef = firestore.collection('businessShareInvitations').doc(invitationId)
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

    // Verify email matches
    if (userEmail && invitation.inviteeEmail !== userEmail) {
      return NextResponse.json({
        success: false,
        error: 'ההזמנה נשלחה לאימייל אחר',
        errorCode: 'email-mismatch',
      })
    }

    // Create business share doc
    const shareRef = firestore.collection('businessShares').doc()

    await shareRef.set({
      ownerUid: invitation.ownerUid,
      businessSyncId: invitation.businessSyncId,
      businessName: invitation.businessName,
      sharedWithUid: uid,
      sharedWithEmail: invitation.inviteeEmail,
      status: 'active',
      ...(typeof invitation.sharePercent === 'number' ? { sharePercent: invitation.sharePercent } : {}),
      createdAt: new Date().toISOString(),
    })

    // Update custom claims on BOTH users — add businessSyncId to sharedBusinesses
    const ownerClaims = await getUserClaims(invitation.ownerUid)
    const ownerShared = Array.isArray(ownerClaims.sharedBusinesses) ? [...ownerClaims.sharedBusinesses] : []
    if (!ownerShared.includes(invitation.businessSyncId)) ownerShared.push(invitation.businessSyncId)
    await setUserClaims(invitation.ownerUid, { sharedBusinesses: ownerShared })

    const recipientClaims = await getUserClaims(uid)
    const recipientShared = Array.isArray(recipientClaims.sharedBusinesses) ? [...recipientClaims.sharedBusinesses] : []
    if (!recipientShared.includes(invitation.businessSyncId)) recipientShared.push(invitation.businessSyncId)
    await setUserClaims(uid, { sharedBusinesses: recipientShared })

    // Mark invitation as accepted
    await invitationRef.update({
      status: 'accepted',
      acceptedAt: new Date().toISOString(),
      acceptedBy: uid,
    })

    console.log(`[BusinessShare] User ${uid} accepted share for business ${invitation.businessSyncId}`)

    return NextResponse.json({
      success: true,
      shareId: shareRef.id,
    })
  } catch (error: any) {
    console.error('[BusinessShare] Accept failed:', error)

    if (error.code === 'auth/id-token-expired') {
      return NextResponse.json({ success: false, error: 'פג תוקף ההתחברות', errorCode: 'token-expired' })
    }

    return NextResponse.json({ success: false, error: 'שגיאת שרת', errorCode: 'unknown' })
  }
}
