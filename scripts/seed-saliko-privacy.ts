/**
 * Seed Saliko's `privacyVersions` collection with the current privacy
 * statement, pulled from the single source of truth at
 * `app/saliko/privacy/privacyContent.ts`.
 *
 * Re-run whenever you edit privacyContent.ts and bump SALIKO_PRIVACY_VERSION.
 *
 * Usage: npx tsx scripts/seed-saliko-privacy.ts
 */
import { loadEnv } from './_load-env'
loadEnv()
;(process.env as { NODE_ENV?: string }).NODE_ENV = process.env.NODE_ENV || 'development'

import * as fs from 'fs'
import {
  SALIKO_PRIVACY_HTML,
  SALIKO_PRIVACY_VERSION,
} from '../app/saliko/privacy/privacyContent'

const COLLECTION = 'privacyVersions'

async function main() {
  const admin = await import('firebase-admin')
  const salikoSa = JSON.parse(
    fs.readFileSync('/home/yaakov/develop/docs/saliko-firebase-admin.json', 'utf8'),
  )

  const app = admin.initializeApp({ credential: admin.credential.cert(salikoSa) })
  const db = app.firestore()

  const existing = await db.collection(COLLECTION).doc(SALIKO_PRIVACY_VERSION).get()
  if (existing.exists) {
    console.log(
      `privacyVersions/${SALIKO_PRIVACY_VERSION} already exists — updating text in place.`,
    )
  }

  await db
    .collection(COLLECTION)
    .doc(SALIKO_PRIVACY_VERSION)
    .set({
      version: SALIKO_PRIVACY_VERSION,
      text: SALIKO_PRIVACY_HTML,
      seededAt: new Date().toISOString(),
    })

  console.log(
    `✓ Wrote saliko-prod/${COLLECTION}/${SALIKO_PRIVACY_VERSION} (${SALIKO_PRIVACY_HTML.length} chars)`,
  )
  console.log(
    'Existing users will be prompted to re-accept on next visit if the version is newer than their stored privacyAcceptedAt.',
  )

  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
