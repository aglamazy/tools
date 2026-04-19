/**
 * Shufersal store plugin — thin adapter wrapping shufersalClient.ts
 * to conform to the GroceryStorePlugin interface.
 */

import type { CredentialsStorePlugin, StoreSearchResult, StoreCheckoutResult, StoreOrder, StoreOrderItem, StoreSlotDay, CheckoutItem, CheckoutOptions, OrderModification, OrderModificationResult } from './storeTypes'
import {
  search, checkout, ordersList, cancelOrder, listSlots,
  saveCredentials, login as shufersalLogin,
  isCredentialsVerified,
  orderLoadToCart, cartAdd, cartRemove, cartRead, cartMerge, commitCheckout, login,
  preselectSlot,
} from './shufersalClient'

export const shufersalPlugin: CredentialsStorePlugin = {
  id: 'shufersal',
  label: 'שופרסל',
  keywords: ['שופרסל', 'shufersal'],
  authType: 'credentials',

  isAuthenticated: isCredentialsVerified,
  saveCredentials,
  login: async (uid) => { await shufersalLogin(uid) },

  search: async (uid, query): Promise<StoreSearchResult[]> => {
    const results = await search(uid, query)
    return results.map(r => ({
      productId: r.catalogId,
      name: r.name,
      brand: r.brand,
      price: r.price,
      unitPrice: r.unitPrice,
    }))
  },

  checkout: async (uid, items: CheckoutItem[], options: CheckoutOptions): Promise<StoreCheckoutResult> => {
    const shuItems = items.map(i => ({ code: i.code, qty: i.qty }))
    return checkout(uid, shuItems, options)
  },

  listOrders: async (uid): Promise<StoreOrder[]> => {
    const orders = await ordersList(uid)
    return orders.map(o => ({
      orderId: o.orderId,
      status: o.status,
      total: o.total,
      delivery: { date: o.delivery.date, time: o.delivery.time, endTime: o.delivery.endTime },
      itemsCount: o.itemsCount,
      cancelable: o.cancelable,
      items: o.items.map(i => ({ name: i.name, qty: i.qty, price: i.price })),
    }))
  },

  cancelOrder,

  readOrderItems: async (uid, orderId): Promise<StoreOrderItem[]> => {
    // /cart/cartFromOrder/{id} populates the session cart but its response has no
    // product articles — the items are only visible via a subsequent cartRead.
    await orderLoadToCart(uid, orderId)
    const items = await cartRead(uid)
    return items.map(i => ({
      entryRef: i.entryNumber || '',
      productId: i.catalogId,
      name: i.name,
      qty: i.qty,
      price: i.price,
    }))
  },

  modifyOrder: async (uid, orderId, changes: OrderModification): Promise<OrderModificationResult> => {
    // Enter edit-order mode. Fresh session needed — previous successful checkout
    // leaves session in "post-checkout" state where spring auth returns 405.
    // login() reinitialises the session cleanly.
    await login(uid)
    // 1. cartFromOrder loads the order's items into a staging cart
    // 2. cartMerge(toMerge=false) discards user's regular cart and commits the staging cart as the active cart
    // 3. Subsequent /cart/update and /cart/add then modify the order-edit cart
    await orderLoadToCart(uid, orderId)
    await cartMerge(uid, false)

    const loaded = await cartRead(uid)
    const byProduct = new Map<string, { entryNumber: string | null }>()
    for (const i of loaded) byProduct.set(i.catalogId, { entryNumber: i.entryNumber })

    const failed: { ref: string; error: string }[] = []
    let removed = 0
    let added = 0

    for (const ref of changes.remove || []) {
      try {
        const entryNumber = byProduct.get(ref)?.entryNumber || ref
        await cartRemove(uid, entryNumber)
        removed++
      } catch (err) {
        failed.push({ ref, error: err instanceof Error ? err.message : String(err) })
      }
    }

    for (const { productId, qty } of changes.add || []) {
      try {
        await cartAdd(uid, productId, qty)
        added++
      } catch (err) {
        failed.push({ ref: productId, error: err instanceof Error ? err.message : String(err) })
      }
    }

    console.log(`[shufersalPlugin] modifyOrder #${orderId} cart-mutated: added=${added} removed=${removed} failed=${failed.length}`)

    // Optional slot change: preselect the new slot so the commit sets it.
    let commitSlot = null
    if (changes.slot) {
      const pr = await preselectSlot(uid, changes.slot.day, changes.slot.time)
      if (!pr.success) {
        return { added, removed, failed: [...failed, { ref: 'slot', error: pr.error || 'slot not found' }] }
      }
      commitSlot = pr.slot!
    }

    // Commit: run the edit-checkout flow.
    const commit = await commitCheckout(uid, { slot: commitSlot, isEdit: true })
    if (!commit.success) {
      return { added, removed, failed: [...failed, { ref: 'commit', error: commit.error || 'commit failed' }] }
    }
    console.log(`[shufersalPlugin] modifyOrder #${orderId} committed: newOrderId=${commit.orderId}`)
    return { added, removed, failed }
  },

  listSlots: async (uid): Promise<StoreSlotDay[]> => {
    const days = await listSlots(uid)
    return days.map(d => ({
      day: d.day,
      date: d.date,
      slots: d.slots.map(s => ({ day: s.day, date: s.date, time: s.time })),
    }))
  },
}
