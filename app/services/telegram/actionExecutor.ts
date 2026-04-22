/**
 * Execute chat actions against the grocery store and task queue.
 * Returns a follow-up message if the action produces data to show.
 */

import type { ChatAction } from './chatProcessor'
import { filterSearchResults } from './chatProcessor'
import { getAdminFirestore } from '@/app/lib/firebaseAdmin'
import {
  mergeList,
  type GroceryItem,
  type GrocerySchedule,
} from '@/app/services/grocery/groceryStore'
import { filterActivePending, sweepStorePending, normalizeValidTo } from '@/app/services/grocery/groceryStoreMulti'
import {
  saveCredentials,
  setCredentialsVerified,
  login as shufersalLogin,
  cartAdd,
  cartRead,
  cartRemove,
  orderLoadToCart,
} from '@/app/services/grocery/shufersalClient'
import { sendOtp, verifyOtp, saveRetalixCredentials } from '@/app/services/grocery/retalixClient'
import { getStore, getAllStores } from '@/app/services/grocery/storeRegistry'
import { getUserStores, setDefaultStore, addActiveStore, getStoreData, addToStoreStanding, addStorePendingItems, removeFromStoreStanding, removeStorePendingItems, clearStorePending, movePendingToStanding as moveStorePendingToStanding, getStoreSchedule, setStoreSchedule } from '@/app/services/grocery/groceryStoreMulti'
import type { OtpStorePlugin, CredentialsStorePlugin, StoreOrder } from '@/app/services/grocery/storeTypes'
import { preflightOrderSafety, finalizeOrderSuccess, finalizeOrderFailure } from '@/app/services/grocery/orderSafety'

import { listTasks, createTask, updateTask, deleteTask, findTasks } from '@/app/services/taskFirestoreService'
import { randomBytes } from 'crypto'
import { deleteMapping, lookupMapping, saveProductMapping } from '@/app/services/grocery/productResolver'

/** Actions that require a connected store */
const STORE_ACTIONS = new Set(['trigger_order', 'cancel_order', 'search_product', 're_search', 'list_slots', 'product_details'])
// Note: `show_orders` handles its own auth check because it iterates all
// authenticated stores when no store is specified.

/** Resolve which store an action targets */
async function resolveActionStore(uid: string, action: ChatAction, sessionStore?: string | null): Promise<string> {
  if (typeof action.store === 'string') return action.store
  if (sessionStore) return sessionStore
  const meta = await getUserStores(uid)
  return meta.defaultStore
}

// --- Pending search storage (for callback_data 64-byte limit) ---

export async function savePendingSearch(uid: string, selection: PendingProductSelection): Promise<string> {
  const key = randomBytes(3).toString('hex')
  // Strip undefined values — Firestore rejects them
  const clean = JSON.parse(JSON.stringify(selection))
  await getAdminFirestore().collection('groceries').doc(uid)
    .collection('private').doc('pendingSearches').set(
      { [key]: { ...clean, createdAt: new Date().toISOString() } },
      { merge: true },
    )
  return key
}

export async function loadPendingSearch(uid: string, key: string): Promise<PendingProductSelection | null> {
  const doc = await getAdminFirestore().collection('groceries').doc(uid)
    .collection('private').doc('pendingSearches').get()
  if (!doc.exists) return null
  const entry = doc.data()?.[key]
  if (!entry) return null
  // Expire after 24h
  if (entry.createdAt && Date.now() - new Date(entry.createdAt).getTime() > 24 * 60 * 60 * 1000) return null
  return entry as PendingProductSelection
}

export async function deletePendingSearch(uid: string, key: string): Promise<void> {
  const { FieldValue } = await import('firebase-admin/firestore')
  await getAdminFirestore().collection('groceries').doc(uid)
    .collection('private').doc('pendingSearches').update({ [key]: FieldValue.delete() })
}

/**
 * Select a product from a pending search and save it to the appropriate list.
 * Returns a confirmation message. Used by both Telegram callback and app chat select.
 */
export async function selectProduct(uid: string, searchKey: string, resultIndex: number): Promise<{ message: string; target: string }> {
  const pendingSearch = await loadPendingSearch(uid, searchKey)
  if (!pendingSearch || resultIndex >= pendingSearch.results.length) {
    throw new Error('החיפוש פג תוקף')
  }

  const selected = pendingSearch.results[resultIndex]
  const unit = selected.unitPrice?.split('/')?.pop()?.trim()
  const item = {
    name: selected.name, qty: pendingSearch.qty, catalogId: selected.catalogId,
    ...(unit ? { unit } : {}),
    ...(selected.sellingUnitId != null ? { sellingUnitId: selected.sellingUnitId } : {}),
  }

  const selStoreId = pendingSearch.store || 'shufersal'
  if (pendingSearch.target === 'standing') {
    await addToStoreStanding(uid, selStoreId, [item])
  } else {
    await addStorePendingItems(uid, selStoreId, [item], { validTo: pendingSearch.validTo })
  }

  await saveProductMapping(uid, pendingSearch.query, selected.catalogId, selected.name)
  await deletePendingSearch(uid, searchKey)

  // If adding to pending and there's an active Shufersal order, also push to live cart
  if (pendingSearch.target === 'pending' && selStoreId === 'shufersal' && item.catalogId) {
    await pushToActiveCart(uid, item.catalogId, item.qty)
  }

  const targetLabel = pendingSearch.target === 'standing' ? 'קבועה' : 'הזמנה'
  return {
    message: `✅ ${selected.name} (x${pendingSearch.qty}) נוסף לרשימה ${targetLabel}`,
    target: targetLabel,
  }
}

async function pushToActiveCart(uid: string, catalogId: string, qty: number): Promise<void> {
  try {
    // Live query — Shufersal API is source of truth, not cached orderCycle
    const shufersal = getStore('shufersal')
    const orders = shufersal ? await shufersal.listOrders(uid).catch(() => []) : []
    const active = orders.find(o => o.cancelable)
    if (active) {
      await orderLoadToCart(uid, active.orderId)
      await cartAdd(uid, catalogId, qty)
    }
  } catch (err) {
    console.error('[ActionExecutor] Failed to push to active cart:', err)
  }
}

export interface ActionResult {
  /** Per-action results, in the same order as the input `actions` array — used to feed tool responses back to the LLM. */
  results: { name: string; result: string }[]
  /** Pending product searches that need user selection (stops the agentic loop — requires a callback). */
  pendingSelections?: PendingProductSelection[]
}

export interface PendingProductSelection {
  query: string
  qty: number
  target: 'pending' | 'standing'
  store?: string  // which store these results came from
  /** ISO date/datetime — only meaningful for target='pending'. Absent = single-shot. */
  validTo?: string
  results: { catalogId: string; name: string; brand: string; price: string; unitPrice: string; sellingUnitId?: number }[]
}

export async function executeActions(uid: string, actions: ChatAction[], sessionStore?: string | null): Promise<ActionResult> {
  const results: { name: string; result: string }[] = []
  const allPending: PendingProductSelection[] = []

  for (const action of actions) {
    try {
      const r = await executeOne(uid, action, sessionStore)
      if (typeof r === 'string') {
        results.push({ name: action.action, result: r })
      } else if (r) {
        // Collect per-action text for feedback; attach pendingSelections separately.
        if (r.followUp) results.push({ name: action.action, result: r.followUp })
        else results.push({ name: action.action, result: 'ok' })
        if (r.pendingSelections) allPending.push(...r.pendingSelections)
      } else {
        results.push({ name: action.action, result: 'ok' })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[ActionExecutor] Failed action=${action.action}:`, msg)
      results.push({ name: action.action, result: `error: ${msg}` })
    }
  }

  return {
    results,
    pendingSelections: allPending.length > 0 ? allPending : undefined,
  }
}

interface ExecuteOneResult {
  followUp?: string | null
  pendingSelections?: PendingProductSelection[]
}

async function executeOne(uid: string, action: ChatAction, sessionStore?: string | null): Promise<string | ExecuteOneResult | null> {
  // Guard: store actions require authenticated store
  if (STORE_ACTIONS.has(action.action)) {
    const storeId = await resolveActionStore(uid, action, sessionStore)
    const store = getStore(storeId)
    if (!store) return `חנות "${storeId}" לא מוכרת.`
    const authenticated = await store.isAuthenticated(uid)
    if (!authenticated) {
      if (store.authType === 'otp') return `${store.label} לא מחובר. שלח מספר טלפון כדי לחבר.`
      return `${store.label} לא מחובר. שלח אימייל וסיסמה כדי לחבר.`
    }
  }

  switch (action.action) {
    case 'product_details': {
      const productName = typeof action.name === 'string' ? action.name.trim() : ''
      if (!productName) return null
      const pdStoreId = await resolveActionStore(uid, action, sessionStore)
      const pdStore = getStore(pdStoreId)
      if (!pdStore) return `חנות "${pdStoreId}" לא מוכרת.`

      // Look up item in the user's list
      const pdData = await getStoreData(uid, pdStoreId).catch(() => null)
      const allItems: GroceryItem[] = [
        ...Object.values(pdData?.standingList || {}),
        ...Object.values(pdData?.pendingChanges?.add || {}).map(e => e.item),
      ]
      const lowerName = productName.toLowerCase()
      const match = allItems.find(i => i.name.toLowerCase().includes(lowerName))

      // Search store for current details
      try {
        const searchQuery = match?.name || productName
        const results = await pdStore.search(uid, searchQuery)
        // Find best match from search results
        const bestMatch = match?.catalogId
          ? results.find(r => r.productId === match.catalogId)
          : results[0]

        if (bestMatch) {
          const parts = [`📦 ${bestMatch.name}`]
          if (bestMatch.brand) parts.push(`מותג: ${bestMatch.brand}`)
          if (bestMatch.price) parts.push(`מחיר: ${bestMatch.price}₪`)
          if (bestMatch.unitPrice) parts.push(`מחיר ליחידה: ${bestMatch.unitPrice}`)
          if (match) {
            parts.push(`ברשימה: ${match.qty > 1 ? `x${match.qty}` : 'כן'}${match.unit ? ` (${match.unit})` : ''}`)
          }
          return parts.join('\n')
        }

        if (match) {
          return `📦 ${match.name} — ברשימה (x${match.qty})${match.unit ? `, ${match.unit}` : ''}\nלא נמצאו פרטים נוספים מ${pdStore.label}.`
        }
        return `לא נמצאו פרטים על "${productName}" ב${pdStore.label}.`
      } catch (err) {
        console.error(`[ActionExecutor] product_details failed:`, err)
        if (match) {
          return `📦 ${match.name} — ברשימה (x${match.qty})${match.unit ? `, ${match.unit}` : ''}`
        }
        return `שגיאה בקבלת פרטים על "${productName}".`
      }
    }

    case 'search_product':
    case 're_search': {
      const query = typeof action.query === 'string' ? action.query.trim() : ''
      const qty = typeof action.qty === 'number' && action.qty > 0 ? action.qty : 1
      const target = action.target === 'standing' ? 'standing' as const : 'pending' as const
      const validTo = target === 'pending' ? normalizeValidTo(action.validTo) : undefined
      if (!query) return null

      // re_search: clear old mapping first
      if (action.action === 're_search') {
        await deleteMapping(uid, query)
        const reStoreId = await resolveActionStore(uid, action, sessionStore)
        if (target === 'standing') await removeFromStoreStanding(uid, reStoreId, [query])
        else await removeStorePendingItems(uid, reStoreId, [query])
      }

      const storeId = await resolveActionStore(uid, action, sessionStore)
      const store = getStore(storeId)
      if (!store) return `חנות "${storeId}" לא מוכרת.`

      // Cache-first: reuse a previous product mapping without searching
      if (action.action !== 're_search') {
        const cached = await lookupMapping(uid, query)
        if (cached) {
          const item = { name: cached.shufersalName, qty, catalogId: cached.catalogId }
          if (target === 'standing') await addToStoreStanding(uid, storeId, [item])
          else {
            await addStorePendingItems(uid, storeId, [item], { validTo })
            if (storeId === 'shufersal') await pushToActiveCart(uid, cached.catalogId, qty)
          }
          const targetLabel = target === 'standing' ? 'קבועה' : 'הזמנה'
          return `✅ ${cached.shufersalName} (x${qty}) נוסף לרשימה ${targetLabel} ב${store.label}`
        }
      }

      try {
        const results = await store.search(uid, query)
        if (results.length === 0) return `לא נמצאו תוצאות עבור "${query}" ב${store.label}.`
        const allResults = results.slice(0, 12).map(r => ({
          catalogId: r.productId, name: r.name, brand: r.brand, price: r.price, unitPrice: r.unitPrice,
          sellingUnitId: r.sellingUnitId,
        }))
        const { filtered, comment } = await filterSearchResults(query, allResults)

        // Auto-select when exactly 1 result
        if (filtered.length === 1) {
          const selected = filtered[0]
          const unit = selected.unitPrice?.split('/')?.pop()?.trim() || undefined
          const item = { name: selected.name, qty, catalogId: selected.catalogId, unit, sellingUnitId: selected.sellingUnitId }
          if (target === 'standing') await addToStoreStanding(uid, storeId, [item])
          else {
            await addStorePendingItems(uid, storeId, [item], { validTo })
            if (storeId === 'shufersal' && selected.catalogId) await pushToActiveCart(uid, selected.catalogId, qty)
          }
          await saveProductMapping(uid, query, selected.catalogId, selected.name)
          const targetLabel = target === 'standing' ? 'קבועה' : 'הזמנה'
          return `✅ ${selected.name} (x${qty}) נוסף לרשימה ${targetLabel} ב${store.label}`
        }

        return {
          followUp: comment || null,
          pendingSelections: [{
            query, qty, target, store: storeId,
            ...(validTo ? { validTo } : {}),
            results: filtered.slice(0, 8),
          }],
        }
      } catch (err) {
        console.error(`[ActionExecutor] Search failed for "${query}" (${storeId}):`, err)
        return `שגיאה בחיפוש "${query}" ב${store.label}.`
      }
    }

    case 'remove_items': {
      const names = normalizeNames(action.items)
      if (names.length === 0) return null
      const rmStoreId = await resolveActionStore(uid, action, sessionStore)
      const rmValidTo = normalizeValidTo(action.validTo)
      await removeStorePendingItems(uid, rmStoreId, names, { validTo: rmValidTo })

      // If Shufersal has an active (cancelable) order, also remove from it.
      // Live query — no caching.
      if (rmStoreId === 'shufersal') {
        try {
          const shufersal = getStore('shufersal')
          const orders = shufersal ? await shufersal.listOrders(uid).catch(() => []) : []
          const active = orders.find(o => o.cancelable)
          if (active) {
            await orderLoadToCart(uid, active.orderId)
            const cart = await cartRead(uid)
            for (const name of names) {
              const lowerName = name.toLowerCase()
              const match = cart.find((c: any) => c.name.toLowerCase().includes(lowerName))
              if (match?.entryNumber) await cartRemove(uid, match.entryNumber)
            }
          }
        } catch (err) {
          console.error(`[ActionExecutor] Failed to remove from live cart:`, err)
        }
      }
      return null
    }

    case 'remove_standing': {
      const names = normalizeNames(action.items)
      if (names.length === 0) return null
      await removeFromStoreStanding(uid, await resolveActionStore(uid, action, sessionStore), names)
      return null
    }

    case 'move_to_standing': {
      const names = normalizeNames(action.items)
      if (names.length === 0) return null
      const storeId = await resolveActionStore(uid, action, sessionStore)
      const { moved } = await moveStorePendingToStanding(uid, storeId, names)
      if (moved.length === 0) return 'לא נמצאו פריטים תואמים ברשימה השבועית.'
      return `✅ הועבר לרשימה הקבועה: ${moved.map(i => i.name).join(', ')}`
    }

    case 'show_list': {
      const slStoreId = await resolveActionStore(uid, action, sessionStore)
      const slStore = getStore(slStoreId)
      const data = await getStoreData(uid, slStoreId)
      const standingItems = Object.values(data.standingList)
      const pendingAddEntries = Object.values(data.pendingChanges.add)
      const pendingRemoveEntries = Object.values(data.pendingChanges.remove)
      if (standingItems.length === 0 && pendingAddEntries.length === 0 && pendingRemoveEntries.length === 0) {
        return `הרשימה של ${slStore?.label || slStoreId} ריקה.`
      }
      const parts: string[] = []
      const fmtValidTo = (iso?: string): string => {
        if (!iso) return ''
        const d = new Date(iso)
        if (Number.isNaN(d.getTime())) return ''
        const dd = String(d.getDate()).padStart(2, '0')
        const mm = String(d.getMonth() + 1).padStart(2, '0')
        return ` (עד ${dd}/${mm})`
      }
      if (standingItems.length > 0) {
        parts.push(`רשימה קבועה (${slStore?.label || slStoreId}):`)
        for (const i of standingItems) {
          const qtyStr = i.qty > 1 ? ` x${i.qty}` : ''
          const unitStr = i.unit ? ` ${i.unit}` : ''
          parts.push(`• ${i.name}${qtyStr}${unitStr}`)
        }
      }
      if (pendingAddEntries.length > 0) {
        parts.push('\nתוספות השבוע:')
        for (const e of pendingAddEntries) {
          const i = e.item
          const qtyStr = i.qty > 1 ? ` x${i.qty}` : ''
          const unitStr = i.unit ? ` ${i.unit}` : ''
          parts.push(`• ${i.name}${qtyStr}${unitStr}${fmtValidTo(e.validTo)}`)
        }
      }
      if (pendingRemoveEntries.length > 0) {
        const removesStr = pendingRemoveEntries.map(e => `${e.name}${fmtValidTo(e.validTo)}`).join(', ')
        parts.push(`\nהסרות השבוע: ${removesStr}`)
      }
      return parts.join('\n')
    }

    case 'clear_pending': {
      await clearStorePending(uid, await resolveActionStore(uid, action, sessionStore))
      return null
    }

    case 'trigger_order': {
      const storeId = await resolveActionStore(uid, action, sessionStore)
      const store = getStore(storeId)
      if (!store) return `חנות "${storeId}" לא מוכרת.`

      const data = await getStoreData(uid, storeId)
      const orderNow = new Date()
      const activePending = filterActivePending(data.pendingChanges, orderNow)
      const merged = Object.values(mergeList(data.standingList, activePending))
      if (merged.length === 0) return 'הרשימה ריקה — אין מה להזמין.'

      const withId = merged.filter(i => i.catalogId)
      const withoutId = merged.filter(i => !i.catalogId)
      if (withId.length === 0) {
        return `אין מוצרים מקושרים. ${withoutId.length} מוצרים לא מקושרים: ${withoutId.map(i => i.name).join(', ')}`
      }
      if (withoutId.length > 0) {
        console.log(`[ActionExecutor] Ordering without unlinked: ${withoutId.map(i => i.name).join(', ')}`)
      }

      // Safety gate — same contract as grocery cron. Prevents duplicate
      // orders from a stale cycle doc, mid-flight race, or existing live
      // order that upstream logic missed.
      const safetyNow = new Date()
      const gate = await preflightOrderSafety({ uid, storeId, plugin: store, now: safetyNow })
      console.log(`[ActionExecutor] Safety: uid=${uid} store=${storeId} decision=${gate.decision}`)
      if (gate.skipped) {
        if (gate.decision === 'already-placed') {
          return `הזמנה כבר פתוחה השבוע ב${store.label} (#${gate.orderId}).`
        }
        if (gate.decision === 'linked-existing') {
          return `מצאתי הזמנה קיימת ב${store.label} (#${gate.orderId}), סימנתי אותה.`
        }
        return `ריצה אחרת עובדת על ההזמנה ברגע זה. נסה שוב בעוד דקה.`
      }

      const items = withId.map(i => ({ code: i.catalogId!, qty: i.qty, sellingUnitId: i.sellingUnitId }))
      const actionDay = typeof action.day === 'string' ? action.day : undefined
      const actionTime = typeof action.time === 'string' ? action.time : undefined
      const schedule = data.schedule
      const day = actionDay || schedule?.preferredSlot.day
      const time = actionTime || schedule?.preferredSlot.time?.split('-')[0]

      try {
        const result = await store.checkout(uid, items, { day, time, nearest: !day })
        if (result.success) {
          await finalizeOrderSuccess({
            uid, storeId, idempotencyKey: gate.idempotencyKey, cycle: gate.cycle, now: safetyNow,
            orderId: result.orderId,
            slot: result.deliveryWindow,
          })
          // Drop single-shot pending entries that applied to this order;
          // preserve still-future-dated standing instructions.
          await sweepStorePending(uid, storeId, safetyNow)
          return `הזמנה בוצעה ב${store.label}! #${result.orderId || ''}\nמשלוח: ${result.deliveryWindow?.day} ${result.deliveryWindow?.date} ${result.deliveryWindow?.time}`
        }
        await finalizeOrderFailure({
          uid, storeId, idempotencyKey: gate.idempotencyKey, cycle: gate.cycle, now: safetyNow,
          error: result.error || 'unknown',
        })
        return `שגיאה בהזמנה ב${store.label}: ${result.error}`
      } catch (checkoutErr) {
        const msg = checkoutErr instanceof Error ? checkoutErr.message : String(checkoutErr)
        await finalizeOrderFailure({
          uid, storeId, idempotencyKey: gate.idempotencyKey, cycle: gate.cycle, now: safetyNow,
          error: msg,
        })
        throw checkoutErr
      }
    }

    case 'list_slots': {
      const storeId = await resolveActionStore(uid, action, sessionStore)
      const store = getStore(storeId)
      if (!store) return `חנות "${storeId}" לא מוכרת.`
      try {
        const slotDays = await store.listSlots(uid)
        if (slotDays.length === 0) return `אין משבצות משלוח זמינות ב${store.label}.`
        const lines = slotDays.map(d => `${d.day} ${d.date}: ${d.slots.map(s => s.time).join(', ')}`)
        return `משבצות זמינות ב${store.label}:\n${lines.join('\n')}`
      } catch (err) {
        console.error(`[ActionExecutor] list_slots failed (${storeId}):`, err)
        return `שגיאה בקריאת משבצות ב${store.label}.`
      }
    }

    case 'show_cart': {
      // Live query — no cached cycle, Shufersal API is source of truth.
      try {
        const shufersal = getStore('shufersal')
        if (!shufersal) return 'חנות שופרסל לא מוגדרת.'
        const orders = await shufersal.listOrders(uid).catch(() => [])
        const active = orders.find(o => o.cancelable)
        if (!active) return 'אין הזמנה פתוחה בשופרסל.'
        await orderLoadToCart(uid, active.orderId)
        const cart = await cartRead(uid)
        if (cart.length === 0) return `הזמנה #${active.orderId}: העגלה ריקה.`
        const lines = cart.map((item: any) => {
          const qtyStr = item.qty > 1 ? ` x${item.qty}` : ''
          return `• ${item.name}${qtyStr}`
        })
        return `הזמנה #${active.orderId} (${cart.length} פריטים):\n${lines.join('\n')}`
      } catch (err) {
        console.error('[ActionExecutor] show_cart failed:', err)
        return 'שגיאה בקריאת ההזמנה.'
      }
    }

    case 'show_orders': {
      // Store-specific path: user named a store OR the session has one active.
      // Store-agnostic path ("יש הזמנות פתוחות?"): iterate all registered stores,
      // check each one that is authenticated, and skip the rest with a footer note.
      const explicitStore = typeof action.store === 'string' ? action.store : (sessionStore || null)

      const formatOrders = (label: string, orders: StoreOrder[]): string => {
        const lines = orders.map(o => {
          const deliveryStr = o.delivery.date ? `${o.delivery.date} ${o.delivery.time}${o.delivery.endTime ? `-${o.delivery.endTime}` : ''}` : 'לא נקבע'
          return `#${o.orderId} — ${o.total}\n  משלוח: ${deliveryStr}\n  ${o.cancelable ? 'ניתן לבטל' : ''}\n  ${o.itemsCount} פריטים`
        })
        return `הזמנות פעילות ב${label}:\n\n${lines.join('\n\n')}`
      }

      if (explicitStore) {
        const store = getStore(explicitStore)
        if (!store) return `חנות "${explicitStore}" לא מוכרת.`
        const authed = await store.isAuthenticated(uid)
        if (!authed) {
          if (store.authType === 'otp') return `${store.label} לא מחובר. שלח מספר טלפון כדי לחבר.`
          return `${store.label} לא מחובר. שלח אימייל וסיסמה כדי לחבר.`
        }
        try {
          const orders = await store.listOrders(uid)
          if (orders.length === 0) return `אין הזמנות פעילות ב${store.label}.`
          return formatOrders(store.label, orders)
        } catch (err) {
          console.error(`[ActionExecutor] Failed to list orders (${explicitStore}):`, err)
          return `שגיאה בקריאת הזמנות מ${store.label}.`
        }
      }

      // Store-agnostic: iterate all registered stores.
      const allStores = getAllStores()
      const sections: string[] = []
      const skipped: string[] = []
      let totalActiveStoresChecked = 0

      for (const store of allStores) {
        const authed = await store.isAuthenticated(uid).catch(() => false)
        if (!authed) {
          skipped.push(store.label)
          continue
        }
        totalActiveStoresChecked++
        try {
          const orders = await store.listOrders(uid)
          if (orders.length === 0) {
            sections.push(`אין הזמנות פעילות ב${store.label}.`)
          } else {
            sections.push(formatOrders(store.label, orders))
          }
        } catch (err) {
          console.error(`[ActionExecutor] Failed to list orders (${store.id}):`, err)
          sections.push(`שגיאה בקריאת הזמנות מ${store.label}.`)
        }
      }

      if (totalActiveStoresChecked === 0) {
        // Nothing connected — tell the user plainly; no misleading "no active orders".
        return 'אף חנות לא מחוברת. חבר חשבון כדי לראות הזמנות.'
      }

      const body = sections.join('\n\n')
      const footer = skipped.length > 0
        ? `\n\nלא בדקתי ${skipped.join(', ')} — לא מחובר.`
        : ''
      return body + footer
    }

    case 'cancel_order': {
      const storeId = await resolveActionStore(uid, action, sessionStore)
      const store = getStore(storeId)
      if (!store) return `חנות "${storeId}" לא מוכרת.`

      const liveOrders = await store.listOrders(uid).catch(() => [])
      const targetId = (action.orderId as string | undefined) || liveOrders[0]?.orderId
      if (!targetId) return `אין הזמנה פעילה לביטול ב${store.label}.`

      try {
        const ok = await store.cancelOrder(uid, targetId)
        if (!ok) return `${store.label} לא אישר את הביטול.`
      } catch (err) {
        console.error(`[ActionExecutor] Cancel order failed (${storeId}):`, err)
        return `שגיאה בביטול ההזמנה ב${store.label}.`
      }
      return `ההזמנה #${targetId} בוטלה ב${store.label}.`
    }

    case 'set_schedule': {
      const schedule: GrocerySchedule = {
        orderDay: typeof action.orderDay === 'number' ? action.orderDay : 0,
        preferredSlot: {
          day: (action.preferredSlot as any)?.day || 'רביעי',
          time: (action.preferredSlot as any)?.time || '14:00-16:00',
        },
        reviewReminderHours: typeof action.reviewReminderHours === 'number' ? action.reviewReminderHours : 36,
      }
      const schedStoreId = await resolveActionStore(uid, action, sessionStore)
      await setStoreSchedule(uid, schedStoreId, schedule)
      return null
    }

    case 'browse_category': {
      const category = typeof action.category === 'string' ? action.category.trim() : ''
      const storeId = await resolveActionStore(uid, action, sessionStore)
      const store = getStore(storeId)
      if (!store) return `חנות "${storeId}" לא מוכרת.`
      try {
        // Direct search without LLM filter — category browsing returns all matches
        const results = await store.search(uid, category)
        if (results.length === 0) return `לא נמצאו מוצרים בקטגוריה "${category}" ב${store.label}.`
        const lines = results.map(r => `• ${r.name} — ${r.price}₪/${r.unitPrice.split('/').pop()?.trim() || ''}`)
        return `${category} ב${store.label} (${results.length}):\n${lines.join('\n')}\n\nמשהו מעניין לרשימה?`
      } catch (err) {
        console.error(`[ActionExecutor] Browse failed for "${category}" (${storeId}):`, err)
        return `שגיאה בסריקת "${category}".`
      }
    }

    case 'show_schedule': {
      const showSchedStoreId = await resolveActionStore(uid, action, sessionStore)
      const schedule = await getStoreSchedule(uid, showSchedStoreId)
      if (!schedule) return 'לא הוגדר לוח זמנים. תגיד לי מתי לפתוח הזמנה ומתי המשלוח.'
      const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
      return [
        'לוח זמנים:',
        `• פתיחת הזמנה: יום ${DAY_NAMES[schedule.orderDay]}`,
        `• משלוח: ${schedule.preferredSlot.day} ${schedule.preferredSlot.time}`,
        `• תזכורת: ${schedule.reviewReminderHours} שעות לפני`,
      ].join('\n')
    }

    // --- Store connection ---
    case 'set_credentials': {
      const email = typeof action.email === 'string' ? action.email.trim() : ''
      const password = typeof action.password === 'string' ? action.password : ''
      if (!email || !password) return 'חסר אימייל או סיסמה.'
      await saveCredentials(uid, email, password)
      try {
        await shufersalLogin(uid)
        await setCredentialsVerified(uid, true)
        await addActiveStore(uid, 'shufersal')
        return 'פרטי שופרסל נשמרו והתחברות הצליחה!'
      } catch (err) {
        console.error('[ActionExecutor] Shufersal login failed:', err)
        return 'פרטים נשמרו, אבל ההתחברות נכשלה. בדוק שהאימייל והסיסמה נכונים.'
      }
    }

    case 'set_otp_phone': {
      const phone = typeof action.phone === 'string' ? action.phone.trim() : ''
      if (!phone) return 'חסר מספר טלפון.'
      try {
        await saveRetalixCredentials(uid, phone)
        await sendOtp(uid)
        return 'שלחתי קוד SMS. שלח לי את הקוד שקיבלת.'
      } catch (err) {
        console.error('[ActionExecutor] Send OTP failed:', err)
        return 'שגיאה בשליחת SMS. בדוק את מספר הטלפון.'
      }
    }

    case 'verify_otp': {
      const otp = typeof action.otp === 'string' ? action.otp.trim() : ''
      if (!otp) return 'חסר קוד.'
      try {
        await verifyOtp(uid, otp)
        await addActiveStore(uid, 'retalix')
        return 'חשבון מקור השפע חובר בהצלחה!'
      } catch (err) {
        console.error('[ActionExecutor] Verify OTP failed:', err)
        return 'הקוד שגוי. נסה שוב או בקש קוד חדש.'
      }
    }

    case 'set_default_store': {
      const storeId = typeof action.store === 'string' ? action.store : ''
      if (!storeId || !getStore(storeId)) return 'חנות לא מוכרת.'
      await setDefaultStore(uid, storeId)
      const store = getStore(storeId)!
      return `חנות ברירת מחדל שונתה ל${store.label}.`
    }

    case 'create_task': {
      const title = typeof action.title === 'string' ? action.title.trim() : ''
      if (!title) return 'חסר כותרת למשימה.'
      const task = await createTask(uid, title, {
        priority: typeof action.priority === 'string' ? action.priority as any : undefined,
        quadrant: typeof action.quadrant === 'string' ? action.quadrant as any : undefined,
        deadline: typeof action.deadline === 'string' ? action.deadline : undefined,
      })
      const deadlineStr = task.deadline ? ` (עד ${task.deadline})` : ''
      return `✅ משימה נוצרה: "${task.title}"${deadlineStr}`
    }

    case 'list_tasks': {
      const query = typeof action.query === 'string' ? action.query : ''
      const tasks = query ? await findTasks(uid, query) : await listTasks(uid)
      if (tasks.length === 0) return query ? `לא נמצאו משימות עם "${query}".` : 'אין משימות.'
      const lines = tasks.map(t => {
        const status = t.completed ? '✓' : '○'
        const deadline = t.deadline ? ` — עד ${t.deadline}` : ''
        return `${status} [${t.id.slice(-4)}] ${t.title}${deadline}`
      })
      return `משימות${query ? ` (חיפוש: "${query}")` : ''}:\n${lines.join('\n')}`
    }

    case 'complete_task': {
      const taskId = typeof action.id === 'string' ? action.id : ''
      if (!taskId) return 'חסר מזהה משימה.'
      // Support short id (last 4 chars)
      const tasks = await listTasks(uid)
      const task = tasks.find(t => t.id === taskId || t.id.endsWith(taskId))
      if (!task) return `לא נמצאה משימה עם מזהה "${taskId}".`
      await updateTask(uid, task.id, { completed: true })
      return `✅ משימה סומנה כהושלמה: "${task.title}"`
    }

    case 'update_task': {
      const taskId = typeof action.id === 'string' ? action.id : ''
      if (!taskId) return 'חסר מזהה משימה.'
      const tasks = await listTasks(uid)
      const task = tasks.find(t => t.id === taskId || t.id.endsWith(taskId))
      if (!task) return `לא נמצאה משימה עם מזהה "${taskId}".`
      const updates: Record<string, unknown> = {}
      if (typeof action.title === 'string') updates.title = action.title.trim()
      if (typeof action.deadline === 'string') updates.deadline = action.deadline
      if (typeof action.priority === 'string') updates.priority = action.priority
      if (typeof action.quadrant === 'string') updates.quadrant = action.quadrant
      if (typeof action.completed === 'boolean') updates.completed = action.completed
      await updateTask(uid, task.id, updates as any)
      return `✏️ משימה עודכנה: "${task.title}"`
    }

    case 'delete_task': {
      const taskId = typeof action.id === 'string' ? action.id : ''
      if (!taskId) return 'חסר מזהה משימה.'
      const tasks = await listTasks(uid)
      const task = tasks.find(t => t.id === taskId || t.id.endsWith(taskId))
      if (!task) return `לא נמצאה משימה עם מזהה "${taskId}".`
      await deleteTask(uid, task.id)
      return `🗑️ משימה נמחקה: "${task.title}"`
    }

    default:
      return null
  }
}

function normalizeItems(raw: unknown): GroceryItem[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((i: any) => i && typeof i.name === 'string' && i.name.trim())
    .map((i: any) => ({
      name: i.name.trim(),
      qty: typeof i.qty === 'number' && i.qty > 0 ? i.qty : 1,
    }))
}

function normalizeNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((s): s is string => typeof s === 'string' && s.trim() !== '').map(s => s.trim())
}
