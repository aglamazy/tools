/**
 * Grocery data store — Firestore (open layer, admin-readable).
 * NOT in the encrypted Dexie/backup flow.
 *
 * Collection: groceries/{uid}
 */

import { getAdminFirestore } from '@/app/lib/firebaseAdmin'
import { itemKey } from './groceryTypes'
import type {
  GroceryItem,
  GroceryItemMap,
  PendingChanges,
  PendingAddEntry,
  PendingRemoveEntry,
  OrderCycle,
  OpenOrderCache,
  DeliverySlot,
  GrocerySchedule,
  GroceryData,
} from './groceryTypes'

export { itemKey }
export type {
  GroceryItem,
  GroceryItemMap,
  PendingChanges,
  PendingAddEntry,
  PendingRemoveEntry,
  OrderCycle,
  OpenOrderCache,
  DeliverySlot,
  GrocerySchedule,
  GroceryData,
}

const COLLECTION = 'groceries'

function docRef(uid: string) {
  return getAdminFirestore().collection(COLLECTION).doc(uid)
}

/** Convert legacy array format to map on read. */
function migrateToMap(raw: GroceryItem[] | GroceryItemMap | undefined): GroceryItemMap {
  if (!raw) return {}
  if (Array.isArray(raw)) {
    const map: GroceryItemMap = {}
    for (const item of raw) map[itemKey(item)] = item
    return map
  }
  return raw
}

/** Read-time migration of legacy pendingChanges shape → validTo shape. */
function migratePendingChanges(raw: unknown): PendingChanges {
  const now = new Date().toISOString()
  const out: PendingChanges = { add: {}, remove: {} }
  if (!raw || typeof raw !== 'object') return out
  const rawObj = raw as { add?: unknown; remove?: unknown }

  if (rawObj.add && typeof rawObj.add === 'object') {
    for (const [key, value] of Object.entries(rawObj.add as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue
      const v = value as Record<string, unknown>
      if (v.item && typeof v.item === 'object') {
        out.add[key] = {
          item: v.item as GroceryItem,
          requestedAt: typeof v.requestedAt === 'string' ? v.requestedAt : now,
          ...(typeof v.validTo === 'string' ? { validTo: v.validTo } : {}),
        }
        continue
      }
      if (typeof v.name === 'string' && typeof v.qty === 'number') {
        out.add[key] = { item: v as unknown as GroceryItem, requestedAt: now }
      }
    }
  }

  if (Array.isArray(rawObj.remove)) {
    for (const name of rawObj.remove) {
      if (typeof name !== 'string' || !name.trim()) continue
      out.remove[name.toLowerCase()] = { name, requestedAt: now }
    }
  } else if (rawObj.remove && typeof rawObj.remove === 'object') {
    for (const [key, value] of Object.entries(rawObj.remove as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue
      const v = value as Record<string, unknown>
      const name = typeof v.name === 'string' ? v.name : key
      out.remove[key] = {
        name,
        requestedAt: typeof v.requestedAt === 'string' ? v.requestedAt : now,
        ...(typeof v.validTo === 'string' ? { validTo: v.validTo } : {}),
      }
    }
  }

  return out
}

// --- Read ---

export async function getGroceryData(uid: string): Promise<GroceryData> {
  const doc = await docRef(uid).get()
  if (!doc.exists) return defaultData()
  const raw = doc.data()!
  return {
    ...raw,
    standingList: migrateToMap(raw.standingList),
    pendingChanges: migratePendingChanges(raw.pendingChanges),
    orderCycle: raw.orderCycle || null,
    schedule: raw.schedule || null,
  } as GroceryData
}

export async function getStandingList(uid: string): Promise<GroceryItemMap> {
  const data = await getGroceryData(uid)
  return data.standingList
}

export async function getPendingChanges(uid: string): Promise<PendingChanges> {
  const data = await getGroceryData(uid)
  return data.pendingChanges
}

/** Get merged list: standing + pending adds - pending removes. */
export async function getMergedList(uid: string): Promise<GroceryItemMap> {
  const data = await getGroceryData(uid)
  return mergeList(data.standingList, data.pendingChanges)
}

// --- Standing list ---

export async function addToStanding(uid: string, items: GroceryItem[]): Promise<GroceryItemMap> {
  const data = await getGroceryData(uid)
  for (const item of items) {
    data.standingList[itemKey(item)] = item
  }
  data.updatedAt = now()
  await docRef(uid).set(data)
  return data.standingList
}

export async function removeFromStanding(uid: string, names: string[]): Promise<GroceryItemMap> {
  const data = await getGroceryData(uid)
  const lowerNames = names.map(n => n.toLowerCase())
  for (const [key, item] of Object.entries(data.standingList)) {
    if (lowerNames.some(n => item.name.toLowerCase().includes(n) || key.toLowerCase().includes(n))) {
      delete data.standingList[key]
    }
  }
  data.updatedAt = now()
  await docRef(uid).set(data)
  return data.standingList
}

// --- Pending changes (this week) ---

export async function addPendingItems(uid: string, items: GroceryItem[], options: { validTo?: string } = {}): Promise<PendingChanges> {
  const data = await getGroceryData(uid)
  const nowIso = now()
  const validTo = validateValidTo(options.validTo)
  for (const item of items) {
    // If it was in remove list, take it out
    for (const [rkey, rentry] of Object.entries(data.pendingChanges.remove)) {
      if (rentry.name.toLowerCase().includes(item.name.toLowerCase())) {
        delete data.pendingChanges.remove[rkey]
      }
    }
    data.pendingChanges.add[itemKey(item)] = {
      item,
      requestedAt: nowIso,
      ...(validTo ? { validTo } : {}),
    }
  }
  data.updatedAt = nowIso
  await docRef(uid).set(data)
  return data.pendingChanges
}

export async function removePendingItems(uid: string, names: string[], options: { validTo?: string } = {}): Promise<PendingChanges> {
  const data = await getGroceryData(uid)
  const lowerNames = names.map(n => n.toLowerCase())
  const nowIso = now()
  const validTo = validateValidTo(options.validTo)

  // Remove from pending adds if there
  for (const [key, entry] of Object.entries(data.pendingChanges.add)) {
    if (lowerNames.some(n => entry.item.name.toLowerCase().includes(n) || key.toLowerCase().includes(n))) {
      delete data.pendingChanges.add[key]
    }
  }

  // Add to remove list (to remove from standing on merge)
  for (const name of names) {
    const key = name.toLowerCase()
    data.pendingChanges.remove[key] = {
      name,
      requestedAt: nowIso,
      ...(validTo ? { validTo } : {}),
    }
  }

  data.updatedAt = nowIso
  await docRef(uid).set(data)
  return data.pendingChanges
}

export async function movePendingToStanding(uid: string, names: string[]): Promise<{ moved: GroceryItem[] }> {
  const data = await getGroceryData(uid)
  const lowerNames = names.map(n => n.toLowerCase())
  const moved: GroceryItem[] = []

  for (const [key, entry] of Object.entries(data.pendingChanges.add)) {
    if (lowerNames.some(n => entry.item.name.toLowerCase().includes(n) || key.toLowerCase().includes(n))) {
      data.standingList[itemKey(entry.item)] = entry.item
      delete data.pendingChanges.add[key]
      moved.push(entry.item)
    }
  }

  if (moved.length === 0) return { moved: [] }

  data.updatedAt = now()
  await docRef(uid).set(data)
  return { moved }
}

export async function clearPending(uid: string): Promise<void> {
  const data = await getGroceryData(uid)
  data.pendingChanges = { add: {}, remove: {} }
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
    standingList: {},
    pendingChanges: { add: {}, remove: {} },
    orderCycle: null,
    schedule: null,
    updatedAt: now(),
  }
}

function now(): string {
  return new Date().toISOString()
}

function validateValidTo(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return undefined
  if (d.getTime() <= Date.now()) return undefined
  return raw
}

export function mergeList(standing: GroceryItemMap, pending: PendingChanges): GroceryItemMap {
  const lowerRemoves = Object.values(pending.remove).map(r => r.name.toLowerCase())
  const merged: GroceryItemMap = {}

  // Standing minus removes
  for (const [key, item] of Object.entries(standing)) {
    if (!lowerRemoves.some(r => item.name.toLowerCase().includes(r) || key.toLowerCase().includes(r))) {
      merged[key] = { ...item }
    }
  }

  // Plus pending adds (overwrites by key = no duplicates)
  for (const [key, entry] of Object.entries(pending.add)) {
    merged[key] = { ...entry.item }
  }

  return merged
}
