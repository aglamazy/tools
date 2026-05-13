/**
 * One-shot migration: copy Yaakov's data from aglamaz-finance → saliko-prod.
 *
 * Source is read-only — never modified. Destination is write-only — never
 * read for delete/update of pre-existing data (any pre-existing doc with the
 * same id is overwritten via .set(), which is what we want for a fresh
 * Saliko Firestore).
 *
 * Collections migrated:
 *   - users/{uid}                          (preserve tier, override tcAcceptedAt to saliko version)
 *   - telegramLinks/{linkId}               (only Yaakov's links)
 *   - groceries/{uid}/stores/{storeId}     (retalix, shufersal, _meta — full docs)
 *
 * NOT migrated:
 *   - groceries/{uid} root (legacy single-store doc, no longer read by cron)
 *   - any other Aglamazo-specific collections (transactions, businesses, etc.)
 */
import { loadEnv } from './_load-env'
loadEnv()
import * as fs from 'fs'

const UID = 'rARk7h1zwjhH9ATji5pHETqSWuC3'
const SALIKO_TC_VERSION = '2026-05-06-saliko'

;(async () => {
  const admin = await import('firebase-admin')

  const aglaSa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON!)
  const salikoSa = JSON.parse(fs.readFileSync('/home/yaakov/develop/docs/saliko-firebase-admin.json', 'utf8'))

  const aglaApp = admin.initializeApp({ credential: admin.credential.cert(aglaSa) }, 'agla')
  const salikoApp = admin.initializeApp({ credential: admin.credential.cert(salikoSa) }, 'saliko')

  const aglaDb = aglaApp.firestore()
  const salikoDb = salikoApp.firestore()

  // 1. users/{uid}
  const userDoc = await aglaDb.collection('users').doc(UID).get()
  if (!userDoc.exists) throw new Error('Source users doc missing')
  const userData = userDoc.data() as Record<string, unknown>
  // Drop householdId/householdRole — those reference an Aglamazo-specific
  // household entity that doesn't exist on saliko-prod. Override T&C to the
  // Saliko version so the existing user is treated as already accepted.
  const { householdId: _h1, householdRole: _h2, ...rest } = userData
  void _h1; void _h2
  const salikoUserData = {
    ...rest,
    tcAcceptedAt: SALIKO_TC_VERSION,
    tcAcceptedTimestamp: new Date().toISOString(),
  }
  await salikoDb.collection('users').doc(UID).set(salikoUserData)
  console.log(`✓ users/${UID} → tier=${(salikoUserData as Record<string, unknown>).tier}, tcAcceptedAt=${salikoUserData.tcAcceptedAt}`)

  // 2. telegramLinks for this user
  const linksSnap = await aglaDb.collection('telegramLinks').where('uid', '==', UID).get()
  for (const d of linksSnap.docs) {
    await salikoDb.collection('telegramLinks').doc(d.id).set(d.data())
    console.log(`✓ telegramLinks/${d.id}`)
  }
  if (linksSnap.empty) console.log('  (no telegramLinks to copy)')

  // 3. groceries/{uid}/stores/* — full store data including credentials
  const storesSnap = await aglaDb.collection('groceries').doc(UID).collection('stores').get()
  for (const s of storesSnap.docs) {
    await salikoDb.collection('groceries').doc(UID).collection('stores').doc(s.id).set(s.data())
    const fields = Object.keys(s.data())
    console.log(`✓ groceries/${UID}/stores/${s.id} (fields: ${fields.join(',')})`)
  }
  if (storesSnap.empty) console.log('  (no groceries/stores to copy)')

  console.log('\nMigration complete.')
  console.log('NOTE: Encrypted store credentials (Shufersal email/pwd, Retalix OTP token)')
  console.log('will only decrypt on Saliko if the SAME ENCRYPTION_KEY env is in use. Verify')
  console.log('via the stores page after sign-in. If decryption fails, you\'ll need to')
  console.log('re-link the stores on Saliko (which is fine — credentials have to be re-encrypted')
  console.log('with the new project\'s key in production anyway).')
  process.exit(0)
})().catch(e => { console.error(e); process.exit(1) })
