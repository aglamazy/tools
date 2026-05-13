/**
 * Probe: place a tiny test order, fetch /cart/cartFromOrder/<id>, dump first 2KB,
 * then cancel. Used to diagnose why orderLoadToCart returns 0 items.
 *
 * Usage: npx tsx scripts/probe-cart-from-order.ts <uid>
 */
import { loadEnv } from './_load-env'
loadEnv()
;(process.env as { NODE_ENV?: string }).NODE_ENV = process.env.NODE_ENV || 'development'

import * as admin from 'firebase-admin'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON!)) })

import { ordersList, _debugFetchHtml } from '../app/services/grocery/shufersalClient'

const UID = process.argv[2]
if (!UID) { console.error('uid required'); process.exit(1) }

async function main() {
  const orders = await ordersList(UID)
  const cancelable = orders.find(o => o.cancelable) || orders[0]
  if (!cancelable) {
    console.log('No orders found')
    process.exit(0)
  }
  console.log(`Probing order #${cancelable.orderId}`)
  const { status, html } = await _debugFetchHtml(UID, `/cart/cartFromOrder/${cancelable.orderId}`)
  console.log(`status=${status} length=${html.length}`)
  console.log(`--- first 1500 chars ---`)
  console.log(html.slice(0, 1500))
  console.log(`--- snippet around 'miglog-prod' ---`)
  const idx = html.indexOf('miglog-prod')
  console.log(idx >= 0 ? html.slice(Math.max(0, idx - 200), idx + 600) : '(not found)')
  console.log(`--- snippet around 'data-product' ---`)
  const idx2 = html.indexOf('data-product')
  console.log(idx2 >= 0 ? html.slice(Math.max(0, idx2 - 100), idx2 + 400) : '(not found)')
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
