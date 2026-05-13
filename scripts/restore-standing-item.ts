/**
 * Restore a single item to the user's standing list (used to undo a test mutation).
 * Searches Shufersal for the query, picks the first result, writes to standingList.
 *
 * Usage: npx tsx scripts/restore-standing-item.ts <uid> "<query>" [storeId]
 */
import { loadEnv } from './_load-env'
loadEnv()
;(process.env as { NODE_ENV?: string }).NODE_ENV = process.env.NODE_ENV || 'development'

const UID = process.argv[2]
const QUERY = process.argv[3]
const STORE = process.argv[4] || 'shufersal'
if (!UID || !QUERY) { console.error('uid and query required'); process.exit(1) }

async function main() {
  const admin = await import('firebase-admin')
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON!)) })
  const { search } = await import('../app/services/grocery/shufersalClient')
  const { addToStoreStanding } = await import('../app/services/grocery/groceryStoreMulti')

  const results = await search(UID, QUERY)
  console.log(`Search "${QUERY}" → ${results.length} results`)
  for (let i = 0; i < Math.min(5, results.length); i++) {
    console.log(`  [${i}] ${results[i].name} | ${results[i].brand} — ${results[i].price} (${results[i].catalogId})`)
  }
  if (results.length === 0) { console.error('No results, cannot restore'); process.exit(1) }

  const pick = results[0]
  await addToStoreStanding(UID, STORE as any, [{ name: pick.name, qty: 1, catalogId: pick.catalogId }])
  console.log(`✓ Restored: ${pick.name} (${pick.catalogId}) to standing list of ${STORE}`)
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
