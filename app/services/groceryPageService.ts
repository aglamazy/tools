/**
 * Client-side service for the Stores page.
 * Talks to /api/grocery/stores (auth via Firebase ID token).
 *
 * NOT a Store class in the Dexie sense — grocery data lives in Firestore,
 * and the canonical access is through app/services/grocery/*Store* on the server.
 * This file is the thin client-side wrapper around that API.
 */

import { getIdToken } from './firebaseAuthService'
import type {
  GroceryItem,
  GroceryItemMap,
  PendingChanges,
  OrderCycle,
  GrocerySchedule,
} from './grocery/groceryTypes'
import type { StoreOrder } from './grocery/storeTypes'

export type { StoreOrder } from './grocery/storeTypes'

export interface HistoryEntry {
  name: string
  catalogId?: string
  unit?: string
  source: 'standing' | 'pending' | 'order'
  lastSeen?: string
}

export interface StorePanelData {
  id: string
  label: string
  data: {
    standingList: GroceryItemMap
    pendingChanges: PendingChanges
    orderCycle: OrderCycle | null
    schedule: GrocerySchedule | null
    updatedAt: string
  }
  history: HistoryEntry[]
  historyError?: string
  activeOrders: StoreOrder[]
}

async function authFetch(url: string, options: RequestInit = {}) {
  const idToken = await getIdToken()
  if (!idToken) throw new Error('Not authenticated')
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`,
      ...options.headers,
    },
  })
}

export async function fetchStores(): Promise<StorePanelData[]> {
  const res = await authFetch('/api/grocery/stores')
  const data = await res.json()
  if (!data.success) throw new Error(data.error || 'Failed to load stores')
  return data.stores as StorePanelData[]
}

type MutationResponse = {
  success: boolean
  error?: string
  standingList?: GroceryItemMap
  pendingChanges?: PendingChanges
}

async function mutate(body: Record<string, unknown>): Promise<MutationResponse> {
  const res = await authFetch('/api/grocery/stores', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  const data = await res.json() as MutationResponse
  if (!data.success) throw new Error(data.error || 'Mutation failed')
  return data
}

export function addStanding(store: string, item: GroceryItem) {
  return mutate({ store, action: 'addStanding', item })
}

export function removeStanding(store: string, name: string) {
  return mutate({ store, action: 'removeStanding', name })
}

export function addPending(store: string, item: GroceryItem) {
  return mutate({ store, action: 'addPending', item })
}

export function removePending(store: string, name: string) {
  return mutate({ store, action: 'removePending', name })
}

export async function cancelOrder(store: string, orderId: string): Promise<void> {
  await mutate({ store, action: 'cancelOrder', orderId })
}

export function clearPending(store: string) {
  return mutate({ store, action: 'clearPending' })
}
