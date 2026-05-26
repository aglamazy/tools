/**
 * Business Share List API Route — new data model.
 *
 * Returns the three entities that together describe sharing state for the
 * current user:
 *   - partners      — owned business partners (owner-side view; durable)
 *   - invitations   — pending invitations the owner has sent OR the user has received
 *   - grants        — access grants where this user IS the granted user (recipient-side)
 *
 * Triggers idempotent migration of legacy `businessShares` on every call.
 * Short-circuits cheaply when nothing left to migrate.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminFirestore, getAdminAuth } from '@/app/lib/firebaseAdmin'
import { requireAuth } from '@/app/lib/apiGuard'
import { ensureMigratedForOwner, ensureGrantsForRecipient } from '@/app/lib/businessShareMigration'

export async function GET(request: NextRequest) {
  const guard = await requireAuth(request)
  if (guard.error) return guard.error
  const uid = guard.uid
  const userEmail = (guard.claims.email || '').toLowerCase()

  try {
    // Idempotent migrations — cheap after the first conversion.
    await ensureMigratedForOwner(uid)
    await ensureGrantsForRecipient(uid)

    const firestore = getAdminFirestore()
    const auth = getAdminAuth()

    // Partners owned by this user
    const partnersSnap = await firestore
      .collection('businessPartners')
      .where('ownerUid', '==', uid)
      .get()
    const partners = partnersSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[]

    // Pending invitations sent by this user
    const ownedInvitesSnap = await firestore
      .collection('businessShareInvitations')
      .where('ownerUid', '==', uid)
      .where('status', '==', 'pending')
      .get()
    const ownedInvitations = ownedInvitesSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[]

    // Pending invitations addressed to this user (received side)
    let receivedInvitations: any[] = []
    if (userEmail) {
      const receivedSnap = await firestore
        .collection('businessShareInvitations')
        .where('inviteeEmail', '==', userEmail)
        .where('status', '==', 'pending')
        .get()
      receivedInvitations = receivedSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    }

    // Access grants TO this user (what the user currently has access to)
    const grantsToMeSnap = await firestore
      .collection('businessAccessGrants')
      .where('uid', '==', uid)
      .get()
    const grantsToMe = grantsToMeSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[]

    // Access grants FOR partners owned by this user (what the user has granted to others)
    const grantsFromMeSnap = await firestore
      .collection('businessAccessGrants')
      .where('ownerUid', '==', uid)
      .get()
    const grantsFromMe = grantsFromMeSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[]

    // Enrich grants-from-me with the granted user's displayName for UI.
    const uniqueUids = Array.from(new Set(grantsFromMe.map(g => g.uid).filter(Boolean)))
    const displayNameByUid: Record<string, string> = {}
    await Promise.all(uniqueUids.map(async (u) => {
      try {
        const userRecord = await auth.getUser(u as string)
        if (userRecord.displayName) displayNameByUid[u as string] = userRecord.displayName
      } catch { /* fall back to email */ }
    }))
    for (const g of grantsFromMe) {
      const dn = displayNameByUid[g.uid]
      if (dn) g.grantedUserDisplayName = dn
    }

    return NextResponse.json({
      success: true,
      partners,
      ownedInvitations,
      receivedInvitations,
      grantsToMe,
      grantsFromMe,
    })
  } catch (error: any) {
    console.error('[BusinessShare] List failed:', error)
    if (error.code === 'auth/id-token-expired') {
      return NextResponse.json({ success: false, error: 'פג תוקף ההתחברות', errorCode: 'token-expired' })
    }
    return NextResponse.json({ success: false, error: 'שגיאת שרת', errorCode: 'unknown' })
  }
}
