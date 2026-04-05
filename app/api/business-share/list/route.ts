/**
 * Business Share List API Route
 * Returns all business shares and pending invitations for the current user
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminFirestore } from '@/app/lib/firebaseAdmin'
import { requireAuth } from '@/app/lib/apiGuard'

export async function GET(request: NextRequest) {
  const guard = await requireAuth(request)
  if (guard.error) return guard.error
  const uid = guard.uid

  try {
    const firestore = getAdminFirestore()

    // Query shares owned by user
    const ownedSharesSnapshot = await firestore
      .collection('businessShares')
      .where('ownerUid', '==', uid)
      .where('status', '==', 'active')
      .get()

    const ownedShares = ownedSharesSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }))

    // Query shares received by user
    const receivedSharesSnapshot = await firestore
      .collection('businessShares')
      .where('sharedWithUid', '==', uid)
      .where('status', '==', 'active')
      .get()

    const receivedShares = receivedSharesSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }))

    // Query pending invitations sent by user
    const pendingInvitationsSnapshot = await firestore
      .collection('businessShareInvitations')
      .where('ownerUid', '==', uid)
      .where('status', '==', 'pending')
      .get()

    const pendingInvitations = pendingInvitationsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }))

    return NextResponse.json({
      success: true,
      ownedShares,
      receivedShares,
      pendingInvitations,
    })
  } catch (error: any) {
    console.error('[BusinessShare] List failed:', error)

    if (error.code === 'auth/id-token-expired') {
      return NextResponse.json({ success: false, error: 'פג תוקף ההתחברות', errorCode: 'token-expired' })
    }

    return NextResponse.json({ success: false, error: 'שגיאת שרת', errorCode: 'unknown' })
  }
}
