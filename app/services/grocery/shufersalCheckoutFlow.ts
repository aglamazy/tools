/**
 * Small-step Shufersal checkout (#275, Agla's call 2026-07-14): start →
 * add-batch (× N, idempotent) → finalize. Shared by the chat action
 * (trigger_order, in-process) and the /api/grocery/checkout/* REST endpoints
 * (called by the frontend orchestrator — web client loop or the Telegram
 * webhook's self-chaining, see checkoutOrchestrator.ts).
 *
 * Each step is quick and independently retriable, so no single call risks
 * the 30s function budget, and a killed/retried step can't double-add items
 * or leave the order-safety lock stuck the way the old one-shot flow could.
 */

import { mergeList, type GroceryItem } from './groceryStore'
import { filterActivePending, sweepStorePending } from './groceryStoreMulti'
import { getStoreData } from './groceryStoreMulti'
import { getStore } from './storeRegistry'
import { preflightOrderSafety, finalizeOrderSuccess, finalizeOrderFailure, checkOrderSize } from './orderSafety'
import { cartClear, cartAddMany, finalizeCheckout as shufersalFinalize } from './shufersalClient'
import {
  createCheckoutSession, getCheckoutSession, markBatchDone, markSessionResult, deleteCheckoutSession,
  type CheckoutSession,
} from './checkoutSession'
import { credActionErrorMessage } from '@/app/services/chat/credGuards'
import { CredsCorruptedError } from '@/app/services/security/credEncryption'

const STORE_ID = 'shufersal'

export type StartResult =
  | { ok: true; checkoutId: string; totalBatches: number; storeLabel: string }
  | { ok: false; message: string }
  | { ok: false; requiresAttendedCheckout: true; message: string; items: { code: string; qty: number }[]; day?: string; time?: string }

export type AddBatchResult =
  | { ok: true; completed: number; total: number; ready: boolean }
  | { ok: false; message: string }

export type FinalizeResult =
  | { ok: true; message: string }
  | { ok: false; message: string }
  | { ok: false; requiresAttendedCheckout: true; message: string; items: { code: string; qty: number }[]; day?: string; time?: string }

export async function startShufersalCheckout(uid: string, actionDay?: string, actionTime?: string): Promise<StartResult> {
  const store = getStore(STORE_ID)
  if (!store) return { ok: false, message: 'חנות "שופרסל" לא מוכרת.' }

  const data = await getStoreData(uid, STORE_ID)
  const now = new Date()
  const activePending = filterActivePending(data.pendingChanges, now)
  const merged: GroceryItem[] = Object.values(mergeList(data.standingList, activePending))
  if (merged.length === 0) return { ok: false, message: 'הרשימה ריקה — אין מה להזמין.' }

  const sizeCheck = checkOrderSize(merged)
  if (!sizeCheck.ok) {
    console.warn(`[ShufersalCheckoutFlow] Safety: uid=${uid} decision=size-skip`)
    return { ok: false, message: `⚠️ לא פתחתי הזמנה ב${store.label}: ${sizeCheck.reason}. אפשר להוסיף פריטים ולנסות שוב.` }
  }

  const withId = merged.filter(i => i.catalogId)
  const items = withId.map(i => ({ code: i.catalogId!, qty: i.qty, sellingUnitId: i.sellingUnitId }))

  const schedule = data.schedule
  const day = actionDay || schedule?.preferredSlot.day
  const time = actionTime || schedule?.preferredSlot.time?.split('-')[0]

  // Tier-2: server has no credentials — hand the item list back to the
  // caller for attended (client-side) checkout, same as the old flow.
  if (!(await store.isAuthenticated(uid))) {
    return { ok: false, requiresAttendedCheckout: true, message: `הזמנה ב${store.label} דורשת אימות — מסירה לאפליקציה`, items, day, time }
  }

  const gate = await preflightOrderSafety({ uid, storeId: STORE_ID, plugin: store, now })
  console.log(`[ShufersalCheckoutFlow] Safety: uid=${uid} decision=${gate.decision}`)
  if (gate.skipped) {
    if (gate.decision === 'already-placed') return { ok: false, message: `הזמנה כבר פתוחה השבוע ב${store.label} (#${gate.orderId}).` }
    if (gate.decision === 'linked-existing') return { ok: false, message: `מצאתי הזמנה קיימת ב${store.label} (#${gate.orderId}), סימנתי אותה.` }
    return { ok: false, message: `ריצה אחרת עובדת על ההזמנה ברגע זה. נסה שוב בעוד דקה.` }
  }

  // Everything from here until the session doc is durably written must
  // release the lock on failure — a stuck lock (finalizeOrderFailure never
  // called) was exactly the #275 failure mode this rewrite exists to fix,
  // so this can't be allowed to regress on some OTHER exception either.
  try {
    await cartClear(uid)
    const { checkoutId, totalBatches } = await createCheckoutSession({
      uid, storeId: STORE_ID, items, day, time,
      idempotencyKey: gate.idempotencyKey, cycle: gate.cycle,
    })
    return { ok: true, checkoutId, totalBatches, storeLabel: store.label }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[ShufersalCheckoutFlow] start failed uid=${uid}:`, msg)
    await finalizeOrderFailure({ uid, storeId: STORE_ID, idempotencyKey: gate.idempotencyKey, cycle: gate.cycle, now, error: msg })
    // Server-side credentials exist but can't be decrypted (corrupted, or —
    // as in local dev — SALIKO_CREDS_ENCRYPTION_KEY isn't configured to match
    // whatever encrypted them). That's functionally the same as "no
    // server-side creds": degrade to Tier-2 attended checkout via the
    // client's own Dexie credentials, same as the isAuthenticated-false path
    // above, instead of hard-failing (Agla, 2026-07-14).
    if (err instanceof CredsCorruptedError) {
      return { ok: false, requiresAttendedCheckout: true, message: credActionErrorMessage(err), items, day, time }
    }
    // credActionErrorMessage maps other known error types to their real,
    // actionable Hebrew message instead of a generic one.
    return { ok: false, message: credActionErrorMessage(err) }
  }
}

/** Idempotent — re-adding an already-done batch index is a safe no-op. */
export async function addCheckoutBatch(uid: string, checkoutId: string, batchIndex: number): Promise<AddBatchResult> {
  const session = await getCheckoutSession(uid, checkoutId)
  if (!session) return { ok: false, message: 'הזמנה פגה או לא נמצאה — צריך להתחיל מחדש.' }
  if (batchIndex < 0 || batchIndex >= session.batches.length) {
    return { ok: false, message: 'מספר קבוצה לא תקין.' }
  }

  if (!session.batchesDone.includes(batchIndex)) {
    try {
      await cartAddMany(uid, session.batches[batchIndex].items)
    } catch (err) {
      console.error(`[ShufersalCheckoutFlow] add-batch failed uid=${uid} checkoutId=${checkoutId} batch=${batchIndex}:`, err)
      return { ok: false, message: credActionErrorMessage(err) }
    }
  }

  const updated = await markBatchDone(uid, checkoutId, batchIndex)
  const completed = updated?.batchesDone.length ?? 0
  const total = session.batches.length
  return { ok: true, completed, total, ready: completed >= total }
}

export async function finalizeShufersalCheckoutSession(uid: string, checkoutId: string): Promise<FinalizeResult> {
  const store = getStore(STORE_ID)
  if (!store) return { ok: false, message: 'חנות "שופרסל" לא מוכרת.' }

  const session = await getCheckoutSession(uid, checkoutId)
  if (!session) return { ok: false, message: 'הזמנה פגה או לא נמצאה — צריך להתחיל מחדש.' }
  if (session.batchesDone.length < session.batches.length) {
    return { ok: false, message: `עוד לא כל הפריטים נוספו (${session.batchesDone.length}/${session.batches.length}).` }
  }

  const now = new Date()
  try {
    const result = await shufersalFinalize(uid, { day: session.day, time: session.time, nearest: !session.day })
    console.log(`[ShufersalCheckoutFlow] finalize result uid=${uid} checkoutId=${checkoutId}: ${JSON.stringify(result)}`)
    if (result.success) {
      await finalizeOrderSuccess({
        uid, storeId: STORE_ID, idempotencyKey: session.idempotencyKey, cycle: session.cycle, now,
        orderId: result.orderId, slot: result.deliveryWindow,
      })
      await sweepStorePending(uid, STORE_ID, now)
      await markSessionResult(uid, checkoutId, 'done', { orderId: result.orderId, deliveryWindow: result.deliveryWindow })
      await deleteCheckoutSession(uid, checkoutId)
      return { ok: true, message: `הזמנה בוצעה ב${store.label}! #${result.orderId || ''}\nמשלוח: ${result.deliveryWindow?.day} ${result.deliveryWindow?.date} ${result.deliveryWindow?.time}` }
    }
    if (result.dryRun) {
      await finalizeOrderFailure({ uid, storeId: STORE_ID, idempotencyKey: session.idempotencyKey, cycle: session.cycle, now, error: 'dry-run' })
      await deleteCheckoutSession(uid, checkoutId)
      return { ok: true, message: `דמה-ריצה: לא בוצעה הזמנה אמיתית. חלון משלוח שזוהה: ${result.deliveryWindow?.day} ${result.deliveryWindow?.date} ${result.deliveryWindow?.time}.` }
    }
    await finalizeOrderFailure({ uid, storeId: STORE_ID, idempotencyKey: session.idempotencyKey, cycle: session.cycle, now, error: result.error || 'unknown' })
    await markSessionResult(uid, checkoutId, 'failed', { error: result.error })
    return { ok: false, message: `שגיאה בהזמנה ב${store.label}: ${result.error || 'שגיאה לא ידועה'}` }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const mapped = credActionErrorMessage(err)
    console.error(`[ShufersalCheckoutFlow] finalize threw uid=${uid} checkoutId=${checkoutId}: errorName=${err instanceof Error ? err.constructor.name : typeof err} msg=${msg} mappedMessage=${mapped}`)
    await finalizeOrderFailure({ uid, storeId: STORE_ID, idempotencyKey: session.idempotencyKey, cycle: session.cycle, now, error: msg })
    await markSessionResult(uid, checkoutId, 'failed', { error: msg })
    // Same degrade-to-Tier-2 as startShufersalCheckout: the server-side
    // credential can't be decrypted here, so hand off to the client's own
    // Dexie credentials via attended checkout instead of a hard failure.
    // The items survive in `session.batches` even though this failed after
    // they were already added to the live Shufersal cart with the cached
    // session — attended-checkout logs in fresh and rebuilds the cart itself.
    if (err instanceof CredsCorruptedError) {
      const items = session.batches.flatMap(b => b.items)
      return { ok: false, requiresAttendedCheckout: true, message: mapped, items, day: session.day, time: session.time }
    }
    return { ok: false, message: mapped }
  }
}

export type { CheckoutSession }
