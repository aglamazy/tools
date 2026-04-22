/**
 * Multi-store grocery data layer.
 * Wraps groceryStore.ts with store-aware Firestore paths.
 *
 * Data lives at:
 *   groceries/{uid}/stores/{store} → { standingList, pendingChanges, orderCycle, schedule }
 *   groceries/{uid}/meta → { activeStores, defaultStore }
 *
 * Shufersal backward compat: falls back to groceries/{uid} (root doc) if
 * groceries/{uid}/stores/shufersal doesn't exist yet.
 */

import { getAdminFirestore } from '@/app/lib/firebaseAdmin'
import type { StoreType } from './storeTypes'
import type {
  GroceryData,
  GroceryItem,
  GroceryItemMap,
  PendingChanges,
  OrderCycle,
  GrocerySchedule,
} from './groceryStore'
import { itemKey } from './groceryStore'

const COLLECTION = 'groceries'

function storeRef(uid: string, store: StoreType) {
  return getAdminFirestore().collection(COLLECTION).doc(uid)
    .collection('stores').doc(store)
}

function metaRef(uid: string) {
  return getAdminFirestore().collection(COLLECTION).doc(uid)
    .collection('stores').doc('_meta')
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

/**
 * Migrate the pendingChanges field on read (in-memory only — no write-back).
 *
 * Legacy shapes observed in Firestore:
 *   - `add` as `{ [key]: GroceryItem }` (raw item, no wrapper) → wrap into PendingAddEntry
 *   - `remove` as `string[]` → convert each to `{ name, requestedAt, validTo: undefined }`
 *
 * Missing `requestedAt` is backfilled with `now` — the legacy entries never
 * captured a timestamp, so "now" is the best we can do.
 */
function migratePendingChanges(raw: unknown): PendingChanges {
  const now = new Date().toISOString()
  const out: PendingChanges = { add: {}, remove: {} }
  if (!raw || typeof raw !== 'object') return out
  const rawObj = raw as { add?: unknown; remove?: unknown }

  // --- add ---
  if (rawObj.add && typeof rawObj.add === 'object') {
    for (const [key, value] of Object.entries(rawObj.add as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue
      const v = value as Record<string, unknown>
      // New shape: has `item` wrapper
      if (v.item && typeof v.item === 'object') {
        out.add[key] = {
          item: v.item as GroceryItem,
          requestedAt: typeof v.requestedAt === 'string' ? v.requestedAt : now,
          ...(typeof v.validTo === 'string' ? { validTo: v.validTo } : {}),
        }
        continue
      }
      // Legacy: raw GroceryItem (has `name` and `qty`)
      if (typeof v.name === 'string' && typeof v.qty === 'number') {
        out.add[key] = { item: v as unknown as GroceryItem, requestedAt: now }
      }
    }
  }

  // --- remove ---
  if (Array.isArray(rawObj.remove)) {
    // Legacy string[]
    for (const name of rawObj.remove) {
      if (typeof name !== 'string' || !name.trim()) continue
      const key = name.toLowerCase()
      out.remove[key] = { name, requestedAt: now }
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

function defaultData(): GroceryData {
  return {
    standingList: {},
    pendingChanges: { add: {}, remove: {} },
    orderCycle: null,
    schedule: null,
    updatedAt: new Date().toISOString(),
  }
}

// --- Meta ---

export interface UserStoreMeta {
  activeStores: StoreType[]
  defaultStore: StoreType
}

export async function getUserStores(uid: string): Promise<UserStoreMeta> {
  const doc = await metaRef(uid).get()
  if (doc.exists) return doc.data() as UserStoreMeta
  return { activeStores: ['shufersal'], defaultStore: 'shufersal' }
}

export async function setDefaultStore(uid: string, store: StoreType): Promise<void> {
  const meta = await getUserStores(uid)
  if (!meta.activeStores.includes(store)) {
    meta.activeStores.push(store)
  }
  meta.defaultStore = store
  await metaRef(uid).set(meta)
}

export async function addActiveStore(uid: string, store: StoreType): Promise<void> {
  const meta = await getUserStores(uid)
  if (!meta.activeStores.includes(store)) {
    meta.activeStores.push(store)
    await metaRef(uid).set(meta)
  }
}

// --- Store data CRUD ---

export async function getStoreData(uid: string, store: StoreType): Promise<GroceryData> {
  // Try store-specific doc first
  const storeDoc = await storeRef(uid, store).get()
  const raw = storeDoc.exists ? storeDoc.data()! : null

  if (!raw) return defaultData()

  return {
    ...raw,
    standingList: migrateToMap(raw.standingList),
    pendingChanges: migratePendingChanges(raw.pendingChanges),
    orderCycle: raw.orderCycle || null,
    schedule: raw.schedule || null,
  } as GroceryData
}

async function saveStoreData(uid: string, store: StoreType, data: GroceryData): Promise<void> {
  data.updatedAt = new Date().toISOString()
  // Strip undefined values — Firestore rejects them
  await storeRef(uid, store).set(JSON.parse(JSON.stringify(data)))
}

// --- Standing list ---

export async function getStoreStandingList(uid: string, store: StoreType): Promise<GroceryItemMap> {
  const data = await getStoreData(uid, store)
  return data.standingList
}

export async function addToStoreStanding(uid: string, store: StoreType, items: GroceryItem[]): Promise<GroceryItemMap> {
  const data = await getStoreData(uid, store)
  for (const item of items) {
    data.standingList[itemKey(item)] = item
  }
  await saveStoreData(uid, store, data)
  return data.standingList
}

export async function removeFromStoreStanding(uid: string, store: StoreType, names: string[]): Promise<GroceryItemMap> {
  const data = await getStoreData(uid, store)
  const lowerNames = names.map(n => n.toLowerCase())
  for (const [key, item] of Object.entries(data.standingList)) {
    if (lowerNames.some(n => item.name.toLowerCase().includes(n) || key.toLowerCase().includes(n))) {
      delete data.standingList[key]
    }
  }
  await saveStoreData(uid, store, data)
  return data.standingList
}

// --- Pending changes ---

/** Validate a `validTo` string from the LLM/client. Returns a clean ISO string
 *  or undefined. Rejects non-ISO input and dates strictly in the past. */
export function normalizeValidTo(raw: unknown, now: Date = new Date()): string | undefined {
  if (typeof raw !== 'string' || !raw.trim()) return undefined
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return undefined
  if (d.getTime() <= now.getTime()) return undefined
  return raw.length === 10 /* YYYY-MM-DD */ ? raw : d.toISOString()
}

export interface PendingWriteOptions {
  /** ISO date/datetime. Absent → single-shot. Past values are ignored. */
  validTo?: string
}

export async function addStorePendingItems(
  uid: string,
  store: StoreType,
  items: GroceryItem[],
  options: PendingWriteOptions = {},
): Promise<PendingChanges> {
  const data = await getStoreData(uid, store)
  const now = new Date()
  const nowIso = now.toISOString()
  const validTo = normalizeValidTo(options.validTo, now)

  for (const item of items) {
    // Adding overrides a pending-remove for the same item.
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
  await saveStoreData(uid, store, data)
  return data.pendingChanges
}

export async function removeStorePendingItems(
  uid: string,
  store: StoreType,
  names: string[],
  options: PendingWriteOptions = {},
): Promise<PendingChanges> {
  const data = await getStoreData(uid, store)
  const now = new Date()
  const nowIso = now.toISOString()
  const validTo = normalizeValidTo(options.validTo, now)
  const lowerNames = names.map(n => n.toLowerCase())

  // If the item was in pending.add, drop it (user changed their mind).
  for (const [key, entry] of Object.entries(data.pendingChanges.add)) {
    if (lowerNames.some(n => entry.item.name.toLowerCase().includes(n) || key.toLowerCase().includes(n))) {
      delete data.pendingChanges.add[key]
    }
  }
  for (const name of names) {
    const key = name.toLowerCase()
    data.pendingChanges.remove[key] = {
      name,
      requestedAt: nowIso,
      ...(validTo ? { validTo } : {}),
    }
  }
  await saveStoreData(uid, store, data)
  return data.pendingChanges
}

export async function clearStorePending(uid: string, store: StoreType): Promise<void> {
  const data = await getStoreData(uid, store)
  data.pendingChanges = { add: {}, remove: {} }
  await saveStoreData(uid, store, data)
}

/**
 * Post-checkout cleanup: keep only entries whose `validTo` is still in the
 * future. Drop single-shot entries (no validTo) and expired ones.
 *
 * Read-modify-write convenience wrapper for `sweepExpiredPending`.
 */
export async function sweepStorePending(uid: string, store: StoreType, now: Date = new Date()): Promise<PendingChanges> {
  const data = await getStoreData(uid, store)
  data.pendingChanges = sweepExpiredPending(data.pendingChanges, now)
  await saveStoreData(uid, store, data)
  return data.pendingChanges
}

// --- Order cycle ---

export async function getStoreOrderCycle(uid: string, store: StoreType): Promise<OrderCycle | null> {
  const data = await getStoreData(uid, store)
  return data.orderCycle
}

export async function setStoreOrderCycle(uid: string, store: StoreType, cycle: OrderCycle): Promise<void> {
  const data = await getStoreData(uid, store)
  data.orderCycle = cycle
  await saveStoreData(uid, store, data)
}

// --- Schedule ---

export async function getStoreSchedule(uid: string, store: StoreType): Promise<GrocerySchedule | null> {
  const data = await getStoreData(uid, store)
  return data.schedule
}

export async function setStoreSchedule(uid: string, store: StoreType, schedule: GrocerySchedule): Promise<void> {
  const data = await getStoreData(uid, store)
  data.schedule = schedule
  await saveStoreData(uid, store, data)
}

// --- Move pending → standing ---

export async function movePendingToStanding(uid: string, store: StoreType, names: string[]): Promise<{ moved: GroceryItem[] }> {
  const data = await getStoreData(uid, store)
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

  await saveStoreData(uid, store, data)
  return { moved }
}

// --- validTo helpers ---

/**
 * Return only the entries that are active at `now`: `validTo` absent (single-shot)
 * or `validTo > now`. Used before the merge step at checkout so that an expired
 * standing instruction (e.g. "bread off for 2 weeks") stops applying automatically.
 */
export function filterActivePending(pending: PendingChanges, now: Date = new Date()): PendingChanges {
  const nowMs = now.getTime()
  const out: PendingChanges = { add: {}, remove: {} }
  for (const [k, e] of Object.entries(pending.add)) {
    if (!e.validTo || new Date(e.validTo).getTime() > nowMs) out.add[k] = e
  }
  for (const [k, e] of Object.entries(pending.remove)) {
    if (!e.validTo || new Date(e.validTo).getTime() > nowMs) out.remove[k] = e
  }
  return out
}

/**
 * Post-order cleanup: keep only entries whose `validTo` is still in the future.
 * Drop single-shot entries (no validTo — they applied to the order that just
 * finished) and drop expired dated entries.
 */
export function sweepExpiredPending(pending: PendingChanges, now: Date = new Date()): PendingChanges {
  const nowMs = now.getTime()
  const out: PendingChanges = { add: {}, remove: {} }
  for (const [k, e] of Object.entries(pending.add)) {
    if (e.validTo && new Date(e.validTo).getTime() > nowMs) out.add[k] = e
  }
  for (const [k, e] of Object.entries(pending.remove)) {
    if (e.validTo && new Date(e.validTo).getTime() > nowMs) out.remove[k] = e
  }
  return out
}

// --- Merge helper ---

export function mergeStoreList(standing: GroceryItemMap, pending: PendingChanges): GroceryItemMap {
  const lowerRemoves = Object.values(pending.remove).map(r => r.name.toLowerCase())
  const merged: GroceryItemMap = {}
  for (const [key, item] of Object.entries(standing)) {
    if (!lowerRemoves.some(r => item.name.toLowerCase().includes(r) || key.toLowerCase().includes(r))) {
      merged[key] = { ...item }
    }
  }
  for (const [key, entry] of Object.entries(pending.add)) {
    merged[key] = { ...entry.item }
  }
  return merged
}
