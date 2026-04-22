/**
 * Pure grocery types + helpers — safe to import from client components.
 *
 * groceryStore.ts brings in firebase-admin (server-only). Anything the client
 * needs to know about the shape of grocery data must live here instead, or the
 * admin module (and its Node built-ins like child_process) leaks into the
 * browser bundle.
 */

export interface GroceryItem {
  name: string
  catalogId?: string
  sellingUnitId?: number
  qty: number
  unit?: string
}

export function itemKey(item: GroceryItem): string {
  return item.catalogId || item.name
}

export type GroceryItemMap = Record<string, GroceryItem>

/**
 * Pending-change entries (2026-04-21 validTo redesign).
 *
 * Every add/remove carries an optional expiry:
 * - `validTo` absent → single-shot (applies to next order only, cleared after checkout)
 * - `validTo` present (ISO date) → applies to every order until `validTo <= now`
 *
 * Enables natural Hebrew like "תוריד את החלב לשבועיים הקרובים" →
 * `remove["חלב"] = { name: "חלב", requestedAt, validTo: now+14d }`.
 */
export interface PendingAddEntry {
  item: GroceryItem
  requestedAt: string
  /** ISO date (YYYY-MM-DD) or ISO datetime. Absent = single-shot. */
  validTo?: string
}

export interface PendingRemoveEntry {
  /** The item name or key being removed from the checkout merge. */
  name: string
  requestedAt: string
  /** ISO date (YYYY-MM-DD) or ISO datetime. Absent = single-shot. */
  validTo?: string
}

export interface PendingChanges {
  add: Record<string, PendingAddEntry>
  /** Keyed by a stable form of the removed name so we can carry validTo per entry. */
  remove: Record<string, PendingRemoveEntry>
}

export interface OrderCycle {
  status: 'draft' | 'active' | 'review' | 'locked' | 'delivered' | 'failed'
  orderId?: string
  slot?: { day: string; date: string; time: string }
  createdAt: string
  updatedAt: string
  /** `${uid}|${storeId}|${cycleDate}` — set after successful checkout to block duplicate runs. */
  idempotencyKey?: string
  /** ISO timestamp of the currently-running checkout. Cleared on success/failure. 10-min TTL. */
  lockedAt?: string
  /** Short error message from the last failed attempt. */
  lastError?: string
  /** Number of checkout attempts within the current cycle. */
  attempts?: number
}

export interface DeliverySlot {
  day: string
  time: string
}

export interface GrocerySchedule {
  orderDay: number
  preferredSlot: DeliverySlot
  reviewReminderHours: number
}

export interface GroceryData {
  standingList: GroceryItemMap
  pendingChanges: PendingChanges
  orderCycle: OrderCycle | null
  schedule: GrocerySchedule | null
  updatedAt: string
}
