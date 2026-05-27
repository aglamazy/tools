/**
 * Diagnose a shared-business setup end-to-end.
 *
 * Usage:
 *   npx tsx scripts/diagnose-shared-business.ts <owner-email> <business-name-substring>
 *
 * With --add-partner you can also create a fresh BusinessPartner + invitation
 * pair in one shot (mirrors the API behaviour) so you can test the recipient
 * flow with a throwaway address:
 *   npx tsx scripts/diagnose-shared-business.ts <owner-email> <biz-name> \
 *     --add-partner y25131@gmail.com --percent 0
 *
 * Prints (in order):
 *   - owner user record + custom claims
 *   - business doc (syncId, type, sharedWithMe)
 *   - businessPartners rows
 *   - businessShareInvitations rows
 *   - businessAccessGrants rows + grantee custom claims
 *   - Storage listing under backups/shared/{syncId}/
 *
 * Requires FIREBASE_SERVICE_ACCOUNT_JSON + NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
 * in .env.local.
 */

import * as admin from 'firebase-admin'
import * as fs from 'fs'
import * as path from 'path'

const envPath = path.resolve(__dirname, '../.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/)
    if (match) {
      let val = match[2].trim()
      if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
        val = val.slice(1, -1)
      }
      if (!process.env[match[1].trim()]) {
        process.env[match[1].trim()] = val
      }
    }
  }
}

const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
if (!serviceAccountKey) {
  console.error('Missing FIREBASE_SERVICE_ACCOUNT_JSON in .env.local')
  process.exit(1)
}
const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
if (!bucketName) {
  console.error('Missing NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET in .env.local')
  process.exit(1)
}

const serviceAccount = JSON.parse(serviceAccountKey)
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: bucketName,
})

const firestore = admin.firestore()
const auth = admin.auth()
const storage = admin.storage()

function parseArgs() {
  const args = process.argv.slice(2)
  const positional: string[] = []
  let addPartnerEmail: string | undefined
  let sharePercent: number = 0
  let displayName: string | undefined
  let i = 0
  while (i < args.length) {
    const a = args[i]
    if (a === '--add-partner') { addPartnerEmail = args[++i] }
    else if (a === '--percent') { sharePercent = Number(args[++i]) }
    else if (a === '--display-name') { displayName = args[++i] }
    else { positional.push(a) }
    i++
  }
  if (positional.length < 2) {
    console.error('Usage: diagnose-shared-business.ts <owner-email> <business-name-substring> [--add-partner EMAIL] [--percent N] [--display-name NAME]')
    process.exit(1)
  }
  return {
    ownerEmail: positional[0].toLowerCase(),
    bizNameSubstring: positional[1],
    addPartnerEmail: addPartnerEmail?.toLowerCase(),
    sharePercent,
    displayName,
  }
}

async function findOwner(email: string) {
  // Try Auth first
  try {
    const userRecord = await auth.getUserByEmail(email)
    return { uid: userRecord.uid, email: userRecord.email!, claims: userRecord.customClaims || {} }
  } catch {
    // Fall back to users collection
    const snap = await firestore.collection('users').where('email', '==', email).limit(1).get()
    if (snap.empty) {
      console.error(`No user found with email ${email}`)
      process.exit(1)
    }
    const uid = snap.docs[0].id
    const userRecord = await auth.getUser(uid)
    return { uid, email: userRecord.email || email, claims: userRecord.customClaims || {} }
  }
}

async function findBusinessByOwnerSubstring(ownerUid: string, sub: string) {
  // Businesses aren't stored in Firestore at the doc level — they live in the
  // owner's Dexie + encrypted backup. The closest server-side hook we have is
  // the businessPartners collection, which records businessName + syncId per
  // partner. Use it as the canonical lookup.
  const snap = await firestore
    .collection('businessPartners')
    .where('ownerUid', '==', ownerUid)
    .get()
  const matches: { syncId: string; name: string }[] = []
  const seen = new Set<string>()
  for (const d of snap.docs) {
    const data = d.data()
    if (typeof data.businessName === 'string' && typeof data.businessSyncId === 'string'
        && data.businessName.toLowerCase().includes(sub.toLowerCase())
        && !seen.has(data.businessSyncId)) {
      matches.push({ syncId: data.businessSyncId, name: data.businessName })
      seen.add(data.businessSyncId)
    }
  }
  return matches
}

async function main() {
  const args = parseArgs()
  console.log(`\n=== Diagnose shared business ===`)
  console.log(`Owner email: ${args.ownerEmail}`)
  console.log(`Business name contains: "${args.bizNameSubstring}"`)
  if (args.addPartnerEmail) {
    console.log(`Will add partner: ${args.addPartnerEmail} @ ${args.sharePercent}%`)
  }

  const owner = await findOwner(args.ownerEmail)
  console.log(`\n--- Owner ---`)
  console.log(`uid: ${owner.uid}`)
  console.log(`email: ${owner.email}`)
  console.log(`customClaims: ${JSON.stringify(owner.claims, null, 2)}`)

  const businesses = await findBusinessByOwnerSubstring(owner.uid, args.bizNameSubstring)
  console.log(`\n--- Business candidates (from businessPartners) ---`)
  if (businesses.length === 0) {
    console.log('(none — owner has no partners on any business matching that substring)')
    process.exit(0)
  }
  for (const b of businesses) {
    console.log(`  ${b.name} — syncId=${b.syncId}`)
  }
  if (businesses.length > 1) {
    console.log(`(multiple matches; using first: ${businesses[0].name})`)
  }
  const businessSyncId = businesses[0].syncId
  const businessName = businesses[0].name

  // -------------------------------------------------------------------------
  // Partners
  // -------------------------------------------------------------------------
  const partnersSnap = await firestore
    .collection('businessPartners')
    .where('ownerUid', '==', owner.uid)
    .where('businessSyncId', '==', businessSyncId)
    .get()
  console.log(`\n--- Partners (${partnersSnap.size}) ---`)
  for (const d of partnersSnap.docs) {
    const p = d.data()
    console.log(`  ${d.id}  ${p.email}  ${p.sharePercent}%  displayName=${p.displayName || '-'}  createdAt=${p.createdAt}`)
  }

  // -------------------------------------------------------------------------
  // Invitations
  // -------------------------------------------------------------------------
  const invitesSnap = await firestore
    .collection('businessShareInvitations')
    .where('ownerUid', '==', owner.uid)
    .where('businessSyncId', '==', businessSyncId)
    .get()
  console.log(`\n--- Invitations (${invitesSnap.size}) ---`)
  for (const d of invitesSnap.docs) {
    const v = d.data()
    console.log(`  ${d.id}  ${v.inviteeEmail}  status=${v.status}  partnerId=${v.partnerId || '(missing)'}  expiresAt=${v.expiresAt}  acceptedBy=${v.acceptedBy || '-'}`)
  }

  // -------------------------------------------------------------------------
  // Access grants
  // -------------------------------------------------------------------------
  const grantsSnap = await firestore
    .collection('businessAccessGrants')
    .where('ownerUid', '==', owner.uid)
    .where('businessSyncId', '==', businessSyncId)
    .get()
  console.log(`\n--- Access grants (${grantsSnap.size}) ---`)
  for (const d of grantsSnap.docs) {
    const g = d.data()
    console.log(`  ${d.id}  partnerId=${g.partnerId}  uid=${g.uid}  email=${g.email}  grantedAt=${g.grantedAt}`)
    try {
      const user = await auth.getUser(g.uid)
      console.log(`    grantee customClaims.sharedBusinesses: ${JSON.stringify((user.customClaims || {}).sharedBusinesses || [])}`)
      console.log(`    grantee email (from Auth): ${user.email}`)
    } catch (err: any) {
      console.log(`    (failed to load grantee Auth record: ${err.message})`)
    }
  }

  // -------------------------------------------------------------------------
  // Storage listing
  // -------------------------------------------------------------------------
  const prefix = `backups/shared/${businessSyncId}/`
  console.log(`\n--- Storage: ${bucketName}/${prefix} ---`)
  const [files] = await storage.bucket().getFiles({ prefix })
  if (files.length === 0) {
    console.log('  (no files — owner has never uploaded backup.enc / verify.enc here)')
  } else {
    for (const f of files) {
      const [meta] = await f.getMetadata()
      console.log(`  ${f.name}  size=${meta.size}B  updated=${meta.updated}  generation=${meta.generation}`)
    }
  }

  // -------------------------------------------------------------------------
  // Optionally add a new partner
  // -------------------------------------------------------------------------
  if (args.addPartnerEmail) {
    console.log(`\n--- Add partner: ${args.addPartnerEmail} @ ${args.sharePercent}% ---`)
    const existing = await firestore
      .collection('businessPartners')
      .where('ownerUid', '==', owner.uid)
      .where('businessSyncId', '==', businessSyncId)
      .where('email', '==', args.addPartnerEmail)
      .limit(1)
      .get()
    let partnerId: string
    if (!existing.empty) {
      partnerId = existing.docs[0].id
      console.log(`  Partner already exists: ${partnerId} — reusing.`)
    } else {
      const now = new Date().toISOString()
      const ref = firestore.collection('businessPartners').doc()
      await ref.set({
        ownerUid: owner.uid,
        businessSyncId,
        businessName,
        email: args.addPartnerEmail,
        displayName: args.displayName || null,
        sharePercent: args.sharePercent,
        createdAt: now,
        updatedAt: now,
      })
      partnerId = ref.id
      console.log(`  Created BusinessPartner ${partnerId}`)
    }

    // Cancel any stale pending invitations for this partner
    const stale = await firestore
      .collection('businessShareInvitations')
      .where('partnerId', '==', partnerId)
      .where('status', '==', 'pending')
      .get()
    const batch = firestore.batch()
    for (const d of stale.docs) batch.update(d.ref, { status: 'cancelled' })

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    const invRef = firestore.collection('businessShareInvitations').doc()
    batch.set(invRef, {
      partnerId,
      ownerUid: owner.uid,
      businessSyncId,
      businessName,
      inviteeEmail: args.addPartnerEmail,
      status: 'pending',
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
    })
    await batch.commit()
    console.log(`  Created invitation ${invRef.id}`)

    // Ensure owner has sharedBusinesses claim
    const claims = (await auth.getUser(owner.uid)).customClaims || {}
    const shared = Array.isArray(claims.sharedBusinesses) ? [...claims.sharedBusinesses] : []
    if (!shared.includes(businessSyncId)) {
      shared.push(businessSyncId)
      await auth.setCustomUserClaims(owner.uid, { ...claims, sharedBusinesses: shared })
      console.log(`  Refreshed owner sharedBusinesses claim`)
    }

    console.log(`\n  Share-invite link (paste into y25131@gmail.com's browser):`)
    console.log(`    https://aglamazo.com/share-invite?id=${invRef.id}`)
    console.log(`  (local dev: http://localhost:3100/share-invite?id=${invRef.id})`)
  }

  console.log(`\n=== Done ===\n`)
  process.exit(0)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
