/**
 * Revoke a single access grant. The partner record stays; only their
 * current Firebase-uid binding is removed. Used when:
 *   - The partner's account is compromised and we want to revoke just that uid.
 *   - The partner is being moved to a different account (revoke old grant,
 *     then send a new invite which they accept on the new account).
 *
 * To remove the partner entirely, use /partner/remove instead.
 *
 * Body: { grantId }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminFirestore, getUserClaims, setUserClaims } from '@/app/lib/firebaseAdmin'
import { requireTc } from '@/app/lib/apiGuard'

export async function POST(request: NextRequest) {
  const guard = await requireTc(request)
  if (guard.error) return guard.error
  const uid = guard.uid

  try {
    const body = await request.json()
    const { grantId } = body
    if (!grantId || typeof grantId !== 'string') {
      return NextResponse.json({ success: false, error: 'מזהה גישה חסר', errorCode: 'invalid-grant' })
    }

    const firestore = getAdminFirestore()
    const grantRef = firestore.collection('businessAccessGrants').doc(grantId)
    const grantDoc = await grantRef.get()
    if (!grantDoc.exists) {
      return NextResponse.json({ success: false, error: 'גישה לא נמצאה', errorCode: 'grant-not-found' })
    }
    const grant = grantDoc.data()!
    if (grant.ownerUid !== uid) {
      return NextResponse.json({ success: false, error: 'אין הרשאה', errorCode: 'forbidden' })
    }

    await grantRef.delete()

    // Recompute the granted user's claim.
    const remaining = await firestore
      .collection('businessAccessGrants')
      .where('uid', '==', grant.uid)
      .get()
    const newShared = Array.from(new Set(remaining.docs.map(d => d.data().businessSyncId as string)))

    const claims = await getUserClaims(grant.uid)
    const current = Array.isArray(claims.sharedBusinesses) ? claims.sharedBusinesses : []
    if (current.length !== newShared.length || current.some((v: string) => !newShared.includes(v))) {
      await setUserClaims(grant.uid, { sharedBusinesses: newShared })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[BusinessShare] Access-revoke failed:', error)
    if (error.code === 'auth/id-token-expired') {
      return NextResponse.json({ success: false, error: 'פג תוקף ההתחברות', errorCode: 'token-expired' })
    }
    return NextResponse.json({ success: false, error: 'שגיאת שרת', errorCode: 'unknown' })
  }
}
