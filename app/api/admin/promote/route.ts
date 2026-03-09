/**
 * Admin: Promote/Demote Account API Route
 * Changes tier for an account (all members in household, or solo user)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminFirestore, setUserClaims } from '@/app/lib/firebaseAdmin'
import { requireTier } from '@/app/lib/apiGuard'
import { UserTier } from '@/app/stores/userTierStore'

const VALID_TIERS = Object.values(UserTier)

export async function POST(request: NextRequest) {
  const guard = await requireTier(request, 'owner')
  if (guard.error) return guard.error

  try {
    const firestore = getAdminFirestore()

    // Parse and validate body
    const body = await request.json()
    const { accountId, tier, isLifetime } = body as { accountId: string; tier: UserTier; isLifetime?: boolean }

    if (!accountId || !tier) {
      return NextResponse.json({ success: false, error: 'חסרים פרטים', errorCode: 'invalid-body' })
    }

    if (!VALID_TIERS.includes(tier)) {
      return NextResponse.json({ success: false, error: 'דרגה לא חוקית', errorCode: 'invalid-tier' })
    }

    const updatePayload: Record<string, unknown> = { tier }
    if (typeof isLifetime === 'boolean') updatePayload.isLifetime = isLifetime

    // Check if accountId is a household
    const householdDoc = await firestore.collection('households').doc(accountId).get()

    if (householdDoc.exists) {
      // Household: update tier on all members
      const householdData = householdDoc.data()!
      const memberUids: string[] = householdData.members || []

      const batch = firestore.batch()
      for (const uid of memberUids) {
        batch.update(firestore.collection('users').doc(uid), updatePayload)
      }
      await batch.commit()

      // Sync tier to custom claims for all members
      for (const uid of memberUids) {
        await setUserClaims(uid, { tier })
      }
    } else {
      // Solo user: update that user's doc
      const userDoc = await firestore.collection('users').doc(accountId).get()
      if (!userDoc.exists) {
        // Create user doc if it doesn't exist
        await firestore.collection('users').doc(accountId).set(updatePayload, { merge: true })
      } else {
        await firestore.collection('users').doc(accountId).update(updatePayload)
      }

      // Sync tier to custom claims
      await setUserClaims(accountId, { tier })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[Admin] Promote failed:', error)

    if (error.code === 'auth/id-token-expired') {
      return NextResponse.json({ success: false, error: 'פג תוקף ההתחברות', errorCode: 'token-expired' })
    }

    return NextResponse.json({ success: false, error: 'שגיאת שרת', errorCode: 'unknown' })
  }
}
