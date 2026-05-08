/**
 * Business Share List API Route
 * Returns all business shares and pending invitations for the current user
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminFirestore, getAdminAuth } from '@/app/lib/firebaseAdmin'
import { requireAuth } from '@/app/lib/apiGuard'

export async function GET(request: NextRequest) {
  const guard = await requireAuth(request)
  if (guard.error) return guard.error
  const uid = guard.uid

  try {
    const firestore = getAdminFirestore()
    const auth = getAdminAuth()

    // Query shares owned by user
    const ownedSharesSnapshot = await firestore
      .collection('businessShares')
      .where('ownerUid', '==', uid)
      .where('status', '==', 'active')
      .get()

    const ownedShares = ownedSharesSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as any[]

    // Query shares received by user
    const receivedSharesSnapshot = await firestore
      .collection('businessShares')
      .where('sharedWithUid', '==', uid)
      .where('status', '==', 'active')
      .get()

    const receivedShares = receivedSharesSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as any[]

    // Enrich each share with sharedWithDisplayName from Firebase Auth so the
    // UI can render the user's name instead of email. One auth.getUser call
    // per unique uid; failures fall through silently (UI falls back to email).
    const uniqueUids = Array.from(new Set([
      ...ownedShares.map(s => s.sharedWithUid),
      ...receivedShares.map(s => s.sharedWithUid),
    ].filter(Boolean)))
    const displayNameByUid: Record<string, string> = {}
    await Promise.all(uniqueUids.map(async (u) => {
      try {
        const userRecord = await auth.getUser(u)
        if (userRecord.displayName) displayNameByUid[u] = userRecord.displayName
      } catch { /* user not found / disabled — fall back to email */ }
    }))
    for (const s of ownedShares) {
      const dn = displayNameByUid[s.sharedWithUid]
      if (dn) s.sharedWithDisplayName = dn
    }
    for (const s of receivedShares) {
      const dn = displayNameByUid[s.sharedWithUid]
      if (dn) s.sharedWithDisplayName = dn
    }

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
