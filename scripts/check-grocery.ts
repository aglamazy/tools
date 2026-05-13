/**
 * Read-only inspection of grocery state across all users/stores.
 * Usage: npx tsx scripts/check-grocery.ts
 */
import { loadEnv } from './_load-env'
loadEnv()
;(async () => {
  const admin = await import('firebase-admin')
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON!)) })
  const db = admin.firestore()
  const groceries = await db.collection('groceries').get()
  for (const doc of groceries.docs) {
    const uid = doc.id
    const stores = await db.collection('groceries').doc(uid).collection('stores').get()
    for (const s of stores.docs) {
      const d = s.data() as Record<string, unknown>
      console.log(`\n=== uid=${uid} store=${s.id} ===`)
      console.log('schedule:', JSON.stringify(d.schedule))
      console.log('orderCycle:', JSON.stringify(d.orderCycle))
      const standing = (d.standingList as unknown[] | undefined) || []
      const pending = (d.pendingChanges as unknown[] | undefined) || []
      console.log('standingList count:', standing.length)
      console.log('pendingChanges count:', pending.length)
      if (d.lastOrder) console.log('lastOrder:', JSON.stringify(d.lastOrder).slice(0, 400))
      if (d.lockedAt) console.log('lockedAt:', d.lockedAt)
      if (d.idempotencyKey) console.log('idempotencyKey:', d.idempotencyKey)
      if (d.lastError) console.log('lastError:', d.lastError)
      if (d.attempts) console.log('attempts:', d.attempts)
      if (d.updatedAt) console.log('updatedAt:', d.updatedAt)
    }
  }
  process.exit(0)
})().catch(e => { console.error(e); process.exit(1) })
