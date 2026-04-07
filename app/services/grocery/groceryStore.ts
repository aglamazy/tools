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
    const existing = findExisting(data.standingList, item)
    if (existing) {
      existing.qty = item.qty
      existing.name = item.name
      if (item.catalogId) existing.catalogId = item.catalogId
      if (item.unit) existing.unit = item.unit
    } else {
      data.standingList.push(item)
    }
  }
  data.standingList = deduplicateItems(data.standingList)
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
    const existing = findExisting(data.pendingChanges.add, item)
    if (existing) {
      existing.qty = item.qty
      existing.name = item.name
      if (item.catalogId) existing.catalogId = item.catalogId
      if (item.unit) existing.unit = item.unit
    } else {
      data.pendingChanges.add.push(item)
    }
  }
  data.pendingChanges.add = deduplicateItems(data.pendingChanges.add)
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

export async function movePendingToStanding(uid: string, names: string[]): Promise<{ moved: GroceryItem[] }> {
  const data = await getGroceryData(uid)
  const lowerNames = names.map(n => n.toLowerCase())
  const toMove: GroceryItem[] = []
  const remaining: GroceryItem[] = []

  for (const item of data.pendingChanges.add) {
    if (lowerNames.some(n => item.name.toLowerCase().includes(n))) {
      toMove.push(item)
    } else {
      remaining.push(item)
    }
  }

  if (toMove.length === 0) return { moved: [] }

  for (const item of toMove) {
    const existing = findExisting(data.standingList, item)
    if (existing) {
      existing.qty = item.qty
      existing.name = item.name
      if (item.catalogId) existing.catalogId = item.catalogId
      if (item.unit) existing.unit = item.unit
    } else {
      data.standingList.push({ ...item })
    }
  }

  data.standingList = deduplicateItems(data.standingList)
  data.pendingChanges.add = remaining
  data.updatedAt = now()
  await docRef(uid).set(data)
  return { moved: toMove }
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

/** Match item by catalogId (preferred) or name fallback. */
export function findExisting(list: GroceryItem[], item: GroceryItem): GroceryItem | undefined {
  if (item.catalogId) {
    const byCatalog = list.find(i => i.catalogId === item.catalogId)
    if (byCatalog) return byCatalog
  }
  return list.find(i => i.name === item.name)
}

/** Deduplicate items by catalogId — later entries win. */
export function deduplicateItems(items: GroceryItem[]): GroceryItem[] {
  const seen = new Map<string, number>() // catalogId → index in result
  const result: GroceryItem[] = []
  for (const item of items) {
    if (item.catalogId && seen.has(item.catalogId)) {
      // Replace earlier entry with this one (keeps position)
      result[seen.get(item.catalogId)!] = item
    } else {
      if (item.catalogId) seen.set(item.catalogId, result.length)
      result.push(item)
    }
  }
  return result
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
    const existing = findExisting(merged, item)
    if (existing) {
      existing.qty = item.qty
      existing.name = item.name
      if (item.catalogId) existing.catalogId = item.catalogId
      if (item.unit) existing.unit = item.unit
    } else {
      merged.push({ ...item })
    }
  }

  return merged
}
