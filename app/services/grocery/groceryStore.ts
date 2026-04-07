/**
 * Grocery data store — Firestore (open layer, admin-readable).
 * NOT in the encrypted Dexie/backup flow.
 *
 * Collection: groceries/{uid}
 */

import { getAdminFirestore } from '@/app/lib/firebaseAdmin'

// --- Types ---

export interface GroceryItem {
  name: string
  catalogId?: string   // Shufersal product code (resolved later)
  qty: number
  unit?: string        // e.g. "ק"ג", "יח'", "מארז"
}

export interface PendingChanges {
  add: GroceryItem[]
  remove: string[]     // item names to remove
}

export interface OrderCycle {
  status: 'draft' | 'active' | 'review' | 'locked' | 'delivered'
  orderId?: string     // Shufersal order ID
  slot?: { day: string; date: string; time: string }
  createdAt: string
  updatedAt: string
}

export interface DeliverySlot {
  day: string           // Hebrew day name: "ראשון", "שני", etc.
  time: string          // e.g. "14:00-16:00"
}

export interface GrocerySchedule {
  /** Day of week to open order + checkout (0=Sun .. 6=Sat) */
  orderDay: number
  /** Preferred delivery slot */
  preferredSlot: DeliverySlot
  /** Hours before delivery to send review reminder */
  reviewReminderHours: number
}

export interface GroceryData {
  standingList: GroceryItem[]
  pendingChanges: PendingChanges
  orderCycle: OrderCycle | null
  schedule: GrocerySchedule | null
  updatedAt: string
}

const COLLECTION = 'groceries'

function docRef(uid: string) {
  return getAdminFirestore().collection(COLLECTION).doc(uid)
}

// --- Read ---

export async function getGroceryData(uid: string): Promise<GroceryData> {
  const doc = await docRef(uid).get()
  if (!doc.exists) return defaultData()
  return doc.data() as GroceryData
}

export async function getStandingList(uid: string): Promise<GroceryItem[]> {
  const data = await getGroceryData(uid)
  return data.standingList
}

export async function getPendingChanges(uid: string): Promise<PendingChanges> {
  const data = await getGroceryData(uid)
  return data.pendingChanges
}

/** Get merged list: standing + pending adds - pending removes. */
export async function getMergedList(uid: string): Promise<GroceryItem[]> {
  const data = await getGroceryData(uid)
  return mergeList(data.standingList, data.pendingChanges)
}

// --- Standing list ---

export async function addToStanding(uid: string, items: GroceryItem[]): Promise<GroceryItem[]> {
  const data = await getGroceryData(uid)
  for (const item of items) {
    const existing = data.standingList.find(i => i.name === item.name)
    if (existing) {
      existing.qty = item.qty
    } else {
      data.standingList.push(item)
    }
  }
  data.updatedAt = now()
  await docRef(uid).set(data)
  return data.standingList
}

export async function removeFromStanding(uid: string, names: string[]): Promise<GroceryItem[]> {
  const data = await getGroceryData(uid)
  const lowerNames = names.map(n => n.toLowerCase())
  data.standingList = data.standingList.filter(
    i => !lowerNames.some(n => i.name.toLowerCase().includes(n))
  )
  data.updatedAt = now()
  await docRef(uid).set(data)
  return data.standingList
}

// --- Pending changes (this week) ---

export async function addPendingItems(uid: string, items: GroceryItem[]): Promise<PendingChanges> {
  const data = await getGroceryData(uid)
  for (const item of items) {
    // If it was in remove list, take it out
    data.pendingChanges.remove = data.pendingChanges.remove.filter(
      n => !n.toLowerCase().includes(item.name.toLowerCase())
    )
    const existing = data.pendingChanges.add.find(i => i.name === item.name)
    if (existing) {
      existing.qty = item.qty
    } else {
      data.pendingChanges.add.push(item)
    }
  }
  data.updatedAt = now()
  await docRef(uid).set(data)
  return data.pendingChanges
}

export async function removePendingItems(uid: string, names: string[]): Promise<PendingChanges> {
  const data = await getGroceryData(uid)
  const lowerNames = names.map(n => n.toLowerCase())

  // Remove from pending adds if there
  data.pendingChanges.add = data.pendingChanges.add.filter(
    i => !lowerNames.some(n => i.name.toLowerCase().includes(n))
  )

  // Add to remove list (to remove from standing on merge)
  for (const name of names) {
    if (!data.pendingChanges.remove.includes(name)) {
      data.pendingChanges.remove.push(name)
    }
  }

  data.updatedAt = now()
  await docRef(uid).set(data)
  return data.pendingChanges
}

export async function clearPending(uid: string): Promise<void> {
  const data = await getGroceryData(uid)
  data.pendingChanges = { add: [], remove: [] }
  data.updatedAt = now()
  await docRef(uid).set(data)
}

// --- Order cycle ---

export async function getOrderCycle(uid: string): Promise<OrderCycle | null> {
  const data = await getGroceryData(uid)
  return data.orderCycle
}

export async function setOrderCycle(uid: string, cycle: OrderCycle): Promise<void> {
  const data = await getGroceryData(uid)
  data.orderCycle = cycle
  data.updatedAt = now()
  await docRef(uid).set(data)
}

// --- Schedule ---

export async function getSchedule(uid: string): Promise<GrocerySchedule | null> {
  const data = await getGroceryData(uid)
  return data.schedule
}

export async function setSchedule(uid: string, schedule: GrocerySchedule): Promise<void> {
  const data = await getGroceryData(uid)
  data.schedule = schedule
  data.updatedAt = now()
  await docRef(uid).set(data)
}

// --- Helpers ---

function defaultData(): GroceryData {
  return {
    standingList: [],
    pendingChanges: { add: [], remove: [] },
    orderCycle: null,
    schedule: null,
    updatedAt: now(),
  }
}

function now(): string {
  return new Date().toISOString()
}

export function mergeList(standing: GroceryItem[], pending: PendingChanges): GroceryItem[] {
  const lowerRemoves = pending.remove.map(n => n.toLowerCase())
  const merged: GroceryItem[] = []

  // Standing minus removes
  for (const item of standing) {
    if (!lowerRemoves.some(r => item.name.toLowerCase().includes(r))) {
      merged.push({ ...item })
    }
  }

  // Plus pending adds
  for (const item of pending.add) {
    const existing = merged.find(i => i.name === item.name)
    if (existing) {
      existing.qty = item.qty
    } else {
      merged.push({ ...item })
    }
  }

  return merged
}
