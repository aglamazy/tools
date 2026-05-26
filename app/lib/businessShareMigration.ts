/**
 * Business-share data model migration.
 *
 * The legacy `businessShares` collection conflated two concepts:
 *   - the partner record (durable identity + share %)
 *   - the access grant (a specific Firebase uid is allowed in)
 *
 * The new model splits them:
 *   - `businessPartners`  — durable: ownerUid, businessSyncId, email, displayName,
 *                           sharePercent. Lives independently of any current access.
 *   - `businessShareInvitations` — transient: pending/accepted/expired/cancelled
 *                           access link. Now carries `partnerId`.
 *   - `businessAccessGrants` — current bindings: (partnerId, uid). Deleting a grant
 *                           revokes access but leaves the partner intact.
 *
 * This module exposes one entry point — `ensureMigratedForOwner(uid)` — that
 * is idempotent and cheap on repeat: it short-circuits the moment it sees there
 * is nothing legacy left to migrate. The /list endpoint calls it on every
 * request from the owner side.
 *
 * Legacy `businessShares` rows get `migrated: true` after conversion. They are
 * NOT deleted yet so that we can roll back during the 2026-05/06 cutover
 * window. A separate cleanup pass will drop them once the new flow is stable.
 */

import { getAdminFirestore } from '@/app/lib/firebaseAdmin'
import type { Firestore, DocumentReference } from 'firebase-admin/firestore'

const LEGACY_COLLECTION = 'businessShares'
const PARTNERS = 'businessPartners'
const INVITATIONS = 'businessShareInvitations'
const GRANTS = 'businessAccessGrants'

type LegacyShare = {
  id: string
  ownerUid: string
  businessSyncId: string
  businessName: string
  sharedWithUid: string
  sharedWithEmail: string
  status: 'active' | 'revoked'
  sharePercent?: number
  createdAt: string
  migrated?: boolean
}

async function findPartner(
  firestore: Firestore,
  ownerUid: string,
  businessSyncId: string,
  email: string,
): Promise<DocumentReference | null> {
  const snap = await firestore
    .collection(PARTNERS)
    .where('ownerUid', '==', ownerUid)
    .where('businessSyncId', '==', businessSyncId)
    .where('email', '==', email)
    .limit(1)
    .get()
  return snap.empty ? null : snap.docs[0].ref
}

async function findGrant(
  firestore: Firestore,
  partnerId: string,
  uid: string,
): Promise<DocumentReference | null> {
  const snap = await firestore
    .collection(GRANTS)
    .where('partnerId', '==', partnerId)
    .where('uid', '==', uid)
    .limit(1)
    .get()
  return snap.empty ? null : snap.docs[0].ref
}

/**
 * Convert a single legacy share row into (partner, grant, backfilled invitations).
 * Idempotent — safe to call multiple times for the same legacy row.
 */
async function convertOne(firestore: Firestore, share: LegacyShare): Promise<void> {
  const email = share.sharedWithEmail.toLowerCase()
  const now = new Date().toISOString()

  // 1. Partner — create if missing, otherwise reuse.
  let partnerRef = await findPartner(firestore, share.ownerUid, share.businessSyncId, email)
  if (!partnerRef) {
    partnerRef = firestore.collection(PARTNERS).doc()
    await partnerRef.set({
      ownerUid: share.ownerUid,
      businessSyncId: share.businessSyncId,
      businessName: share.businessName,
      email,
      displayName: null,
      sharePercent: typeof share.sharePercent === 'number' ? share.sharePercent : 0,
      createdAt: share.createdAt || now,
      updatedAt: now,
      migratedFromShareId: share.id,
    })
  }
  const partnerId = partnerRef.id

  // 2. Access grant — only for legacy rows that were `active`. Revoked legacy
  //    rows still produce a partner record (history), but no current access.
  if (share.status === 'active' && share.sharedWithUid) {
    const existingGrant = await findGrant(firestore, partnerId, share.sharedWithUid)
    if (!existingGrant) {
      await firestore.collection(GRANTS).doc().set({
        partnerId,
        ownerUid: share.ownerUid,
        businessSyncId: share.businessSyncId,
        uid: share.sharedWithUid,
        email,
        grantedAt: share.createdAt || now,
        grantedViaInvitationId: 'migrated',
      })
    }
  }

  // 3. Backfill `partnerId` on any existing invitations matching this email.
  const invSnap = await firestore
    .collection(INVITATIONS)
    .where('ownerUid', '==', share.ownerUid)
    .where('businessSyncId', '==', share.businessSyncId)
    .where('inviteeEmail', '==', email)
    .get()
  for (const doc of invSnap.docs) {
    if (!doc.data().partnerId) {
      await doc.ref.update({ partnerId })
    }
  }

  // 4. Mark the legacy row as migrated.
  await firestore.collection(LEGACY_COLLECTION).doc(share.id).update({ migrated: true })
}

/**
 * Idempotent migration check. Returns the number of rows migrated.
 * Short-circuits the moment it sees no unmigrated legacy rows.
 */
export async function ensureMigratedForOwner(ownerUid: string): Promise<number> {
  const firestore = getAdminFirestore()

  // Owned legacy shares. We migrate revoked rows too so history is preserved;
  // they just don't produce an access grant.
  const snap = await firestore
    .collection(LEGACY_COLLECTION)
    .where('ownerUid', '==', ownerUid)
    .get()

  const unmigrated = snap.docs
    .map(d => ({ id: d.id, ...d.data() } as LegacyShare))
    .filter(s => !s.migrated)

  if (unmigrated.length === 0) return 0

  for (const share of unmigrated) {
    try {
      await convertOne(firestore, share)
    } catch (err) {
      console.error(`[ShareMigration] convert failed for share ${share.id}:`, err)
      // Don't throw — let the rest migrate. A second /list call retries the failures.
    }
  }

  console.log(`[ShareMigration] Owner ${ownerUid}: converted ${unmigrated.length} legacy shares`)
  return unmigrated.length
}

/**
 * Recipient-side migration: when a user with `sharedBusinesses` claim signs in
 * but has no `businessAccessGrants` rows pointing at them, fall back to legacy
 * `businessShares` to derive grants. Only useful during the transition window —
 * after the owner has run `ensureMigratedForOwner`, the recipient already has
 * grants.
 *
 * Returns the number of grants created.
 */
export async function ensureGrantsForRecipient(uid: string): Promise<number> {
  const firestore = getAdminFirestore()

  const granted = await firestore
    .collection(GRANTS)
    .where('uid', '==', uid)
    .get()
  const grantedBusinessIds = new Set(granted.docs.map(d => d.data().businessSyncId as string))

  const legacy = await firestore
    .collection(LEGACY_COLLECTION)
    .where('sharedWithUid', '==', uid)
    .where('status', '==', 'active')
    .get()

  let created = 0
  for (const doc of legacy.docs) {
    const share = doc.data() as LegacyShare
    if (grantedBusinessIds.has(share.businessSyncId)) continue

    // Find or create the partner record. Recipient may not own the partner doc
    // (owner does), so we just look it up. If missing, skip — owner side will
    // create it next time they hit /list.
    const partner = await findPartner(firestore, share.ownerUid, share.businessSyncId, share.sharedWithEmail.toLowerCase())
    if (!partner) continue

    await firestore.collection(GRANTS).doc().set({
      partnerId: partner.id,
      ownerUid: share.ownerUid,
      businessSyncId: share.businessSyncId,
      uid,
      email: share.sharedWithEmail.toLowerCase(),
      grantedAt: share.createdAt || new Date().toISOString(),
      grantedViaInvitationId: 'migrated-recipient',
    })
    created++
  }

  if (created > 0) {
    console.log(`[ShareMigration] Recipient ${uid}: derived ${created} grants from legacy`)
  }
  return created
}
