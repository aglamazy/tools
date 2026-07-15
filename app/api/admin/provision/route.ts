/**
 * Admin: Pre-provision Account API Route
 * Creates a provision record for a user who hasn't signed up yet
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminFirestore } from '@/app/lib/firebaseAdmin'
import { requireTier } from '@/app/lib/apiGuard'
import { UserTier } from '@/app/stores/userTierStore'
import { withServiceCall } from '@/app/lib/observe'

const VALID_TIERS = Object.values(UserTier)

async function POSTHandler(request: NextRequest) {
  const guard = await requireTier(request, 'owner')
  if (guard.error) return guard.error

  try {
    const firestore = getAdminFirestore()

    const body = await request.json()
    const { email, tier, isLifetime } = body as { email: string; tier: UserTier; isLifetime: boolean }

    if (!email || !tier) {
      return NextResponse.json({ success: false, error: 'חסרים פרטים', errorCode: 'invalid-body' })
    }

    if (!VALID_TIERS.includes(tier)) {
      return NextResponse.json({ success: false, error: 'דרגה לא חוקית', errorCode: 'invalid-tier' })
    }

    const normalizedEmail = email.toLowerCase().trim()

    await firestore.collection('provisions').doc(normalizedEmail).set({
      email: normalizedEmail,
      tier,
      isLifetime: isLifetime === true,
      createdAt: new Date(),
      createdBy: guard.uid,
      claimedAt: null,
      claimedBy: null,
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[Admin] Provision failed:', error)

    if (error.code === 'auth/id-token-expired') {
      return NextResponse.json({ success: false, error: 'פג תוקף ההתחברות', errorCode: 'token-expired' })
    }

    return NextResponse.json({ success: false, error: 'שגיאת שרת', errorCode: 'unknown' })
  }
}

export const POST = withServiceCall(POSTHandler)
