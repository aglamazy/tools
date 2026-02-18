/**
 * Invite to Household API Route
 * Creates an invitation for a partner to join the household
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyIdToken, getAdminFirestore, isAdminConfigured } from '@/app/lib/firebaseAdmin'

const INVITATION_EXPIRY_DAYS = 7

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
    const body = await request.json()
    const { email } = body

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ success: false, error: 'נדרש אימייל', errorCode: 'invalid-email' })
    }

    const normalizedEmail = email.toLowerCase().trim()

    const decodedToken = await verifyIdToken(idToken)
    const uid = decodedToken.uid
    const inviterEmail = decodedToken.email

    // Check if user is household owner
    if (decodedToken.householdRole !== 'owner') {
      return NextResponse.json({
        success: false,
        error: 'רק בעל משק הבית יכול להזמין',
        errorCode: 'not-owner',
      })
    }

    const householdId = decodedToken.householdId as string
    if (!householdId) {
      return NextResponse.json({
        success: false,
        error: 'לא נמצא משק בית',
        errorCode: 'no-household',
      })
    }

    const firestore = getAdminFirestore()

    // Check household exists and get members
    const householdDoc = await firestore.collection('households').doc(householdId).get()
    if (!householdDoc.exists) {
      return NextResponse.json({
        success: false,
        error: 'משק הבית לא נמצא',
        errorCode: 'household-not-found',
      })
    }

    const householdData = householdDoc.data()!
    const members = householdData.members || []

    // Limit to 2 members (HOME tier = partners)
    if (members.length >= 2) {
      return NextResponse.json({
        success: false,
        error: 'משק הבית מלא (מקסימום 2 חברים)',
        errorCode: 'household-full',
      })
    }

    // Check if email already has a pending invitation
    const existingInvites = await firestore
      .collection('invitations')
      .where('householdId', '==', householdId)
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

    const invitationRef = firestore.collection('invitations').doc()

    await invitationRef.set({
      householdId,
      inviterUid: uid,
      inviterEmail: inviterEmail || null,
      inviteeEmail: normalizedEmail,
      status: 'pending',
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    })

    console.log(`[Household] Created invitation ${invitationRef.id} for ${normalizedEmail}`)

    return NextResponse.json({
      success: true,
      invitationId: invitationRef.id,
    })
  } catch (error: any) {
    console.error('[Household] Invite failed:', error)

    if (error.code === 'auth/id-token-expired') {
      return NextResponse.json({ success: false, error: 'פג תוקף ההתחברות', errorCode: 'token-expired' })
    }

    return NextResponse.json({ success: false, error: 'שגיאת שרת', errorCode: 'unknown' })
  }
}
