/**
 * Admin: List Accounts API Route
 * Returns all accounts (households + solo users) with members and tiers
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyIdToken, getAdminAuth, getAdminFirestore, isAdminConfigured } from '@/app/lib/firebaseAdmin'
import { UserTier } from '@/app/stores/userTierStore'

export async function GET(request: NextRequest) {
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
    const callerUid = decodedToken.uid

    // Verify caller is OWNER tier
    const firestore = getAdminFirestore()
    const callerDoc = await firestore.collection('users').doc(callerUid).get()
    const callerData = callerDoc.data()
    const callerTier = (callerData?.tier as UserTier) || UserTier.FREE
    if (callerTier !== UserTier.OWNER) {
      return NextResponse.json({ success: false, error: 'אין הרשאה', errorCode: 'forbidden' })
    }

    // List all Firebase Auth users
    const auth = getAdminAuth()
    const allUsers: { uid: string; email?: string; displayName?: string; photoURL?: string }[] = []
    let nextPageToken: string | undefined
    do {
      const listResult = await auth.listUsers(1000, nextPageToken)
      for (const userRecord of listResult.users) {
        allUsers.push({
          uid: userRecord.uid,
          email: userRecord.email,
          displayName: userRecord.displayName,
          photoURL: userRecord.photoURL,
        })
      }
      nextPageToken = listResult.pageToken
    } while (nextPageToken)

    // Fetch user docs from Firestore
    const userDocs = new Map<string, { tier?: UserTier; householdId?: string; householdRole?: string }>()
    for (const u of allUsers) {
      const doc = await firestore.collection('users').doc(u.uid).get()
      if (doc.exists) {
        const data = doc.data()!
        userDocs.set(u.uid, {
          tier: data.tier as UserTier,
          householdId: data.householdId,
          householdRole: data.householdRole,
        })
      } else {
        userDocs.set(u.uid, {})
      }
    }

    // Group into accounts
    type Member = { uid: string; email?: string; displayName?: string; photoURL?: string; role: string }
    type Account = { id: string; name: string; tier: UserTier; members: Member[] }

    const householdAccounts = new Map<string, Account>()
    const soloAccounts: Account[] = []

    for (const u of allUsers) {
      const userData = userDocs.get(u.uid) || {}
      const member: Member = {
        uid: u.uid,
        email: u.email,
        displayName: u.displayName,
        photoURL: u.photoURL,
        role: userData.householdRole || 'owner',
      }

      if (userData.householdId) {
        // Grouped under household
        const existing = householdAccounts.get(userData.householdId)
        if (existing) {
          existing.members.push(member)
          // Household tier = owner member's tier
          if (userData.householdRole === 'owner') {
            existing.tier = userData.tier || UserTier.FREE
            existing.name = u.displayName || u.email || u.uid
          }
        } else {
          householdAccounts.set(userData.householdId, {
            id: userData.householdId,
            name: u.displayName || u.email || u.uid,
            tier: userData.tier || UserTier.FREE,
            members: [member],
          })
        }
      } else {
        // Solo account
        soloAccounts.push({
          id: u.uid,
          name: u.displayName || u.email || u.uid,
          tier: userData.tier || UserTier.FREE,
          members: [member],
        })
      }
    }

    const accounts: Account[] = [...householdAccounts.values(), ...soloAccounts]

    return NextResponse.json({ success: true, accounts })
  } catch (error: any) {
    console.error('[Admin] List accounts failed:', error)

    if (error.code === 'auth/id-token-expired') {
      return NextResponse.json({ success: false, error: 'פג תוקף ההתחברות', errorCode: 'token-expired' })
    }

    return NextResponse.json({ success: false, error: 'שגיאת שרת', errorCode: 'unknown' })
  }
}
