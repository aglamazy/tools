/**
 * Business Share Revoke API Route
 * Revokes an active business share
 */

import { NextRequest, NextResponse } from 'next/server'
import { setUserClaims, getAdminFirestore, getUserClaims } from '@/app/lib/firebaseAdmin'
import { requireTc } from '@/app/lib/apiGuard'

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

    // Get share doc
    const shareRef = firestore.collection('businessShares').doc(shareId)
    const shareDoc = await shareRef.get()

    if (!shareDoc.exists) {
      return NextResponse.json({
        success: false,
        error: 'שיתוף לא נמצא',
        errorCode: 'share-not-found',
      })
    }

    const share = shareDoc.data()!

    // Verify share is active
    if (share.status !== 'active') {
      return NextResponse.json({
        success: false,
        error: 'השיתוף כבר בוטל',
        errorCode: 'share-not-active',
      })
    }

    // Verify caller is the owner
    if (share.ownerUid !== uid) {
      return NextResponse.json({
        success: false,
        error: 'רק בעל העסק יכול לבטל שיתוף',
        errorCode: 'not-owner',
      })
    }

    // Update share status to revoked
    await shareRef.update({ status: 'revoked' })

    // Remove businessSyncId from RECIPIENT's sharedBusinesses claim
    const recipientClaims = await getUserClaims(share.sharedWithUid)
    const recipientShared = Array.isArray(recipientClaims.sharedBusinesses) ? [...recipientClaims.sharedBusinesses] : []
    const filteredRecipient = recipientShared.filter((id: string) => id !== share.businessSyncId)
    await setUserClaims(share.sharedWithUid, { sharedBusinesses: filteredRecipient })

    // Check if owner still has other active shares for this businessSyncId
    const otherOwnerShares = await firestore
      .collection('businessShares')
      .where('ownerUid', '==', uid)
      .where('businessSyncId', '==', share.businessSyncId)
      .where('status', '==', 'active')
      .get()

    // The current share was just set to 'revoked', so if no other active shares remain, remove from owner too
    if (otherOwnerShares.empty) {
      const ownerClaims = await getUserClaims(uid)
      const ownerShared = Array.isArray(ownerClaims.sharedBusinesses) ? [...ownerClaims.sharedBusinesses] : []
      const filteredOwner = ownerShared.filter((id: string) => id !== share.businessSyncId)
      await setUserClaims(uid, { sharedBusinesses: filteredOwner })
    }

    console.log(`[BusinessShare] Owner ${uid} revoked share ${shareId} for business ${share.businessSyncId}`)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[BusinessShare] Revoke failed:', error)

    if (error.code === 'auth/id-token-expired') {
      return NextResponse.json({ success: false, error: 'פג תוקף ההתחברות', errorCode: 'token-expired' })
    }

    return NextResponse.json({ success: false, error: 'שגיאת שרת', errorCode: 'unknown' })
  }
}
