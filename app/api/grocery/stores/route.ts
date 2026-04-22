// CALLER-KEYED ROUTE — per-user grocery store data for the /app/stores page.
/**
 * GET  /api/grocery/stores                                  → list registered stores + per-store data (standing, pending, schedule, orderCycle, history)
 * POST /api/grocery/stores  body:{store,action,...}         → mutate standing/pending lists
 *
 * Actions:
 *   addStanding     body:{store, item: GroceryItem}
 *   removeStanding  body:{store, name: string}
 *   addPending      body:{store, item: GroceryItem}
 *   removePending   body:{store, name: string}
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/app/lib/apiGuard'
import { initStores } from '@/app/services/grocery/initStores'
import { getAllStores } from '@/app/services/grocery/storeRegistry'
import {
  getStoreData,
  addToStoreStanding,
  removeFromStoreStanding,
  addStorePendingItems,
  removeStorePendingItems,
  clearStorePending,
  setStoreOrderCycle,
} from '@/app/services/grocery/groceryStoreMulti'
import type { GroceryItem } from '@/app/services/grocery/groceryStore'
import type { StoreOrder } from '@/app/services/grocery/storeTypes'
import { withTimeout } from '@/app/services/grocery/timeoutUtil'

export const maxDuration = 60

interface StoreInfoPayload {
  id: string
  label: string
  data: ReturnType<typeof serializeStoreData> | Awaited<ReturnType<typeof getStoreData>>
  history: { name: string; catalogId?: string; unit?: string; source: 'standing' | 'pending' | 'order'; lastSeen?: string }[]
  historyError?: string
  activeOrders: StoreOrder[]
}

function serializeStoreData(data: Awaited<ReturnType<typeof getStoreData>>) {
  return data
}

/** Best-effort aggregate of known products for this user at this store.
 *  Deduped by catalogId || name. Source lets the UI show provenance.
 *  Also returns the store's active orders (empty if unauthed / error). */
async function buildHistory(
  storeId: string,
  uid: string,
  data: Awaited<ReturnType<typeof getStoreData>>,
): Promise<{ history: StoreInfoPayload['history']; activeOrders: StoreOrder[]; error?: string }> {
  const byKey = new Map<string, StoreInfoPayload['history'][number]>()
  const key = (name: string, catalogId?: string) => (catalogId || name).toLowerCase()

  // Standing items: always known
  for (const item of Object.values(data.standingList)) {
    const k = key(item.name, item.catalogId)
    if (!byKey.has(k)) byKey.set(k, { name: item.name, catalogId: item.catalogId, unit: item.unit, source: 'standing' })
  }
  // Pending-add items
  for (const entry of Object.values(data.pendingChanges.add)) {
    const item = entry.item
    const k = key(item.name, item.catalogId)
    if (!byKey.has(k)) byKey.set(k, { name: item.name, catalogId: item.catalogId, unit: item.unit, source: 'pending' })
  }

  // Active orders (best-effort: requires auth with the store; may fail if not logged in)
  let error: string | undefined
  let activeOrders: StoreOrder[] = []
  try {
    const { getStore } = await import('@/app/services/grocery/storeRegistry')
    const plugin = getStore(storeId)
    if (plugin) {
      // 5s timeout — isAuthenticated should be quick. On timeout, treat as unauthed.
      const authed = await withTimeout(
        plugin.isAuthenticated(uid),
        5_000,
        `isAuthenticated store=${storeId}`,
      ).catch(() => false)
      if (authed) {
        try {
          // 15s API-layer budget — Shufersal's internal socket timeout is 30s, and
          // two stores in parallel can tip the 60s maxDuration.
          activeOrders = await withTimeout(
            plugin.listOrders(uid),
            15_000,
            `listOrders store=${storeId}`,
          )
          for (const o of activeOrders) {
            for (const it of o.items) {
              const k = key(it.name)
              if (!byKey.has(k)) {
                byKey.set(k, {
                  name: it.name,
                  source: 'order',
                  lastSeen: o.delivery?.date || undefined,
                })
              }
            }
          }
        } catch (listErr) {
          const msg = listErr instanceof Error ? listErr.message : String(listErr)
          error = /timeout after /.test(msg) ? 'timeout' : msg
          activeOrders = []
          console.log(`[grocery/stores] listOrders failed for ${storeId}:`, msg)
        }
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
    console.log(`[grocery/stores] history fetch failed for ${storeId}:`, error)
  }

  return { history: Array.from(byKey.values()), activeOrders, error }
}

export async function GET(request: NextRequest) {
  const guard = await requireAuth(request)
  if (guard.error) return guard.error

  initStores()
  const stores = getAllStores()

  const payload: StoreInfoPayload[] = await Promise.all(
    stores.map(async (s) => {
      const data = await getStoreData(guard.uid, s.id)
      const { history, activeOrders, error } = await buildHistory(s.id, guard.uid, data)
      return {
        id: s.id,
        label: s.label,
        data,
        history,
        activeOrders,
        historyError: error,
      }
    }),
  )

  return NextResponse.json({ success: true, stores: payload })
}

export async function POST(request: NextRequest) {
  const guard = await requireAuth(request)
  if (guard.error) return guard.error

  initStores()
  const body = await request.json().catch(() => ({})) as {
    store?: string
    action?: string
    item?: GroceryItem
    name?: string
    orderId?: string
  }
  const { store, action, item, name, orderId } = body
  if (!store || !action) {
    return NextResponse.json({ success: false, error: 'store and action required' }, { status: 400 })
  }

  try {
    switch (action) {
      case 'cancelOrder': {
        if (!orderId) return NextResponse.json({ success: false, error: 'orderId required' }, { status: 400 })
        const { getStore } = await import('@/app/services/grocery/storeRegistry')
        const plugin = getStore(store)
        if (!plugin) return NextResponse.json({ success: false, error: `unknown store: ${store}` }, { status: 400 })
        const ok = await plugin.cancelOrder(guard.uid, orderId)
        return NextResponse.json({ success: ok, error: ok ? undefined : 'store did not confirm cancel' })
      }
      case 'clearPending': {
        await clearStorePending(guard.uid, store)
        const fresh = await getStoreData(guard.uid, store)
        return NextResponse.json({ success: true, pendingChanges: fresh.pendingChanges })
      }
      case 'addStanding': {
        if (!item?.name || typeof item.qty !== 'number') {
          return NextResponse.json({ success: false, error: 'item with name+qty required' }, { status: 400 })
        }
        const result = await addToStoreStanding(guard.uid, store, [item])
        return NextResponse.json({ success: true, standingList: result })
      }
      case 'removeStanding': {
        if (!name) return NextResponse.json({ success: false, error: 'name required' }, { status: 400 })
        const result = await removeFromStoreStanding(guard.uid, store, [name])
        return NextResponse.json({ success: true, standingList: result })
      }
      case 'addPending': {
        if (!item?.name || typeof item.qty !== 'number') {
          return NextResponse.json({ success: false, error: 'item with name+qty required' }, { status: 400 })
        }
        const result = await addStorePendingItems(guard.uid, store, [item])
        return NextResponse.json({ success: true, pendingChanges: result })
      }
      case 'removePending': {
        if (!name) return NextResponse.json({ success: false, error: 'name required' }, { status: 400 })
        const result = await removeStorePendingItems(guard.uid, store, [name])
        return NextResponse.json({ success: true, pendingChanges: result })
      }
      default:
        return NextResponse.json({ success: false, error: `unknown action: ${action}` }, { status: 400 })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[grocery/stores] action=${action} error:`, msg)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
