/**
 * Tier-2 attended Shufersal checkout.
 *
 * The client (browser) supplies Shufersal credentials from its local Dexie
 * store. The server uses them to log in, build the cart, and place the order,
 * then discards the credentials — only the resulting session cookies are
 * persisted (in Firestore, same as Tier-3). The password never enters the
 * business-logic layer (LLM context, action parameters, cron, etc.).
 *
 * Tier-2 invariant upheld: unattended ordering is impossible because the
 * password is never stored server-side and this route requires an active
 * user session (Firebase auth + the user must physically provide their creds).
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/app/lib/apiGuard'
import { checkoutAttended } from '@/app/services/grocery/shufersalClient'
import { preflightOrderSafety, finalizeOrderSuccess, finalizeOrderFailure, checkOrderSize } from '@/app/services/grocery/orderSafety'
import { sweepStorePending } from '@/app/services/grocery/groceryStoreMulti'
import { getStore } from '@/app/services/grocery/storeRegistry'
import { initStores } from '@/app/services/grocery/initStores'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  const guard = await requireAuth(request)
  if (guard.error) return guard.error

  const uid = guard.uid
  initStores()

  // Parse body — do NOT log the body (contains password).
  let body: {
    email?: unknown
    password?: unknown
    items?: unknown
    day?: unknown
    time?: unknown
    nearest?: unknown
    dryRun?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (!email || !password) {
    return NextResponse.json({ success: false, error: 'email and password required' }, { status: 400 })
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ success: false, error: 'items required' }, { status: 400 })
  }

  const items = (body.items as unknown[]).map((i: unknown) => {
    if (typeof i !== 'object' || i === null) throw new Error('Invalid item')
    const item = i as Record<string, unknown>
    return {
      code: typeof item.code === 'string' ? item.code : String(item.code ?? ''),
      qty: typeof item.qty === 'number' ? item.qty : parseInt(String(item.qty ?? '1'), 10),
    }
  }).filter(i => i.code)

  const day = typeof body.day === 'string' ? body.day : undefined
  const time = typeof body.time === 'string' ? body.time : undefined
  const nearest = typeof body.nearest === 'boolean' ? body.nearest : !day
  const dryRun = body.dryRun === true

  const storeId = 'shufersal'
  const store = getStore(storeId)
  if (!store) return NextResponse.json({ success: false, error: 'Shufersal store not found' }, { status: 500 })

  // Safety gate — same contract as the cron and the standard trigger_order path.
  const safetyNow = new Date()
  let gate: Awaited<ReturnType<typeof preflightOrderSafety>>
  try {
    gate = await preflightOrderSafety({ uid, storeId, plugin: store, now: safetyNow })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[attended-checkout] preflightOrderSafety error:', msg)
    return NextResponse.json({ success: false, error: `Safety check failed: ${msg}` }, { status: 500 })
  }

  if (gate.skipped) {
    const reason =
      gate.decision === 'already-placed' ? `הזמנה כבר פתוחה (#${gate.orderId})`
      : gate.decision === 'linked-existing' ? `הזמנה קיימת מקושרת (#${gate.orderId})`
      : 'ריצה מקבילה בעיצומה'
    return NextResponse.json({ success: false, error: reason, skipped: true })
  }

  // Size check (same floor as cron + trigger_order).
  const sizeCheck = checkOrderSize(items.map(i => ({ catalogId: i.code })))
  if (!sizeCheck.ok) {
    await finalizeOrderFailure({ uid, storeId, idempotencyKey: gate.idempotencyKey, cycle: gate.cycle, now: safetyNow, error: 'size-skip' })
    return NextResponse.json({ success: false, error: sizeCheck.reason }, { status: 422 })
  }

  console.log(`[attended-checkout] uid=${uid} items=${items.length} day=${day || 'any'} nearest=${nearest}`)

  try {
    const result = await checkoutAttended(uid, email, password, items, { day, time, nearest, dryRun })

    if (result.success) {
      await finalizeOrderSuccess({
        uid, storeId, idempotencyKey: gate.idempotencyKey, cycle: gate.cycle, now: safetyNow,
        orderId: result.orderId,
        slot: result.deliveryWindow,
      })
      await sweepStorePending(uid, storeId, safetyNow)
      console.log(`[attended-checkout] uid=${uid} order=#${result.orderId || 'unknown'} success`)
      return NextResponse.json({ success: true, orderId: result.orderId, deliveryWindow: result.deliveryWindow })
    }

    if (result.dryRun) {
      await finalizeOrderFailure({ uid, storeId, idempotencyKey: gate.idempotencyKey, cycle: gate.cycle, now: safetyNow, error: 'dry-run' })
      return NextResponse.json({ success: false, dryRun: true, deliveryWindow: result.deliveryWindow })
    }

    await finalizeOrderFailure({ uid, storeId, idempotencyKey: gate.idempotencyKey, cycle: gate.cycle, now: safetyNow, error: result.error || 'unknown' })
    console.error(`[attended-checkout] uid=${uid} checkout failed: ${result.error}`)
    return NextResponse.json({ success: false, error: result.error || 'Checkout failed' }, { status: 422 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await finalizeOrderFailure({ uid, storeId, idempotencyKey: gate.idempotencyKey, cycle: gate.cycle, now: safetyNow, error: msg }).catch(() => {})
    console.error(`[attended-checkout] uid=${uid} error:`, msg)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
