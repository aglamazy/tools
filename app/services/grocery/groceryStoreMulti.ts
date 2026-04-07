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
import { findExisting, deduplicateItems, type GroceryData, type GroceryItem, type PendingChanges, type OrderCycle, type GrocerySchedule } from './groceryStore'

const COLLECTION = 'groceries'

function storeRef(uid: string, store: StoreType) {
  return getAdminFirestore().collection(COLLECTION).doc(uid)
    .collection('stores').doc(store)
}

function metaRef(uid: string) {
  return getAdminFirestore().collection(COLLECTION).doc(uid)
    .collection('stores').doc('_meta')
}

function defaultData(): GroceryData {
  return {
    standingList: [],
    pendingChanges: { add: [], remove: [] },
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
  if (storeDoc.exists) return storeDoc.data() as GroceryData

  // Shufersal fallback: read from root doc (pre-migration data)
  if (store === 'shufersal') {
    const rootDoc = await getAdminFirestore().collection(COLLECTION).doc(uid).get()
    if (rootDoc.exists) return rootDoc.data() as GroceryData
  }

  return defaultData()
}

async function saveStoreData(uid: string, store: StoreType, data: GroceryData): Promise<void> {
  data.updatedAt = new Date().toISOString()
  await storeRef(uid, store).set(data)
}

// --- Standing list ---

export async function getStoreStandingList(uid: string, store: StoreType): Promise<GroceryItem[]> {
  const data = await getStoreData(uid, store)
  return data.standingList
}

export async function addToStoreStanding(uid: string, store: StoreType, items: GroceryItem[]): Promise<GroceryItem[]> {
  const data = await getStoreData(uid, store)
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
  await saveStoreData(uid, store, data)
  return data.standingList
}

export async function removeFromStoreStanding(uid: string, store: StoreType, names: string[]): Promise<GroceryItem[]> {
  const data = await getStoreData(uid, store)
  const lowerNames = names.map(n => n.toLowerCase())
  data.standingList = data.standingList.filter(
    i => !lowerNames.some(n => i.name.toLowerCase().includes(n))
  )
  await saveStoreData(uid, store, data)
  return data.standingList
}

// --- Pending changes ---

export async function addStorePendingItems(uid: string, store: StoreType, items: GroceryItem[]): Promise<PendingChanges> {
  const data = await getStoreData(uid, store)
  for (const item of items) {
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
  await saveStoreData(uid, store, data)
  return data.pendingChanges
}

export async function removeStorePendingItems(uid: string, store: StoreType, names: string[]): Promise<PendingChanges> {
  const data = await getStoreData(uid, store)
  const lowerNames = names.map(n => n.toLowerCase())
  data.pendingChanges.add = data.pendingChanges.add.filter(
    i => !lowerNames.some(n => i.name.toLowerCase().includes(n))
  )
  for (const name of names) {
    if (!data.pendingChanges.remove.includes(name)) {
      data.pendingChanges.remove.push(name)
    }
  }
  await saveStoreData(uid, store, data)
  return data.pendingChanges
}

export async function clearStorePending(uid: string, store: StoreType): Promise<void> {
  const data = await getStoreData(uid, store)
  data.pendingChanges = { add: [], remove: [] }
  await saveStoreData(uid, store, data)
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
  await saveStoreData(uid, store, data)
  return { moved: toMove }
}

// --- Merge helper ---

export function mergeStoreList(standing: GroceryItem[], pending: PendingChanges): GroceryItem[] {
  const lowerRemoves = pending.remove.map(n => n.toLowerCase())
  const merged: GroceryItem[] = []
  for (const item of standing) {
    if (!lowerRemoves.some(r => item.name.toLowerCase().includes(r))) {
      merged.push({ ...item })
    }
  }
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
