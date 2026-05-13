/**
 * Read-only inspection of telegramLinks for the grocery user(s).
 * Usage: npx tsx scripts/check-telegram-link.ts
 */
import { loadEnv } from './_load-env'
loadEnv()
;(async () => {
  const admin = await import('firebase-admin')
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON!)) })
  const db = admin.firestore()
  const links = await db.collection('telegramLinks').get()
  console.log(`telegramLinks: ${links.size} docs`)
  for (const d of links.docs) {
    console.log(`  id=${d.id}`, JSON.stringify(d.data()))
  }
  process.exit(0)
})().catch(e => { console.error(e); process.exit(1) })
