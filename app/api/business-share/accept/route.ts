/**
 * Accept a pending invitation. Creates (or reuses) the BusinessAccessGrant
 * that binds the current Firebase uid to the invitation's partner record.
 * The partner record itself is unchanged.
 *
 * Idempotent — accepting a regenerated invite reuses an existing grant
 * instead of duplicating it.
 *
 * Body: { invitationId }
 */

import { NextRequest, NextResponse } from 'next/server'
import { setUserClaims, getAdminFirestore, getUserClaims } from '@/app/lib/firebaseAdmin'
import { requireAuth } from '@/app/lib/apiGuard'
import { withServiceCall } from '@/app/lib/observe'

async function POSTHandler(request: NextRequest) {
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
    const invitationRef = firestore.collection('businessShareInvitations').doc(invitationId)
    const invitationDoc = await invitationRef.get()

    if (!invitationDoc.exists) {
      return NextResponse.json({ success: false, error: 'הזמנה לא נמצאה', errorCode: 'invitation-not-found' })
    }
    const invitation = invitationDoc.data()!

    if (invitation.status !== 'pending') {
      return NextResponse.json({ success: false, error: 'הזמנה כבר נוצלה או בוטלה', errorCode: 'invitation-invalid' })
    }
    if (new Date(invitation.expiresAt) < new Date()) {
      await invitationRef.update({ status: 'expired' })
      return NextResponse.json({ success: false, error: 'ההזמנה פגה', errorCode: 'invitation-expired' })
    }
    if (userEmail && invitation.inviteeEmail !== userEmail) {
      return NextResponse.json({ success: false, error: 'ההזמנה נשלחה לאימייל אחר', errorCode: 'email-mismatch' })
    }

    // Resolve / backfill partnerId on the invitation. Pre-migration invitations
    // (created before the partner-record split) may not have it yet.
    let partnerId: string | undefined = invitation.partnerId
    if (!partnerId) {
      const partnerSnap = await firestore
        .collection('businessPartners')
        .where('ownerUid', '==', invitation.ownerUid)
        .where('businessSyncId', '==', invitation.businessSyncId)
        .where('email', '==', invitation.inviteeEmail)
        .limit(1)
        .get()
      if (!partnerSnap.empty) {
        partnerId = partnerSnap.docs[0].id
        await invitationRef.update({ partnerId })
      } else {
        return NextResponse.json({ success: false, error: 'שותף לא נמצא — נא רענן ונסה שוב', errorCode: 'partner-not-found' })
      }
    }

    // Upsert the access grant for (partnerId, uid).
    const existingGrants = await firestore
      .collection('businessAccessGrants')
      .where('partnerId', '==', partnerId)
      .where('uid', '==', uid)
      .limit(1)
      .get()

    let grantRef: FirebaseFirestore.DocumentReference
    if (!existingGrants.empty) {
      grantRef = existingGrants.docs[0].ref
      await grantRef.update({
        grantedViaInvitationId: invitationId,
        grantedAt: new Date().toISOString(),
      })
    } else {
      grantRef = firestore.collection('businessAccessGrants').doc()
      await grantRef.set({
        partnerId,
        ownerUid: invitation.ownerUid,
        businessSyncId: invitation.businessSyncId,
        uid,
        email: invitation.inviteeEmail,
        grantedAt: new Date().toISOString(),
        grantedViaInvitationId: invitationId,
      })
    }

    // Refresh claims on BOTH users so they can talk to shared storage.
    const ownerClaims = await getUserClaims(invitation.ownerUid)
    const ownerShared = Array.isArray(ownerClaims.sharedBusinesses) ? [...ownerClaims.sharedBusinesses] : []
    if (!ownerShared.includes(invitation.businessSyncId)) {
      ownerShared.push(invitation.businessSyncId)
      await setUserClaims(invitation.ownerUid, { sharedBusinesses: ownerShared })
    }

    const recipientClaims = await getUserClaims(uid)
    const recipientShared = Array.isArray(recipientClaims.sharedBusinesses) ? [...recipientClaims.sharedBusinesses] : []
    if (!recipientShared.includes(invitation.businessSyncId)) {
      recipientShared.push(invitation.businessSyncId)
      await setUserClaims(uid, { sharedBusinesses: recipientShared })
    }

    await invitationRef.update({
      status: 'accepted',
      acceptedAt: new Date().toISOString(),
      acceptedBy: uid,
    })

    console.log(`[BusinessShare] User ${uid} accepted invitation ${invitationId} (partner ${partnerId}, grant ${grantRef.id})`)

    return NextResponse.json({ success: true, grantId: grantRef.id, partnerId })
  } catch (error: any) {
    console.error('[BusinessShare] Accept failed:', error)
    if (error.code === 'auth/id-token-expired') {
      return NextResponse.json({ success: false, error: 'פג תוקף ההתחברות', errorCode: 'token-expired' })
    }
    return NextResponse.json({ success: false, error: 'שגיאת שרת', errorCode: 'unknown' })
  }
}

export const POST = withServiceCall(POSTHandler)
