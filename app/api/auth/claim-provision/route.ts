// PUBLIC ROUTE — authentication bootstrapping (claims provisioned tier on first login)
/**
 * Claim Provision API Route
 * Called after Google sign-in to apply any pre-provisioned tier
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyIdToken, getAdminFirestore, isAdminConfigured, setUserClaims } from '@/app/lib/firebaseAdmin'
import { withServiceCall } from '@/app/lib/observe'

async function POSTHandler(request: NextRequest) {
  if (!isAdminConfigured()) {
    return NextResponse.json({ success: false, error: 'שרת לא מוגדר', errorCode: 'not-configured' })
  }

  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ success: false, error: 'לא מחובר', errorCode: 'not-authenticated' })
  }

  const idToken = authHeader.substring(7)

  try {
    const decodedToken = await verifyIdToken(idToken)
    const uid = decodedToken.uid
    const email = decodedToken.email

    if (!email) {
      return NextResponse.json({ success: true, claimed: false })
    }

    const normalizedEmail = email.toLowerCase().trim()
    const firestore = getAdminFirestore()
    const provisionRef = firestore.collection('provisions').doc(normalizedEmail)
    const provisionDoc = await provisionRef.get()

    if (!provisionDoc.exists) {
      return NextResponse.json({ success: true, claimed: false })
    }

    const provision = provisionDoc.data()!

    // Already claimed — idempotent
    if (provision.claimedAt !== null) {
      return NextResponse.json({ success: true, claimed: false })
    }

    const { tier, isLifetime } = provision

    // Batch: apply tier to user doc + mark provision as claimed
    const batch = firestore.batch()
    batch.set(
      firestore.collection('users').doc(uid),
      { tier, isLifetime: isLifetime === true },
      { merge: true }
    )
    batch.update(provisionRef, {
      claimedAt: new Date(),
      claimedBy: uid,
    })
    await batch.commit()

    // Sync tier to custom claims so the proxy can enforce it
    await setUserClaims(uid, { tier })

    return NextResponse.json({ success: true, claimed: true, tier, isLifetime })
  } catch (error: any) {
    console.error('[Auth] Claim provision failed:', error)

    if (error.code === 'auth/id-token-expired') {
      return NextResponse.json({ success: false, error: 'פג תוקף ההתחברות', errorCode: 'token-expired' })
    }

    return NextResponse.json({ success: false, error: 'שגיאת שרת', errorCode: 'unknown' })
  }
}

export const POST = withServiceCall(POSTHandler)
