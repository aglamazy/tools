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

export interface PendingChanges {
  add: GroceryItemMap
  remove: string[]
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
