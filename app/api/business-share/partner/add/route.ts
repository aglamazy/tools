/**
 * Add a business partner. Creates a BusinessPartner row (durable identity
 * + share %). Does NOT auto-send an invitation — the UI calls /invite
 * separately when the owner wants to grant the partner access.
 *
 * Body: { businessSyncId, businessName, email, displayName?, sharePercent }
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
    const { businessSyncId, businessName, email, displayName, sharePercent } = body

    if (!businessSyncId || typeof businessSyncId !== 'string') {
      return NextResponse.json({ success: false, error: 'מזהה עסק חסר', errorCode: 'invalid-business' })
    }
    if (!businessName || typeof businessName !== 'string') {
      return NextResponse.json({ success: false, error: 'שם עסק חסר', errorCode: 'invalid-business-name' })
    }
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ success: false, error: 'נדרש אימייל', errorCode: 'invalid-email' })
    }
    if (typeof sharePercent !== 'number' || sharePercent < 0 || sharePercent > 100) {
      return NextResponse.json({ success: false, error: 'אחוז שותפות חייב להיות בין 0 ל-100', errorCode: 'invalid-share-percent' })
    }

    const normalizedEmail = email.toLowerCase().trim()
    const firestore = getAdminFirestore()

    // No duplicate partners for (owner, business, email).
    const existing = await firestore
      .collection('businessPartners')
      .where('ownerUid', '==', uid)
      .where('businessSyncId', '==', businessSyncId)
      .where('email', '==', normalizedEmail)
      .limit(1)
      .get()
    if (!existing.empty) {
      return NextResponse.json({
        success: false,
        error: 'כבר קיים שותף עם אימייל זה',
        errorCode: 'partner-exists',
        partnerId: existing.docs[0].id,
      })
    }

    const now = new Date().toISOString()
    const partnerRef = firestore.collection('businessPartners').doc()
    await partnerRef.set({
      ownerUid: uid,
      businessSyncId,
      businessName,
      email: normalizedEmail,
      displayName: displayName || null,
      sharePercent,
      createdAt: now,
      updatedAt: now,
    })

    // Ensure the owner has `sharedBusinesses` claim so shared-storage paths work
    // once we issue the first invitation. Idempotent.
    const ownerClaims = await getUserClaims(uid)
    const ownerShared = Array.isArray(ownerClaims.sharedBusinesses) ? [...ownerClaims.sharedBusinesses] : []
    if (!ownerShared.includes(businessSyncId)) {
      ownerShared.push(businessSyncId)
      await setUserClaims(uid, { sharedBusinesses: ownerShared })
    }

    return NextResponse.json({ success: true, partnerId: partnerRef.id })
  } catch (error: any) {
    console.error('[BusinessShare] Add-partner failed:', error)
    if (error.code === 'auth/id-token-expired') {
      return NextResponse.json({ success: false, error: 'פג תוקף ההתחברות', errorCode: 'token-expired' })
    }
    return NextResponse.json({ success: false, error: 'שגיאת שרת', errorCode: 'unknown' })
  }
}
