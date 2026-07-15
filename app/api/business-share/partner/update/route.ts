/**
 * Update an existing partner — share percent and/or display name.
 *
 * Body: { partnerId, sharePercent?, displayName? }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminFirestore } from '@/app/lib/firebaseAdmin'
import { requireTc } from '@/app/lib/apiGuard'
import { withServiceCall } from '@/app/lib/observe'

async function POSTHandler(request: NextRequest) {
  const guard = await requireTc(request)
  if (guard.error) return guard.error
  const uid = guard.uid

  try {
    const body = await request.json()
    const { partnerId, sharePercent, displayName } = body

    if (!partnerId || typeof partnerId !== 'string') {
      return NextResponse.json({ success: false, error: 'מזהה שותף חסר', errorCode: 'invalid-partner' })
    }

    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() }

    if (sharePercent !== undefined) {
      if (typeof sharePercent !== 'number' || sharePercent < 0 || sharePercent > 100) {
        return NextResponse.json({ success: false, error: 'אחוז שותפות חייב להיות בין 0 ל-100', errorCode: 'invalid-share-percent' })
      }
      patch.sharePercent = sharePercent
    }

    if (displayName !== undefined) {
      if (displayName !== null && typeof displayName !== 'string') {
        return NextResponse.json({ success: false, error: 'שם תצוגה לא תקין', errorCode: 'invalid-display-name' })
      }
      patch.displayName = displayName || null
    }

    // Need at least one field to update.
    if (Object.keys(patch).length === 1) {
      return NextResponse.json({ success: false, error: 'אין שדות לעדכון', errorCode: 'no-fields' })
    }

    const firestore = getAdminFirestore()
    const ref = firestore.collection('businessPartners').doc(partnerId)
    const doc = await ref.get()
    if (!doc.exists) {
      return NextResponse.json({ success: false, error: 'שותף לא נמצא', errorCode: 'partner-not-found' })
    }
    if (doc.data()!.ownerUid !== uid) {
      return NextResponse.json({ success: false, error: 'אין הרשאה', errorCode: 'forbidden' })
    }

    await ref.update(patch)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[BusinessShare] Update-partner failed:', error)
    if (error.code === 'auth/id-token-expired') {
      return NextResponse.json({ success: false, error: 'פג תוקף ההתחברות', errorCode: 'token-expired' })
    }
    return NextResponse.json({ success: false, error: 'שגיאת שרת', errorCode: 'unknown' })
  }
}

export const POST = withServiceCall(POSTHandler)
