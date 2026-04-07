/**
 * Shufersal store plugin — thin adapter wrapping shufersalClient.ts
 * to conform to the GroceryStorePlugin interface.
 */

import type { CredentialsStorePlugin, StoreSearchResult, StoreCheckoutResult, StoreOrder, StoreSlotDay, CheckoutItem, CheckoutOptions } from './storeTypes'
import {
  search, checkout, ordersList, cancelOrder, listSlots,
  saveCredentials, login as shufersalLogin,
  isCredentialsVerified,
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

  listSlots: async (uid): Promise<StoreSlotDay[]> => {
    const days = await listSlots(uid)
    return days.map(d => ({
      day: d.day,
      date: d.date,
      slots: d.slots.map(s => ({ day: s.day, date: s.date, time: s.time })),
    }))
  },
}
