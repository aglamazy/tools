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
import { withServiceCall } from '@/app/lib/observe'

async function GETHandler(request: NextRequest) {
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

    // Partners owned by this user (owner-side: businesses I own)
    const ownedPartnersSnap = await firestore
      .collection('businessPartners')
      .where('ownerUid', '==', uid)
      .get()
    const ownedPartners = ownedPartnersSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[]

    // Sharee-side: businesses I have access to via a grant. Fan out to fetch
    // ALL partners of those businesses so the sharee can see who else is in
    // the partnership (otherwise their settings show only the owner as a raw
    // uid and the percentage check fails). Without this the sharee's view
    // of `שותפים` was incomplete.
    const grantsToMeSnapEarly = await firestore
      .collection('businessAccessGrants')
      .where('uid', '==', uid)
      .get()
    const sharedBusinessSyncIds = Array.from(new Set(
      grantsToMeSnapEarly.docs
        .map(d => (d.data() as any).businessSyncId as string | undefined)
        .filter((s): s is string => typeof s === 'string'),
    ))
    let siblingPartners: any[] = []
    if (sharedBusinessSyncIds.length > 0) {
      // Firestore `in` queries cap at 30 elements — chunk if we ever exceed.
      const chunks: string[][] = []
      for (let i = 0; i < sharedBusinessSyncIds.length; i += 30) {
        chunks.push(sharedBusinessSyncIds.slice(i, i + 30))
      }
      const siblingSnaps = await Promise.all(chunks.map(c =>
        firestore.collection('businessPartners').where('businessSyncId', 'in', c).get(),
      ))
      siblingPartners = siblingSnaps.flatMap(s => s.docs.map(d => ({ id: d.id, ...d.data() })))
    }
    // Merge — own partners + sibling partners; dedupe by partner id.
    const partnerById = new Map<string, any>()
    for (const p of ownedPartners) partnerById.set(p.id, p)
    for (const p of siblingPartners) if (!partnerById.has(p.id)) partnerById.set(p.id, p)
    const partners = Array.from(partnerById.values())

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
    // Also enrich grants-to-me with the OWNER's email + displayName so
    // sharees can render a friendly owner row rather than a raw uid.
    const uidsToResolve = Array.from(new Set([
      ...grantsFromMe.map(g => g.uid),
      ...grantsToMe.map(g => g.ownerUid),
    ].filter(Boolean)))
    const userInfoByUid: Record<string, { displayName?: string; email?: string }> = {}
    await Promise.all(uidsToResolve.map(async (u) => {
      try {
        const userRecord = await auth.getUser(u as string)
        userInfoByUid[u as string] = {
          displayName: userRecord.displayName || undefined,
          email: userRecord.email || undefined,
        }
      } catch { /* user no longer exists / no perm — fall back to raw uid */ }
    }))
    for (const g of grantsFromMe) {
      const info = userInfoByUid[g.uid]
      if (info?.displayName) g.grantedUserDisplayName = info.displayName
    }
    for (const g of grantsToMe) {
      const info = userInfoByUid[g.ownerUid]
      if (info?.displayName) g.ownerDisplayName = info.displayName
      if (info?.email) g.ownerEmail = info.email
    }

    // Enrich partner records with `uid` resolved by email. The sharee-side
    // SettlementSummary keys participants on uid; without it, sibling partners
    // (e.g. Nadar from the sharee's perspective) get visible name+email but no
    // uid binding, so their share/balance never gets attributed — the user
    // sees "no balance between partners" even though partner-paid docs are
    // present. Lookup uses Admin SDK getUserByEmail with per-result fallback.
    const partnerEmailsToResolve = Array.from(new Set(
      partners
        .filter(p => p.email && !p.uid)
        .map(p => String(p.email).toLowerCase())
    ))
    const uidByEmail: Record<string, string> = {}
    await Promise.all(partnerEmailsToResolve.map(async (email) => {
      try {
        const rec = await auth.getUserByEmail(email)
        if (rec?.uid) uidByEmail[email] = rec.uid
      } catch { /* user not found — leave unenriched */ }
    }))
    for (const p of partners) {
      if (!p.uid && p.email) {
        const u = uidByEmail[String(p.email).toLowerCase()]
        if (u) p.uid = u
      }
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

export const GET = withServiceCall(GETHandler)
