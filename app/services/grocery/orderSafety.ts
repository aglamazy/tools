/**
 * Order-safety gate — prevents duplicate/stale automatic orders.
 *
 * The 2026-04-21 11:01 incident placed a 1-line Shufersal order from a stale
 * legacy doc. This helper is the defense-in-depth shared by BOTH the grocery
 * cron and the chat `trigger_order` path, so that ANY logic bug upstream
 * cannot cause a duplicate order.
 *
 * Contract (see CALLER pattern below):
 *
 *   const gate = await preflightOrderSafety({ uid, storeId, plugin, now })
 *   if (gate.skipped) { ...log + user msg; return }
 *   try {
 *     const result = await plugin.checkout(uid, items, options)
 *     await finalizeOrderSafety({ uid, storeId, result, idempotencyKey: gate.idempotencyKey, cycle: gate.cycle, now })
 *   } catch (err) {
 *     await finalizeOrderSafety({ uid, storeId, error: err, idempotencyKey: gate.idempotencyKey, cycle: gate.cycle, now })
 *     throw err
 *   }
 */

import type { GroceryStorePlugin, StoreOrder } from './storeTypes'
import type { OrderCycle } from './groceryTypes'
import { getStoreOrderCycle, setStoreOrderCycle } from './groceryStoreMulti'

const LOCK_TTL_MS = 10 * 60 * 1000
const CYCLE_WINDOW_DAYS = 7

/**
 * Minimum number of lines before we'll place an order.
 * The 2026-04-21 11:01 incident placed a 1-line Shufersal order from a stale
 * legacy doc; the 2026-04-28 incident placed a 1-line order via chat
 * `trigger_order` (cron skipped it correctly, chat path didn't have the guard).
 * Floor enforced for BOTH automatic and user-triggered orders.
 */
export const MIN_ORDER_LINES = 2

export type SizeCheckResult = { ok: true } | { ok: false; reason: string }

/**
 * Reject orders below MIN_ORDER_LINES. Both call sites (cron + chat) must run
 * this before `preflightOrderSafety` so we don't take a lock on a doomed order.
 */
export function checkOrderSize(merged: { catalogId?: string }[]): SizeCheckResult {
  const withId = merged.filter(i => i.catalogId)
  if (merged.length < MIN_ORDER_LINES) {
    return {
      ok: false,
      reason: `רשימה קצרה מדי (${merged.length} פריטים, מינימום ${MIN_ORDER_LINES})`,
    }
  }
  if (withId.length < MIN_ORDER_LINES) {
    return {
      ok: false,
      reason: `מעט מדי פריטים מקושרים (${withId.length}/${merged.length}, מינימום ${MIN_ORDER_LINES})`,
    }
  }
  return { ok: true }
}

export type SafetyDecision =
  | 'already-placed'
  | 'linked-existing'
  | 'locked-by-other-run'
  | 'proceed'

export interface PreflightProceed {
  skipped: false
  decision: 'proceed'
  idempotencyKey: string
  cycle: OrderCycle | null
}

export interface PreflightSkipped {
  skipped: true
  decision: Exclude<SafetyDecision, 'proceed'>
  reason: Exclude<SafetyDecision, 'proceed'>
  orderId?: string
}

export type PreflightResult = PreflightProceed | PreflightSkipped

export interface PreflightParams {
  uid: string
  storeId: string
  plugin: GroceryStorePlugin
  now: Date
}

/**
 * Compute YYYY-MM-DD in Israel time from a Date. Using server local time is
 * fine for our purposes — a 3-hour skew across midnight is an acceptable
 * imprecision given that the whole point is "one order per roughly-a-week".
 */
export function cycleDateFromDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function computeIdempotencyKey(uid: string, storeId: string, cycleDate: string): string {
  return `${uid}|${storeId}|${cycleDate}`
}

/**
 * Does an existing active store order belong to roughly this cycle?
 *
 * The store APIs return delivery date strings in ambiguous formats:
 *   - Shufersal: `DD/MM` (no year)
 *   - Retalix:  `YYYY-MM-DD` or similar (varies)
 *
 * We try ISO first (`YYYY-MM-DD`), then fall back to `DD/MM` assuming the
 * current year with a simple month-rollover: if the parsed month is more than
 * 3 months *behind* "now", bump the year forward. That handles a late-Dec
 * cron placing an order for early-Jan.
 *
 * Returns true if the order's delivery date is within CYCLE_WINDOW_DAYS of
 * `cycleDate`. Accept minor imprecision — the point of this check is "there's
 * already an order for roughly this week, don't place a second one."
 */
export function isForCycle(order: StoreOrder, cycleDate: string, now: Date = new Date()): boolean {
  const raw = order?.delivery?.date?.trim()
  if (!raw) return false

  const parsed = parseDeliveryDate(raw, now)
  if (!parsed) return false

  const cycle = parseISODate(cycleDate)
  if (!cycle) return false

  const diffMs = Math.abs(parsed.getTime() - cycle.getTime())
  const diffDays = diffMs / (24 * 60 * 60 * 1000)
  return diffDays <= CYCLE_WINDOW_DAYS
}

function parseISODate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return isNaN(d.getTime()) ? null : d
}

function parseDeliveryDate(raw: string, now: Date): Date | null {
  // ISO first: 2026-04-22 or 2026-04-22T...
  const iso = parseISODate(raw)
  if (iso) return iso

  // DD/MM (Shufersal) — assume current year; if month is far behind current
  // month, assume the next-year rollover.
  const m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(raw)
  if (!m) return null
  const dd = Number(m[1])
  const mm = Number(m[2])
  let yyyy: number
  if (m[3]) {
    yyyy = Number(m[3])
    if (yyyy < 100) yyyy += 2000
  } else {
    yyyy = now.getFullYear()
    const curMonth = now.getMonth() + 1
    // If parsed month is 4+ months behind current month, assume next year.
    if (mm < curMonth - 3) yyyy += 1
    // If parsed month is 4+ months ahead of current month AND close to Jan,
    // it's probably from last year (rare for deliveries, but cheap to handle).
    else if (mm > curMonth + 9) yyyy -= 1
  }
  const d = new Date(yyyy, mm - 1, dd)
  return isNaN(d.getTime()) ? null : d
}

/**
 * Pre-flight gate — run before `plugin.checkout`.
 * Either returns `{skipped: true, reason}` with a user-facing skip, or
 * `{skipped: false, idempotencyKey, cycle}` after taking the lock.
 *
 * On `{skipped: false}` the caller MUST later call `finalizeOrderSafety` with
 * either `result` (success/fail from checkout) or `error` (thrown) so the
 * lock is cleared.
 */
export async function preflightOrderSafety(params: PreflightParams): Promise<PreflightResult> {
  const { uid, storeId, plugin, now } = params
  const cycle = await getStoreOrderCycle(uid, storeId)
  const cycleDate = cycleDateFromDate(now)
  const idempotencyKey = computeIdempotencyKey(uid, storeId, cycleDate)

  // 1. Already done this cycle?
  if (cycle?.idempotencyKey === idempotencyKey && cycle.status === 'active') {
    return { skipped: true, decision: 'already-placed', reason: 'already-placed', orderId: cycle.orderId }
  }

  // 2. Locked by another run within the last 10min?
  if (cycle?.lockedAt) {
    const lockedMs = now.getTime() - new Date(cycle.lockedAt).getTime()
    if (lockedMs >= 0 && lockedMs < LOCK_TTL_MS) {
      return { skipped: true, decision: 'locked-by-other-run', reason: 'locked-by-other-run' }
    }
  }

  // 3. Pre-flight: does the store already have an active order for this cycle?
  const existing: StoreOrder[] = await plugin.listOrders(uid).catch(() => [])
  const match = existing.find(o => isForCycle(o, cycleDate, now))
  if (match) {
    const nowIso = now.toISOString()
    const linked: OrderCycle = {
      status: 'active',
      orderId: match.orderId,
      slot: {
        day: match.delivery.date,
        date: match.delivery.date,
        time: match.delivery.time,
      },
      idempotencyKey,
      createdAt: cycle?.createdAt ?? nowIso,
      updatedAt: nowIso,
    }
    await setStoreOrderCycle(uid, storeId, linked)
    return { skipped: true, decision: 'linked-existing', reason: 'linked-existing', orderId: match.orderId }
  }

  // 4. Take the lock and proceed.
  const nowIso = now.toISOString()
  const locked: OrderCycle = {
    status: cycle?.status ?? 'draft',
    orderId: cycle?.orderId,
    slot: cycle?.slot,
    idempotencyKey: cycle?.idempotencyKey,
    lastError: cycle?.lastError,
    attempts: cycle?.attempts,
    createdAt: cycle?.createdAt ?? nowIso,
    updatedAt: nowIso,
    lockedAt: nowIso,
  }
  await setStoreOrderCycle(uid, storeId, locked)

  return { skipped: false, decision: 'proceed', idempotencyKey, cycle }
}

export interface FinalizeSuccessParams {
  uid: string
  storeId: string
  idempotencyKey: string
  cycle: OrderCycle | null
  now: Date
  orderId?: string
  slot?: { day: string; date: string; time: string }
}

export interface FinalizeFailureParams {
  uid: string
  storeId: string
  idempotencyKey: string
  cycle: OrderCycle | null
  now: Date
  error: string
}

/** Record successful checkout — clears lock, writes idempotencyKey + orderId. */
export async function finalizeOrderSuccess(params: FinalizeSuccessParams): Promise<void> {
  const { uid, storeId, idempotencyKey, cycle, now, orderId, slot } = params
  const nowIso = now.toISOString()
  const next: OrderCycle = {
    status: 'active',
    orderId,
    slot,
    idempotencyKey,
    createdAt: cycle?.createdAt ?? nowIso,
    updatedAt: nowIso,
    // Cleared:
    lockedAt: undefined,
    lastError: undefined,
    attempts: undefined,
  }
  await setStoreOrderCycle(uid, storeId, next)
}

/** Record failed checkout — clears lock, bumps attempts, sets lastError. */
export async function finalizeOrderFailure(params: FinalizeFailureParams): Promise<void> {
  const { uid, storeId, cycle, now, error } = params
  const nowIso = now.toISOString()
  const next: OrderCycle = {
    status: cycle?.status ?? 'draft',
    orderId: cycle?.orderId,
    slot: cycle?.slot,
    idempotencyKey: cycle?.idempotencyKey,
    createdAt: cycle?.createdAt ?? nowIso,
    updatedAt: nowIso,
    lastError: error,
    attempts: (cycle?.attempts ?? 0) + 1,
    lockedAt: undefined,
  }
  await setStoreOrderCycle(uid, storeId, next)
}
