/**
 * Diagnostic: list all uids that have shufersal data, show standing list + pending + schedule.
 * Usage: npx tsx scripts/whoami-shufersal.ts
 */
import { loadEnv } from './_load-env'
loadEnv()
import * as admin from 'firebase-admin'

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON!)) })
const db = admin.firestore()

async function main() {
  const groceries = await db.collection('groceries').get()
  for (const doc of groceries.docs) {
    const uid = doc.id
    const stores = await db.collection('groceries').doc(uid).collection('stores').get()
    if (stores.empty) continue
    for (const s of stores.docs) {
      if (s.id !== 'shufersal') continue
      const data = s.data() as any
      const standing = Object.values(data.standingList || {}) as any[]
      const pendAdd = Object.values(data.pendingChanges?.add || {}) as any[]
      const pendRem = Object.values(data.pendingChanges?.remove || {}) as any[]
      const sched = data.schedule
      console.log(`\nuid=${uid}`)
      console.log(`  standing (${standing.length}): ${standing.map(i => i.name).slice(0, 8).join(', ')}${standing.length > 8 ? '…' : ''}`)
      console.log(`  pending add (${pendAdd.length}): ${pendAdd.map(e => e.item?.name).join(', ')}`)
      console.log(`  pending remove (${pendRem.length}): ${pendRem.map(e => e.name).join(', ')}`)
      console.log(`  schedule: ${sched ? `orderDay=${sched.orderDay} slot=${sched.preferredSlot?.day}@${sched.preferredSlot?.time}` : 'none'}`)
      const credDoc = await db.collection('groceries').doc(uid).collection('private').doc('credentials').get()
      console.log(`  credentials: ${credDoc.exists ? `set, verified=${credDoc.data()?.verified}` : 'missing'}`)
      const sessDoc = await db.collection('groceries').doc(uid).collection('private').doc('session').get()
      console.log(`  session: ${sessDoc.exists ? 'present' : 'missing'}`)
    }
  }
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
