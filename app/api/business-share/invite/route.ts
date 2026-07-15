/**
 * Create a pending invitation for a partner.
 *
 * Two call shapes:
 *   - { partnerId } — existing partner; cancels any pending invitations for
 *     the same partner and creates a fresh one. Use this for re-issuing a
 *     link to a partner whose previous link was consumed or expired.
 *   - { businessSyncId, businessName, email, displayName?, sharePercent }
 *     — auto-create the partner first (if not already present), then issue
 *     an invitation. Convenience for the legacy "add + invite in one go"
 *     UX.
 *
 * Either shape returns `{ success, invitationId, partnerId }`.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminFirestore, getUserClaims, setUserClaims } from '@/app/lib/firebaseAdmin'
import { requireTc } from '@/app/lib/apiGuard'
import { withServiceCall } from '@/app/lib/observe'

const INVITATION_EXPIRY_DAYS = 7

async function POSTHandler(request: NextRequest) {
  const guard = await requireTc(request)
  if (guard.error) return guard.error
  const uid = guard.uid

  try {
    const body = await request.json()
    const firestore = getAdminFirestore()

    // ---------------------------------------------------------------------
    // Resolve / create the partner this invitation belongs to.
    // ---------------------------------------------------------------------
    let partnerRef: FirebaseFirestore.DocumentReference
    let partner: FirebaseFirestore.DocumentData

    if (body.partnerId && typeof body.partnerId === 'string') {
      partnerRef = firestore.collection('businessPartners').doc(body.partnerId)
      const partnerDoc = await partnerRef.get()
      if (!partnerDoc.exists) {
        return NextResponse.json({ success: false, error: 'שותף לא נמצא', errorCode: 'partner-not-found' })
      }
      partner = partnerDoc.data()!
      if (partner.ownerUid !== uid) {
        return NextResponse.json({ success: false, error: 'אין הרשאה', errorCode: 'forbidden' })
      }
    } else {
      const { businessSyncId, businessName, email, displayName, sharePercent } = body
      if (!businessSyncId || typeof businessSyncId !== 'string') {
        return NextResponse.json({ success: false, error: 'מזהה עסק חסר', errorCode: 'invalid-business' })
      }
      if (!businessName || typeof businessName !== 'string') {
        return NextResponse.json({ success: false, error: 'שם עסק חסר', errorCode: 'invalid-business-name' })
      }
      if (!email || typeof email !== 'string') {
        return NextResponse.json({ success: false, error: 'נדרש אימייל', errorCode: 'invalid-email' })
      }
      let normalizedSharePercent: number = 0
      if (sharePercent !== undefined && sharePercent !== null) {
        if (typeof sharePercent !== 'number' || sharePercent < 0 || sharePercent > 100) {
          return NextResponse.json({ success: false, error: 'אחוז שותפות חייב להיות בין 0 ל-100', errorCode: 'invalid-share-percent' })
        }
        normalizedSharePercent = sharePercent
      }
      const normalizedEmail = email.toLowerCase().trim()
      const now = new Date().toISOString()

      // Look up an existing partner first — covers the "user clicked invite
      // twice quickly" case without creating duplicates.
      const existingPartnerSnap = await firestore
        .collection('businessPartners')
        .where('ownerUid', '==', uid)
        .where('businessSyncId', '==', businessSyncId)
        .where('email', '==', normalizedEmail)
        .limit(1)
        .get()
      if (!existingPartnerSnap.empty) {
        partnerRef = existingPartnerSnap.docs[0].ref
        partner = existingPartnerSnap.docs[0].data()
      } else {
        partnerRef = firestore.collection('businessPartners').doc()
        const newPartner = {
          ownerUid: uid,
          businessSyncId,
          businessName,
          email: normalizedEmail,
          displayName: displayName || null,
          sharePercent: normalizedSharePercent,
          createdAt: now,
          updatedAt: now,
        }
        await partnerRef.set(newPartner)
        partner = newPartner
      }
    }

    // ---------------------------------------------------------------------
    // Cancel any older pending invitations for this partner (so the new
    // link is the only live one).
    // ---------------------------------------------------------------------
    const stalePending = await firestore
      .collection('businessShareInvitations')
      .where('partnerId', '==', partnerRef.id)
      .where('status', '==', 'pending')
      .get()
    const batch = firestore.batch()
    for (const d of stalePending.docs) batch.update(d.ref, { status: 'cancelled' })

    // ---------------------------------------------------------------------
    // Create the new invitation.
    // ---------------------------------------------------------------------
    const now = new Date()
    const expiresAt = new Date(now.getTime() + INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000)
    const invitationRef = firestore.collection('businessShareInvitations').doc()
    batch.set(invitationRef, {
      partnerId: partnerRef.id,
      ownerUid: uid,
      businessSyncId: partner.businessSyncId,
      businessName: partner.businessName,
      inviteeEmail: partner.email,
      status: 'pending',
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    })

    await batch.commit()

    // Ensure the owner has the `sharedBusinesses` claim — they need it to
    // talk to shared storage when prepping the shared password.
    const ownerClaims = await getUserClaims(uid)
    const ownerShared = Array.isArray(ownerClaims.sharedBusinesses) ? [...ownerClaims.sharedBusinesses] : []
    if (!ownerShared.includes(partner.businessSyncId)) {
      ownerShared.push(partner.businessSyncId)
      await setUserClaims(uid, { sharedBusinesses: ownerShared })
    }

    console.log(`[BusinessShare] Created invitation ${invitationRef.id} for partner ${partnerRef.id}`)

    return NextResponse.json({ success: true, invitationId: invitationRef.id, partnerId: partnerRef.id })
  } catch (error: any) {
    console.error('[BusinessShare] Invite failed:', error)
    if (error.code === 'auth/id-token-expired') {
      return NextResponse.json({ success: false, error: 'פג תוקף ההתחברות', errorCode: 'token-expired' })
    }
    return NextResponse.json({ success: false, error: 'שגיאת שרת', errorCode: 'unknown' })
  }
}

export const POST = withServiceCall(POSTHandler)
