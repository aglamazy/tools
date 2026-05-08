/**
 * Business Share Invite API Route
 * Creates an invitation to share a business with another user
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminFirestore, getUserClaims, setUserClaims } from '@/app/lib/firebaseAdmin'
import { requireTc } from '@/app/lib/apiGuard'

const INVITATION_EXPIRY_DAYS = 7

export async function POST(request: NextRequest) {
  const guard = await requireTc(request)
  if (guard.error) return guard.error
  const uid = guard.uid

  try {
    const body = await request.json()
    const { businessSyncId, businessName, email, sharePercent } = body

    if (!businessSyncId || typeof businessSyncId !== 'string') {
      return NextResponse.json({ success: false, error: 'מזהה עסק חסר', errorCode: 'invalid-business' })
    }

    if (!businessName || typeof businessName !== 'string') {
      return NextResponse.json({ success: false, error: 'שם עסק חסר', errorCode: 'invalid-business-name' })
    }

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ success: false, error: 'נדרש אימייל', errorCode: 'invalid-email' })
    }

    let normalizedSharePercent: number | undefined
    if (sharePercent !== undefined && sharePercent !== null) {
      if (typeof sharePercent !== 'number' || sharePercent < 0 || sharePercent > 100) {
        return NextResponse.json({ success: false, error: 'אחוז שותפות חייב להיות בין 0 ל-100', errorCode: 'invalid-share-percent' })
      }
      normalizedSharePercent = sharePercent
    }

    const normalizedEmail = email.toLowerCase().trim()

    const firestore = getAdminFirestore()

    // Check that no active share already exists for this business + email
    const existingShares = await firestore
      .collection('businessShares')
      .where('ownerUid', '==', uid)
      .where('businessSyncId', '==', businessSyncId)
      .where('sharedWithEmail', '==', normalizedEmail)
      .where('status', '==', 'active')
      .get()

    if (!existingShares.empty) {
      return NextResponse.json({
        success: false,
        error: 'העסק כבר משותף עם אימייל זה',
        errorCode: 'share-exists',
      })
    }

    // Check no pending invitation exists
    const existingInvites = await firestore
      .collection('businessShareInvitations')
      .where('ownerUid', '==', uid)
      .where('businessSyncId', '==', businessSyncId)
      .where('inviteeEmail', '==', normalizedEmail)
      .where('status', '==', 'pending')
      .get()

    if (!existingInvites.empty) {
      return NextResponse.json({
        success: false,
        error: 'כבר קיימת הזמנה פעילה לאימייל זה',
        errorCode: 'invitation-exists',
      })
    }

    // Create invitation
    const now = new Date()
    const expiresAt = new Date(now.getTime() + INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000)

    const invitationRef = firestore.collection('businessShareInvitations').doc()

    await invitationRef.set({
      ownerUid: uid,
      businessSyncId,
      businessName,
      inviteeEmail: normalizedEmail,
      status: 'pending',
      ...(normalizedSharePercent !== undefined ? { sharePercent: normalizedSharePercent } : {}),
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    })

    // Ensure owner has the sharedBusinesses claim so they can access shared storage
    const ownerClaims = await getUserClaims(uid)
    const ownerShared = Array.isArray(ownerClaims.sharedBusinesses) ? [...ownerClaims.sharedBusinesses] : []
    if (!ownerShared.includes(businessSyncId)) {
      ownerShared.push(businessSyncId)
      await setUserClaims(uid, { sharedBusinesses: ownerShared })
    }

    console.log(`[BusinessShare] Created invitation ${invitationRef.id} for ${normalizedEmail} to business ${businessSyncId}`)

    return NextResponse.json({
      success: true,
      invitationId: invitationRef.id,
    })
  } catch (error: any) {
    console.error('[BusinessShare] Invite failed:', error)

    if (error.code === 'auth/id-token-expired') {
      return NextResponse.json({ success: false, error: 'פג תוקף ההתחברות', errorCode: 'token-expired' })
    }

    return NextResponse.json({ success: false, error: 'שגיאת שרת', errorCode: 'unknown' })
  }
}
