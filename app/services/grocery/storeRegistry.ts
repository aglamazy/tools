/**
 * Store registry — singleton that holds all registered grocery store plugins.
 * The action executor and cron use this to dispatch to the right store.
 *
 * Usage:
 *   import { getStore, getAllStores, resolveStore } from './storeRegistry'
 *   const store = getStore('shufersal')
 *   const store = resolveStore('שופרסל')  // keyword match
 */

import type { GroceryStorePlugin, StoreType } from './storeTypes'

const stores = new Map<StoreType, GroceryStorePlugin>()

export function registerStore(plugin: GroceryStorePlugin): void {
  stores.set(plugin.id, plugin)
}

export function getStore(id: StoreType): GroceryStorePlugin | undefined {
  return stores.get(id)
}

export function getAllStores(): GroceryStorePlugin[] {
  return Array.from(stores.values())
}

/** Resolve store by keyword (Hebrew name, brand, etc.) */
export function resolveStoreByKeyword(text: string): GroceryStorePlugin | undefined {
  const lower = text.toLowerCase()
  for (const store of stores.values()) {
    if (store.keywords.some(kw => lower.includes(kw))) {
      return store
    }
  }
  return undefined
}

/** Get store info summary for LLM context */
export function getStoresContextForLLM(activeStoreIds: StoreType[]): string {
  const lines: string[] = []
  for (const store of stores.values()) {
    const active = activeStoreIds.includes(store.id)
    lines.push(`- ${store.label} (${store.id}): ${active ? 'מחובר' : 'לא מחובר'}`)
  }
  return lines.join('\n')
}
