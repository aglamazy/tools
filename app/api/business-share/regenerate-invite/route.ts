/**
 * Business Share Regenerate-Invite API Route
 * Owner-only: create a fresh pending invitation for an existing active share,
 * so the partner can re-bootstrap on a new device (re-enter the shared password,
 * recreate the local Business row). The existing share row stays put — the
 * accept route is idempotent on (ownerUid, businessSyncId, sharedWithUid).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminFirestore } from '@/app/lib/firebaseAdmin'
import { requireTc } from '@/app/lib/apiGuard'

const INVITATION_EXPIRY_DAYS = 7

export async function POST(request: NextRequest) {
  const guard = await requireTc(request)
  if (guard.error) return guard.error
  const uid = guard.uid

  try {
    const body = await request.json()
    const { shareId } = body

    if (!shareId || typeof shareId !== 'string') {
      return NextResponse.json({ success: false, error: 'מזהה שיתוף חסר', errorCode: 'invalid-share' })
    }

    const firestore = getAdminFirestore()
    const shareRef = firestore.collection('businessShares').doc(shareId)
    const shareDoc = await shareRef.get()

    if (!shareDoc.exists) {
      return NextResponse.json({ success: false, error: 'שיתוף לא נמצא', errorCode: 'share-not-found' })
    }

    const share = shareDoc.data()!

    if (share.ownerUid !== uid) {
      return NextResponse.json({ success: false, error: 'אין הרשאה', errorCode: 'not-owner' })
    }

    if (share.status !== 'active') {
      return NextResponse.json({ success: false, error: 'שיתוף לא פעיל', errorCode: 'share-not-active' })
    }

    // Cancel any leftover pending invitations for the same (owner, business, email)
    // so we don't accumulate dead links.
    const stalePending = await firestore
      .collection('businessShareInvitations')
      .where('ownerUid', '==', uid)
      .where('businessSyncId', '==', share.businessSyncId)
      .where('inviteeEmail', '==', share.sharedWithEmail)
      .where('status', '==', 'pending')
      .get()

    const batch = firestore.batch()
    for (const doc of stalePending.docs) {
      batch.update(doc.ref, { status: 'cancelled' })
    }

    const now = new Date()
    const expiresAt = new Date(now.getTime() + INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000)
    const invitationRef = firestore.collection('businessShareInvitations').doc()
    batch.set(invitationRef, {
      ownerUid: uid,
      businessSyncId: share.businessSyncId,
      businessName: share.businessName,
      inviteeEmail: share.sharedWithEmail,
      status: 'pending',
      ...(typeof share.sharePercent === 'number' ? { sharePercent: share.sharePercent } : {}),
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      regeneratedFromShareId: shareId,
    })

    await batch.commit()

    console.log(`[BusinessShare] Regenerated invitation ${invitationRef.id} for share ${shareId}`)

    return NextResponse.json({ success: true, invitationId: invitationRef.id })
  } catch (error: any) {
    console.error('[BusinessShare] Regenerate-invite failed:', error)
    if (error.code === 'auth/id-token-expired') {
      return NextResponse.json({ success: false, error: 'פג תוקף ההתחברות', errorCode: 'token-expired' })
    }
    return NextResponse.json({ success: false, error: 'שגיאת שרת', errorCode: 'unknown' })
  }
}
