/**
 * READ-ONLY inspect of Yaakov's data on aglamaz-finance, so we know what
 * to migrate to saliko-prod. Does not write anywhere.
 */
import { loadEnv } from './_load-env'
loadEnv()
;(async () => {
  const admin = await import('firebase-admin')
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON!)
  const app = admin.initializeApp({ credential: admin.credential.cert(sa) })
  const db = app.firestore()

  const UID = 'rARk7h1zwjhH9ATji5pHETqSWuC3'

  console.log('=== users/' + UID + ' ===')
  const userDoc = await db.collection('users').doc(UID).get()
  if (userDoc.exists) console.log(JSON.stringify(userDoc.data(), null, 2))
  else console.log('(empty)')

  console.log('\n=== telegramLinks (uid=' + UID + ') ===')
  const linksSnap = await db.collection('telegramLinks').where('uid', '==', UID).get()
  for (const d of linksSnap.docs) {
    console.log(`  ${d.id} →`, JSON.stringify(d.data()))
  }

  console.log('\n=== groceries/' + UID + ' (root) ===')
  const groceryRoot = await db.collection('groceries').doc(UID).get()
  if (groceryRoot.exists) {
    const data = groceryRoot.data()!
    const summary: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(data)) {
      if (Array.isArray(v)) summary[k] = `array(${v.length})`
      else if (v && typeof v === 'object') summary[k] = `object(keys=${Object.keys(v as object).length})`
      else summary[k] = v
    }
    console.log(JSON.stringify(summary, null, 2))
  } else console.log('(empty)')

  console.log('\n=== groceries/' + UID + '/stores/* ===')
  const stores = await db.collection('groceries').doc(UID).collection('stores').get()
  for (const s of stores.docs) {
    const d = s.data() as Record<string, unknown>
    const summary: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(d)) {
      if (Array.isArray(v)) summary[k] = `array(${v.length})`
      else if (v && typeof v === 'object') summary[k] = `object`
      else summary[k] = v
    }
    console.log(`  store=${s.id}:`, JSON.stringify(summary))
  }

  process.exit(0)
})().catch(e => { console.error(e); process.exit(1) })
