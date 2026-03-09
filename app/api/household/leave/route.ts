/**
 * Leave Household API Route
 * Removes user from household (or dissolves if owner leaves)
 */

import { NextRequest, NextResponse } from 'next/server'
import { setUserClaims, getAdminFirestore } from '@/app/lib/firebaseAdmin'
import { FieldValue } from 'firebase-admin/firestore'
import { requireTc } from '@/app/lib/apiGuard'

export async function POST(request: NextRequest) {
  const guard = await requireTc(request)
  if (guard.error) return guard.error
  const uid = guard.uid
  const householdId = guard.claims.householdId
  const householdRole = guard.claims.householdRole

  try {
    if (!householdId) {
      return NextResponse.json({
        success: false,
        error: 'לא חבר במשק בית',
        errorCode: 'not-in-household',
      })
    }

    const firestore = getAdminFirestore()
    const householdRef = firestore.collection('households').doc(householdId)
    const householdDoc = await householdRef.get()

    if (!householdDoc.exists) {
      // Household doesn't exist, just clear user's claims
      await clearUserHouseholdData(firestore, uid)
      return NextResponse.json({ success: true })
    }

    const householdData = householdDoc.data()!
    const members = householdData.members || []
    const isOwner = householdRole === 'owner' || householdData.ownerId === uid

    if (isOwner) {
      // Owner leaving: dissolve household
      // First, clear claims for all other members
      const otherMembers = members.filter((m: string) => m !== uid)
      for (const memberId of otherMembers) {
        await clearUserHouseholdData(firestore, memberId)
      }

      // Cancel all pending invitations
      const pendingInvites = await firestore
        .collection('invitations')
        .where('householdId', '==', householdId)
        .where('status', '==', 'pending')
        .get()

      const batch = firestore.batch()
      pendingInvites.docs.forEach((doc) => {
        batch.update(doc.ref, { status: 'cancelled' })
      })
      await batch.commit()

      // Delete household
      await householdRef.delete()

      console.log(`[Household] Owner ${uid} dissolved household ${householdId}`)
    } else {
      // Member leaving: just remove from members list
      await householdRef.update({
        members: FieldValue.arrayRemove(uid),
      })

      console.log(`[Household] Member ${uid} left household ${householdId}`)
    }

    // Clear user's household data
    await clearUserHouseholdData(firestore, uid)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[Household] Leave failed:', error)

    if (error.code === 'auth/id-token-expired') {
      return NextResponse.json({ success: false, error: 'פג תוקף ההתחברות', errorCode: 'token-expired' })
    }

    return NextResponse.json({ success: false, error: 'שגיאת שרת', errorCode: 'unknown' })
  }
}

async function clearUserHouseholdData(
  firestore: FirebaseFirestore.Firestore,
  uid: string
): Promise<void> {
  // Clear custom claims
  await setUserClaims(uid, {
    householdId: null,
    householdRole: null,
  })

  // Update user document
  const userRef = firestore.collection('users').doc(uid)
  await userRef.update({
    householdId: FieldValue.delete(),
    householdRole: FieldValue.delete(),
  })
}
