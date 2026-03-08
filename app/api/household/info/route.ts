/**
 * Household Info API Route
 * Returns household information for the current user
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyIdToken, getAdminFirestore, getAdminAuth, isAdminConfigured } from '@/app/lib/firebaseAdmin'

export async function POST(request: NextRequest) {
  if (!isAdminConfigured()) {
    return NextResponse.json({ success: false, error: 'שרת לא מוגדר', errorCode: 'not-configured' })
  }

  // Verify authentication
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ success: false, error: 'לא מחובר', errorCode: 'not-authenticated' })
  }

  const idToken = authHeader.substring(7)

  try {
    const decodedToken = await verifyIdToken(idToken)
    const uid = decodedToken.uid
    const householdId = decodedToken.householdId as string | undefined
    const householdRole = decodedToken.householdRole as string | undefined

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

    // Get member emails and display names for display
    const memberEmails: Record<string, string> = {}
    const memberNames: Record<string, string> = {}
    for (const memberId of householdData.members || []) {
      try {
        const memberUser = await auth.getUser(memberId)
        memberEmails[memberId] = memberUser.email || 'לא ידוע'
        memberNames[memberId] = memberUser.displayName || ''
      } catch {
        memberEmails[memberId] = 'לא ידוע'
      }
    }

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
