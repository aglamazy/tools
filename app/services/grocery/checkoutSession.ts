/**
 * Small-step checkout session state (#275, Agla's call 2026-07-14).
 *
 * A chat-triggered Shufersal order used to build the whole cart (one HTTP
 * round-trip per item, sequential — Shufersal rotates CSRF after every add)
 * inside a single /api/chat call. A 15+ item cart routinely blew the 30s
 * function budget → 504 → the order-safety lock got stuck (finalizeOrderSuccess/
 * Failure never ran) → the NEXT attempt saw "locked-by-other-run".
 *
 * Fix: the frontend (web client or the Telegram webhook's own self-chaining —
 * see checkoutOrchestrator.ts) drives checkout across several small, quick,
 * idempotent calls instead of one big one. This module is the durable state
 * a multi-step checkout needs between those calls: which item-batches are
 * already added, so a retried step is a safe no-op instead of a double-add.
 */

import { getAdminFirestore } from '@/app/lib/firebaseAdmin'
import type { OrderCycle } from './groceryTypes'

const COLLECTION = 'checkoutSessions'
const BATCH_SIZE = 4
// A stuck/abandoned session (client crashed mid-flow) shouldn't block a
// fresh trigger_order forever — same spirit as the 10-min order-safety lock.
const SESSION_TTL_MS = 10 * 60 * 1000

export interface CheckoutSessionItem {
  code: string
  qty: number
  sellingUnitId?: number
}

/** Firestore rejects arrays-of-arrays ("Nested arrays are not allowed") —
 *  each batch is wrapped in an object so `batches` is an array of maps. */
export interface CheckoutBatch {
  items: CheckoutSessionItem[]
}

export interface CheckoutSession {
  id: string
  uid: string
  storeId: string
  status: 'building' | 'ready' | 'done' | 'failed'
  batches: CheckoutBatch[]
  batchesDone: number[]
  day?: string
  time?: string
  idempotencyKey: string
  cycle: OrderCycle | null
  createdAt: string
  updatedAt: string
  result?: { orderId?: string; deliveryWindow?: { day: string; date: string; time: string }; error?: string }
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function ref(uid: string, checkoutId: string) {
  return getAdminFirestore().collection('groceries').doc(uid).collection(COLLECTION).doc(checkoutId)
}

export async function createCheckoutSession(params: {
  uid: string
  storeId: string
  items: CheckoutSessionItem[]
  day?: string
  time?: string
  idempotencyKey: string
  cycle: OrderCycle | null
}): Promise<{ checkoutId: string; totalBatches: number }> {
  const { uid, storeId, items, day, time, idempotencyKey, cycle } = params
  const batches: CheckoutBatch[] = chunk(items, BATCH_SIZE).map(batchItems => ({ items: batchItems }))
  const now = new Date().toISOString()
  const docRef = getAdminFirestore().collection('groceries').doc(uid).collection(COLLECTION).doc()
  const session: Omit<CheckoutSession, 'id'> = {
    uid, storeId, status: 'building', batches, batchesDone: [],
    ...(day ? { day } : {}), ...(time ? { time } : {}),
    idempotencyKey, cycle, createdAt: now, updatedAt: now,
  }
  await docRef.set(JSON.parse(JSON.stringify(session)))
  return { checkoutId: docRef.id, totalBatches: batches.length }
}

export async function getCheckoutSession(uid: string, checkoutId: string): Promise<CheckoutSession | null> {
  const doc = await ref(uid, checkoutId).get()
  if (!doc.exists) return null
  const data = doc.data() as Omit<CheckoutSession, 'id'>
  // Abandoned sessions expire like the order-safety lock does — a stale
  // 'building' session shouldn't block a fresh trigger_order forever.
  if (data.status === 'building' && Date.now() - new Date(data.updatedAt).getTime() > SESSION_TTL_MS) {
    return null
  }
  return { id: doc.id, ...data }
}

/** Idempotent — adding an already-done batch index again is a safe no-op. */
export async function markBatchDone(uid: string, checkoutId: string, batchIndex: number): Promise<CheckoutSession | null> {
  const session = await getCheckoutSession(uid, checkoutId)
  if (!session) return null
  if (!session.batchesDone.includes(batchIndex)) {
    session.batchesDone = [...session.batchesDone, batchIndex]
  }
  const status = session.batchesDone.length >= session.batches.length ? 'ready' : 'building'
  await ref(uid, checkoutId).update({ batchesDone: session.batchesDone, status, updatedAt: new Date().toISOString() })
  return { ...session, status }
}

export async function markSessionResult(
  uid: string, checkoutId: string,
  status: 'done' | 'failed',
  result: CheckoutSession['result'],
): Promise<void> {
  await ref(uid, checkoutId).update({ status, result: result ?? null, updatedAt: new Date().toISOString() })
}

export async function deleteCheckoutSession(uid: string, checkoutId: string): Promise<void> {
  await ref(uid, checkoutId).delete()
}
