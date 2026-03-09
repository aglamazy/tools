/**
 * One-time script: sync tier + tcAcceptedAt from Firestore user docs to Firebase custom claims.
 * Run: npx tsx scripts/sync-claims.ts
 *
 * Needed because custom claims were introduced after users already existed.
 */

import * as admin from 'firebase-admin'
import * as fs from 'fs'
import * as path from 'path'

// Load .env.local manually
const envPath = path.resolve(__dirname, '../.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/)
    if (match) {
      let val = match[2].trim()
      if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
        val = val.slice(1, -1)
      }
      process.env[match[1].trim()] = val
    }
  }
}

const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
if (!serviceAccountKey) {
  console.error('Missing FIREBASE_SERVICE_ACCOUNT_JSON in .env.local')
  process.exit(1)
}

const serviceAccount = JSON.parse(serviceAccountKey)
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })

const firestore = admin.firestore()
const auth = admin.auth()

async function main() {
  const usersSnapshot = await firestore.collection('users').get()
  console.log(`Found ${usersSnapshot.size} user docs`)

  let synced = 0
  let skipped = 0

  for (const doc of usersSnapshot.docs) {
    const uid = doc.id
    const data = doc.data()
    const tier = data.tier as string | undefined
    const tcAcceptedAt = data.tcAcceptedAt as string | undefined

    if (!tier && !tcAcceptedAt) {
      console.log(`  [skip] ${uid} — no tier or tcAcceptedAt`)
      skipped++
      continue
    }

    try {
      const user = await auth.getUser(uid)
      const existing = user.customClaims || {}
      const newClaims: Record<string, unknown> = { ...existing }

      if (tier) newClaims.tier = tier
      if (tcAcceptedAt) newClaims.tcAcceptedAt = tcAcceptedAt

      await auth.setCustomUserClaims(uid, newClaims)
      console.log(`  [sync] ${uid} — tier=${tier || '(none)'}, tcAcceptedAt=${tcAcceptedAt || '(none)'}`)
      synced++
    } catch (err: any) {
      // User might not exist in Auth (e.g. local-auth-user)
      console.log(`  [error] ${uid} — ${err.message}`)
      skipped++
    }
  }

  console.log(`\nDone: ${synced} synced, ${skipped} skipped`)
}

main().catch(console.error)
