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

/**
 * Transient HTTP statuses worth one retry. 401/403/400 are NOT retried —
 * those are auth/validation errors and retrying can't help. This predicate
 * is intentionally named for easy grep — search for `isTransientStatus`.
 */
function isTransientStatus(status: number): boolean {
  return status === 408 || status === 502 || status === 503 || status === 504
}

export async function fetchStores(): Promise<StorePanelData[]> {
  // Single retry for flaky networks / transient upstream errors.
  // Mutations are deliberately NOT retried — double-adding is worse than a toast.
  const MAX_ATTEMPTS = 2
  const RETRY_DELAY_MS = 2000
  let lastErr: unknown

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await authFetch('/api/grocery/stores')
      if (!res.ok && isTransientStatus(res.status) && attempt < MAX_ATTEMPTS) {
        lastErr = new Error(`transient HTTP ${res.status}`)
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS))
        continue
      }
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Failed to load stores')
      return data.stores as StorePanelData[]
    } catch (err) {
      lastErr = err
      // Network-level failure (fetch throws). Retry once.
      if (attempt < MAX_ATTEMPTS) {
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS))
        continue
      }
      throw err
    }
  }
  // Unreachable, but satisfies the type system: the loop either returns or throws.
  throw lastErr instanceof Error ? lastErr : new Error('Failed to load stores')
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
