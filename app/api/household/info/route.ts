/**
 * Household Info API Route
 * Returns household information for the current user
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminFirestore, getAdminAuth } from '@/app/lib/firebaseAdmin'
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
        success: true,
        household: null,
        role: null,
        pendingInvitations: [],
      })
    }

    const firestore = getAdminFirestore()
    const auth = getAdminAuth()

    // Get household
    const householdDoc = await firestore.collection('households').doc(householdId).get()

    if (!householdDoc.exists) {
      return NextResponse.json({
        success: true,
        household: null,
        role: null,
        pendingInvitations: [],
      })
    }

    const householdData = householdDoc.data()!

    // Get member emails and display names for display — fetch in parallel so the
    // round-trip is one auth-lookup latency, not N. Failures fall through to 'לא ידוע'.
    const memberEmails: Record<string, string> = {}
    const memberNames: Record<string, string> = {}
    await Promise.all((householdData.members || []).map(async (memberId: string) => {
      try {
        const memberUser = await auth.getUser(memberId)
        memberEmails[memberId] = memberUser.email || 'לא ידוע'
        memberNames[memberId] = memberUser.displayName || ''
      } catch {
        memberEmails[memberId] = 'לא ידוע'
      }
    }))

    // Get pending invitations if owner
    let pendingInvitations: any[] = []
    if (householdRole === 'owner') {
      const invitationsSnapshot = await firestore
        .collection('invitations')
        .where('householdId', '==', householdId)
        .where('status', '==', 'pending')
        .get()

      pendingInvitations = invitationsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
    }

    return NextResponse.json({
      success: true,
      household: {
        id: householdDoc.id,
        ownerId: householdData.ownerId,
        members: householdData.members,
        memberEmails,
        memberNames,
        createdAt: householdData.createdAt,
      },
      role: householdRole,
      pendingInvitations,
    })
  } catch (error: any) {
    console.error('[Household] Info failed:', error)

    if (error.code === 'auth/id-token-expired') {
      return NextResponse.json({ success: false, error: 'פג תוקף ההתחברות', errorCode: 'token-expired' })
    }

    return NextResponse.json({ success: false, error: 'שגיאת שרת', errorCode: 'unknown' })
  }
}
