/**
 * One-shot: set or restore schedule.orderDay for a uid's shufersal store.
 * Usage: npx tsx scripts/bump-orderday.ts <uid> <orderDay>
 *   orderDay: 0 (Sun) .. 6 (Sat)
 */
import * as admin from 'firebase-admin'
import * as fs from 'fs'
import * as path from 'path'

const envPath = path.resolve(__dirname, '../.env.local')
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/)
  if (!m) continue
  let v = m[2].trim()
  if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) v = v.slice(1, -1)
  process.env[m[1].trim()] = v
}
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON!)) })
const db = admin.firestore()

async function main() {
  const uid = process.argv[2]
  const orderDay = parseInt(process.argv[3] || '', 10)
  if (!uid || isNaN(orderDay) || orderDay < 0 || orderDay > 6) {
    console.error('Usage: npx tsx scripts/bump-orderday.ts <uid> <orderDay 0-6>')
    process.exit(1)
  }
  const ref = db.collection('groceries').doc(uid).collection('stores').doc('shufersal')
  const snap = await ref.get()
  if (!snap.exists) { console.error('No shufersal doc'); process.exit(1) }
  const data = snap.data()!
  const before = data.schedule
  const next = { ...before, orderDay }
  await ref.update({
    schedule: next,
    // Clear stale lock + lastError so preflight can proceed cleanly.
    'orderCycle.lockedAt': admin.firestore.FieldValue.delete(),
    'orderCycle.lastError': admin.firestore.FieldValue.delete(),
    'orderCycle.attempts': admin.firestore.FieldValue.delete(),
  })
  console.log('Schedule before:', before)
  console.log('Schedule after :', next)
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
