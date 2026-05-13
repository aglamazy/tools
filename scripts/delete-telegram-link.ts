/**
 * Delete a single telegramLinks doc by id.
 * Usage: npx tsx scripts/delete-telegram-link.ts <linkId>
 */
import { loadEnv } from './_load-env'
loadEnv()

const linkId = process.argv[2]
if (!linkId) { console.error('linkId required'); process.exit(1) }

;(async () => {
  const admin = await import('firebase-admin')
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON!)) })
  const db = admin.firestore()
  const ref = db.collection('telegramLinks').doc(linkId)
  const snap = await ref.get()
  if (!snap.exists) { console.log(`No such doc: ${linkId}`); process.exit(0) }
  console.log(`Before delete:`, JSON.stringify(snap.data()))
  await ref.delete()
  console.log(`✓ Deleted ${linkId}`)
  process.exit(0)
})().catch(e => { console.error(e); process.exit(1) })
