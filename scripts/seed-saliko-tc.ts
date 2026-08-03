/**
 * Seed Saliko's `tcVersions` collection with the current Terms of Use,
 * pulled from the single source of truth at
 * `app/saliko/terms/termsContent.ts`.
 *
 * DO NOT RUN THIS until the text in termsContent.ts has been reviewed and
 * approved (Agla / lawyer) — this writes directly to production Firestore
 * and is what real users see on next visit. See Saliko #16.
 *
 * Re-run whenever you edit termsContent.ts and bump SALIKO_TC_VERSION.
 *
 * Usage: npx tsx scripts/seed-saliko-tc.ts
 */
import { loadEnv } from './_load-env'
loadEnv()
;(process.env as { NODE_ENV?: string }).NODE_ENV = process.env.NODE_ENV || 'development'

import * as fs from 'fs'
import { SALIKO_TC_HTML, SALIKO_TC_VERSION } from '../app/saliko/terms/termsContent'

const COLLECTION = 'tcVersions'

async function main() {
  const admin = await import('firebase-admin')
  const salikoSa = JSON.parse(fs.readFileSync('/home/yaakov/develop/docs/saliko-firebase-admin.json', 'utf8'))

  const app = admin.initializeApp({ credential: admin.credential.cert(salikoSa) })
  const db = app.firestore()

  const existing = await db.collection(COLLECTION).doc(SALIKO_TC_VERSION).get()
  if (existing.exists) {
    console.log(`${COLLECTION}/${SALIKO_TC_VERSION} already exists — updating text in place.`)
  }

  await db.collection(COLLECTION).doc(SALIKO_TC_VERSION).set({
    version: SALIKO_TC_VERSION,
    text: SALIKO_TC_HTML,
    seededAt: new Date().toISOString(),
  })

  console.log(`✓ Wrote saliko-prod/${COLLECTION}/${SALIKO_TC_VERSION} (${SALIKO_TC_HTML.length} chars)`)
  console.log('Existing users will be prompted to re-accept on next visit since this version is newer than their stored tcAcceptedAt.')

  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
