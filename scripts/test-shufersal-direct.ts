/**
 * Phase 1: direct Shufersal HTTP-client tests, no LLM in the loop.
 *
 * Steps:
 *   1. Auth/session check
 *   2. cartRead (baseline)
 *   3. search → pick first result
 *   4. cartAdd → cartRead → verify
 *   5. cartRemove → cartRead → verify
 *   6. listSlots → confirm a May-6 slot exists
 *   7. checkout with merged standing+pending → place real order for May 6
 *   8. ordersList + orderLoadToCart → verify items match expected
 *   9. cancelOrder → ordersList → verify cancelled
 *
 * Usage: npx tsx scripts/test-shufersal-direct.ts <uid> [--skip-place]
 */
import { loadEnv } from './_load-env'
loadEnv()
;(process.env as { NODE_ENV?: string }).NODE_ENV = process.env.NODE_ENV || 'development'

import * as admin from 'firebase-admin'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON!)) })

// Lazy import after admin init
import {
  cartRead, search, cartAdd, cartRemove, listSlots, checkout,
  ordersList, orderLoadToCart, cancelOrder, getAuthenticatedCookies,
} from '../app/services/grocery/shufersalClient'

interface ItemEntry { name: string; qty: number; catalogId?: string; sellingUnitId?: number }
interface PendingAdd { item: ItemEntry; validTo?: string }
interface PendingRemove { name: string; validTo?: string }

const UID = process.argv[2]
const SKIP_PLACE = process.argv.includes('--skip-place')
if (!UID) { console.error('Usage: npx tsx scripts/test-shufersal-direct.ts <uid> [--skip-place]'); process.exit(1) }

const TARGET_DATE = '06/05'   // dd/mm — May 6
const TARGET_DAY  = TARGET_DATE  // pass DD/MM to checkout (Hebrew day name is ambiguous — same name appears multiple weeks)
const TARGET_TIME_HINT = '15:00' // exact time string from slot list

const results: { step: string; status: 'PASS' | 'FAIL' | 'SKIP'; note?: string }[] = []

function record(step: string, status: 'PASS' | 'FAIL' | 'SKIP', note?: string) {
  results.push({ step, status, note })
  const color = status === 'PASS' ? '\x1b[32m' : status === 'FAIL' ? '\x1b[31m' : '\x1b[33m'
  console.log(`${color}[${status}]\x1b[0m ${step}${note ? ` — ${note}` : ''}`)
}

async function fetchExpectedList() {
  const db = admin.firestore()
  const ref = db.collection('groceries').doc(UID).collection('stores').doc('shufersal')
  const snap = await ref.get()
  const data = snap.data() as any
  const standing = Object.values(data.standingList || {}) as ItemEntry[]
  const pendAdd = Object.values(data.pendingChanges?.add || {}) as PendingAdd[]
  const pendRem = Object.values(data.pendingChanges?.remove || {}) as PendingRemove[]
  // mergeList logic mirror: standing − fuzzy(remove) + pending(add)
  const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase()
  const removeSet = new Set(pendRem.map(r => norm(r.name)))
  const surviving = standing.filter(s => !Array.from(removeSet).some(r => norm(s.name).includes(r) || r.includes(norm(s.name))))
  const merged = [...surviving]
  for (const a of pendAdd) merged.push(a.item)
  return { standing, pendAdd, pendRem, merged }
}

async function main() {
  console.log(`\n=== Phase 1: Direct Shufersal API tests ===`)
  console.log(`uid=${UID}  target=${TARGET_DAY} ${TARGET_DATE}  skipPlace=${SKIP_PLACE}\n`)

  // 1. Auth
  try {
    const cookies = await getAuthenticatedCookies(UID)
    record('auth', Object.keys(cookies).length > 0 ? 'PASS' : 'FAIL', `${Object.keys(cookies).length} cookies`)
  } catch (e: any) { record('auth', 'FAIL', e.message); return }

  // 2. cartRead baseline
  let baselineCart: any[] = []
  try {
    baselineCart = await cartRead(UID)
    record('cartRead baseline', 'PASS', `${baselineCart.length} items`)
  } catch (e: any) { record('cartRead baseline', 'FAIL', e.message) }

  // 3. search
  let searchHit: { catalogId: string; name: string } | undefined
  try {
    const r = await search(UID, 'חלב 3% תנובה')
    searchHit = r[0]
    record('search "חלב 3% תנובה"', searchHit ? 'PASS' : 'FAIL', searchHit ? `${searchHit.name} (${searchHit.catalogId})` : 'no results')
  } catch (e: any) { record('search', 'FAIL', e.message) }

  // 4. cartAdd → cartRead → verify
  let addedEntry: string | null = null
  if (searchHit) {
    try {
      await cartAdd(UID, searchHit.catalogId, 1)
      const cart = await cartRead(UID)
      const found = cart.find(c => c.catalogId === searchHit!.catalogId)
      addedEntry = found?.entryNumber || null
      record('cartAdd + verify', found ? 'PASS' : 'FAIL', `cart=${cart.length} entry=${addedEntry}`)
    } catch (e: any) { record('cartAdd', 'FAIL', e.message) }
  }

  // 5. cartRemove → verify
  if (addedEntry) {
    try {
      await cartRemove(UID, addedEntry)
      const cart = await cartRead(UID)
      const stillThere = cart.find(c => c.entryNumber === addedEntry)
      record('cartRemove + verify', stillThere ? 'FAIL' : 'PASS', `cart=${cart.length}`)
    } catch (e: any) { record('cartRemove', 'FAIL', e.message) }
  } else {
    record('cartRemove + verify', 'SKIP', 'no entry to remove')
  }

  // 6. listSlots — confirm May 6
  let mayDayAvailable = false
  try {
    const slotDays = await listSlots(UID)
    const may6 = slotDays.find(d => d.date === TARGET_DATE)
    mayDayAvailable = !!may6 && may6.slots.length > 0
    record(`listSlots → ${TARGET_DAY} ${TARGET_DATE}`, mayDayAvailable ? 'PASS' : 'FAIL',
      may6 ? `${may6.slots.length} slots: ${may6.slots.map(s => s.time).join(', ')}` : 'date not in slot list')
  } catch (e: any) { record('listSlots', 'FAIL', e.message) }

  // 7. Compute expected list and place order
  let placedOrderId: string | undefined
  if (SKIP_PLACE) {
    record('placeOrder', 'SKIP', '--skip-place flag')
  } else if (!mayDayAvailable) {
    record('placeOrder', 'SKIP', `${TARGET_DATE} not available`)
  } else {
    try {
      const expected = await fetchExpectedList()
      console.log(`\n  expected merged list (${expected.merged.length}): ${expected.merged.map(i => i.name).join(', ')}`)
      const items = expected.merged.filter(i => i.catalogId).map(i => ({ code: i.catalogId!, qty: i.qty, sellingUnitId: i.sellingUnitId }))
      console.log(`  with catalogId: ${items.length}/${expected.merged.length}`)
      if (items.length === 0) {
        record('placeOrder', 'FAIL', 'no items have catalogId')
      } else {
        const result = await checkout(UID, items, { day: TARGET_DAY, time: TARGET_TIME_HINT })
        if (result.success) {
          placedOrderId = result.orderId
          record('placeOrder', 'PASS', `#${result.orderId} → ${result.deliveryWindow?.day} ${result.deliveryWindow?.date} ${result.deliveryWindow?.time}`)
        } else {
          record('placeOrder', 'FAIL', result.error || 'unknown')
        }
      }
    } catch (e: any) { record('placeOrder', 'FAIL', e.message) }
  }

  // 8. List order, verify items
  if (placedOrderId) {
    try {
      const orders = await ordersList(UID)
      const ours = orders.find(o => o.orderId === placedOrderId)
      record('ordersList contains placed order', ours ? 'PASS' : 'FAIL', ours ? `cancelable=${ours.cancelable}` : 'order not found')
      // orderLoadToCart populates the session-cart as a side effect; items are read via cartRead.
      await orderLoadToCart(UID, placedOrderId)
      const items = await cartRead(UID)
      const expected = await fetchExpectedList()
      const inOrder = new Set(items.map(i => i.catalogId))
      const expectedIds = new Set(expected.merged.filter(i => i.catalogId).map(i => i.catalogId!))
      const missing = [...expectedIds].filter(id => !inOrder.has(id))
      const extra = [...inOrder].filter(id => !expectedIds.has(id))
      record('order items match expected', missing.length === 0 && extra.length === 0 ? 'PASS' : 'FAIL',
        `${items.length} items in order; missing=${missing.length} extra=${extra.length}`)
      if (missing.length > 0) console.log(`    missing: ${missing.join(', ')}`)
      if (extra.length > 0) console.log(`    extra: ${extra.join(', ')}`)
    } catch (e: any) { record('order verification', 'FAIL', e.message) }
  } else {
    record('order verification', 'SKIP', 'no order placed')
  }

  // 9. Cancel
  if (placedOrderId) {
    try {
      const ok = await cancelOrder(UID, placedOrderId)
      record('cancelOrder', ok ? 'PASS' : 'FAIL')
      const orders = await ordersList(UID)
      const ours = orders.find(o => o.orderId === placedOrderId)
      record('order no longer cancelable', !ours || !ours.cancelable ? 'PASS' : 'FAIL', ours ? `still cancelable=${ours.cancelable}` : 'order gone from list')
    } catch (e: any) { record('cancelOrder', 'FAIL', e.message) }
  } else {
    record('cancelOrder', 'SKIP', 'no order to cancel')
  }

  // Summary
  const pass = results.filter(r => r.status === 'PASS').length
  const fail = results.filter(r => r.status === 'FAIL').length
  const skip = results.filter(r => r.status === 'SKIP').length
  console.log(`\n=== Summary: ${pass} pass / ${fail} fail / ${skip} skip ===`)
  process.exit(fail > 0 ? 1 : 0)
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
