/**
 * Remove a partner entirely.
 *
 * Cascade:
 *   - Cancel any pending invitations addressed to this partner.
 *   - Delete any access grants tied to this partner (revoke claims for those uids).
 *   - Delete the partner doc.
 *
 * The partner's share % is returned to the owner (deleting the partner row
 * removes their slice of the total).
 *
 * Body: { partnerId }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminFirestore, getUserClaims, setUserClaims } from '@/app/lib/firebaseAdmin'
import { requireTc } from '@/app/lib/apiGuard'
import { withServiceCall } from '@/app/lib/observe'

async function POSTHandler(request: NextRequest) {
  const guard = await requireTc(request)
  if (guard.error) return guard.error
  const uid = guard.uid

  try {
    const body = await request.json()
    const { partnerId } = body
    if (!partnerId || typeof partnerId !== 'string') {
      return NextResponse.json({ success: false, error: 'מזהה שותף חסר', errorCode: 'invalid-partner' })
    }

    const firestore = getAdminFirestore()
    const partnerRef = firestore.collection('businessPartners').doc(partnerId)
    const partnerDoc = await partnerRef.get()
    if (!partnerDoc.exists) {
      return NextResponse.json({ success: false, error: 'שותף לא נמצא', errorCode: 'partner-not-found' })
    }
    const partner = partnerDoc.data()!
    if (partner.ownerUid !== uid) {
      return NextResponse.json({ success: false, error: 'אין הרשאה', errorCode: 'forbidden' })
    }

    // Cancel pending invitations for this partner.
    const pendingSnap = await firestore
      .collection('businessShareInvitations')
      .where('partnerId', '==', partnerId)
      .where('status', '==', 'pending')
      .get()
    const batch = firestore.batch()
    for (const d of pendingSnap.docs) batch.update(d.ref, { status: 'cancelled' })

    // Delete access grants tied to this partner. Collect uids so we can
    // refresh their `sharedBusinesses` claims.
    const grantsSnap = await firestore
      .collection('businessAccessGrants')
      .where('partnerId', '==', partnerId)
      .get()
    const affectedUids = new Set<string>()
    for (const d of grantsSnap.docs) {
      batch.delete(d.ref)
      const u = d.data().uid
      if (u) affectedUids.add(u as string)
    }

    // Delete the partner doc itself.
    batch.delete(partnerRef)

    await batch.commit()

    // Refresh each affected user's `sharedBusinesses` claim: keep the
    // businessSyncId only if they still have ANOTHER grant for it.
    for (const u of affectedUids) {
      await recomputeClaim(firestore, u as string)
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[BusinessShare] Remove-partner failed:', error)
    if (error.code === 'auth/id-token-expired') {
      return NextResponse.json({ success: false, error: 'פג תוקף ההתחברות', errorCode: 'token-expired' })
    }
    return NextResponse.json({ success: false, error: 'שגיאת שרת', errorCode: 'unknown' })
  }
}

async function recomputeClaim(firestore: FirebaseFirestore.Firestore, userUid: string): Promise<void> {
  const remaining = await firestore
    .collection('businessAccessGrants')
    .where('uid', '==', userUid)
    .get()
  const newShared = Array.from(new Set(remaining.docs.map(d => d.data().businessSyncId as string)))

  const claims = await getUserClaims(userUid)
  const current = Array.isArray(claims.sharedBusinesses) ? claims.sharedBusinesses : []
  // Only write if changed — avoids unnecessary token-revoke churn.
  if (current.length !== newShared.length || current.some((v: string) => !newShared.includes(v))) {
    await setUserClaims(userUid, { sharedBusinesses: newShared })
  }
}

export const POST = withServiceCall(POSTHandler)
