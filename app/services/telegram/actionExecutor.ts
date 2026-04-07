/**
 * Execute chat actions against the grocery store and task queue.
 * Returns a follow-up message if the action produces data to show.
 */

import type { ChatAction } from './chatProcessor'
import { filterSearchResults } from './chatProcessor'
import { getAdminFirestore } from '@/app/lib/firebaseAdmin'
import {
  addPendingItems,
  removePendingItems,
  addToStanding,
  removeFromStanding,
  clearPending,
  getSchedule,
  setSchedule,
  getGroceryData,
  mergeList,
  type GroceryItem,
  type GrocerySchedule,
} from '@/app/services/grocery/groceryStore'
import {
  saveCredentials,
  setCredentialsVerified,
  login as shufersalLogin,
  cartRead,
  cartRemove,
  orderLoadToCart,
} from '@/app/services/grocery/shufersalClient'
import { sendOtp, verifyOtp, saveRetalixCredentials } from '@/app/services/grocery/retalixClient'
import { getStore, getAllStores } from '@/app/services/grocery/storeRegistry'
import { getUserStores, setDefaultStore, addActiveStore, getStoreData, removeFromStoreStanding, removeStorePendingItems, clearStorePending } from '@/app/services/grocery/groceryStoreMulti'
import type { OtpStorePlugin, CredentialsStorePlugin } from '@/app/services/grocery/storeTypes'

import { randomBytes } from 'crypto'
import { getOrderCycle, setOrderCycle, type OrderCycle } from '@/app/services/grocery/groceryStore'
import { deleteMapping } from '@/app/services/grocery/productResolver'

/** Actions that require a connected store */
const STORE_ACTIONS = new Set(['show_orders', 'trigger_order', 'cancel_order', 'search_product', 're_search'])

/** Resolve which store an action targets */
async function resolveActionStore(uid: string, action: ChatAction): Promise<string> {
  if (typeof action.store === 'string') return action.store
  const meta = await getUserStores(uid)
  return meta.defaultStore
}

// --- Pending search storage (for callback_data 64-byte limit) ---

export async function savePendingSearch(uid: string, selection: PendingProductSelection): Promise<string> {
  const key = randomBytes(3).toString('hex')
  await getAdminFirestore().collection('groceries').doc(uid)
    .collection('private').doc('pendingSearches').set(
      { [key]: { ...selection, createdAt: new Date().toISOString() } },
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

export interface ActionResult {
  /** Extra text to append to the bot's reply (e.g. the list). Null = nothing to add. */
  followUp: string | null
  /** Pending product searches that need user selection. */
  pendingSelections?: PendingProductSelection[]
}

export interface PendingProductSelection {
  query: string
  qty: number
  target: 'pending' | 'standing'
  store?: string  // which store these results came from
  results: { catalogId: string; name: string; brand: string; price: string; unitPrice: string }[]
}

export async function executeActions(uid: string, actions: ChatAction[]): Promise<ActionResult> {
  const followUps: string[] = []
  const allPending: PendingProductSelection[] = []

  for (const action of actions) {
    try {
      const result = await executeOne(uid, action)
      if (typeof result === 'string') {
        followUps.push(result)
      } else if (result) {
        if (result.followUp) followUps.push(result.followUp)
        if (result.pendingSelections) allPending.push(...result.pendingSelections)
      }
    } catch (err) {
      console.error(`[ActionExecutor] Failed action=${action.action}:`, err)
    }
  }

  return {
    followUp: followUps.length > 0 ? followUps.join('\n\n') : null,
    pendingSelections: allPending.length > 0 ? allPending : undefined,
  }
}

interface ExecuteOneResult {
  followUp?: string | null
  pendingSelections?: PendingProductSelection[]
}

async function executeOne(uid: string, action: ChatAction): Promise<string | ExecuteOneResult | null> {
  // Guard: store actions require authenticated store
  if (STORE_ACTIONS.has(action.action)) {
    const storeId = await resolveActionStore(uid, action)
    const store = getStore(storeId)
    if (!store) return `חנות "${storeId}" לא מוכרת.`
    const authenticated = await store.isAuthenticated(uid)
    if (!authenticated) {
      if (store.authType === 'otp') return `${store.label} לא מחובר. שלח מספר טלפון כדי לחבר.`
      return `${store.label} לא מחובר. שלח אימייל וסיסמה כדי לחבר.`
    }
  }

  switch (action.action) {
    // --- Product search (routed through store plugin) ---
    case 'search_product': {
      const query = typeof action.query === 'string' ? action.query.trim() : ''
      const qty = typeof action.qty === 'number' && action.qty > 0 ? action.qty : 1
      const target = action.target === 'standing' ? 'standing' as const : 'pending' as const
      if (!query) return null

      const storeId = await resolveActionStore(uid, action)
      const store = getStore(storeId)
      if (!store) return `חנות "${storeId}" לא מוכרת.`

      try {
        const results = await store.search(uid, query)
        if (results.length === 0) return `לא נמצאו תוצאות עבור "${query}" ב${store.label}.`
        const allResults = results.slice(0, 12).map(r => ({
          catalogId: r.productId, name: r.name, brand: r.brand, price: r.price, unitPrice: r.unitPrice,
        }))
        const { filtered, comment } = await filterSearchResults(query, allResults)
        return {
          followUp: comment || null,
          pendingSelections: [{
            query, qty, target, store: storeId,
            results: filtered.slice(0, 8),
          }],
        }
      } catch (err) {
        console.error(`[ActionExecutor] Search failed for "${query}" (${storeId}):`, err)
        return `שגיאה בחיפוש "${query}" ב${store.label}.`
      }
    }

    case 're_search': {
      const query = typeof action.query === 'string' ? action.query.trim() : ''
      const qty = typeof action.qty === 'number' && action.qty > 0 ? action.qty : 1
      const target = action.target === 'standing' ? 'standing' as const : 'pending' as const
      if (!query) return null

      await deleteMapping(uid, query)
      if (target === 'standing') await removeFromStanding(uid, [query])
      else await removePendingItems(uid, [query])

      const storeId = await resolveActionStore(uid, action)
      const store = getStore(storeId)
      if (!store) return `חנות "${storeId}" לא מוכרת.`

      try {
        const results = await store.search(uid, query)
        if (results.length === 0) return `לא נמצאו תוצאות עבור "${query}" ב${store.label}.`
        const allResults = results.slice(0, 12).map(r => ({
          catalogId: r.productId, name: r.name, brand: r.brand, price: r.price, unitPrice: r.unitPrice,
        }))
        const { filtered, comment } = await filterSearchResults(query, allResults)
        return {
          followUp: comment || null,
          pendingSelections: [{
            query, qty, target, store: storeId,
            results: filtered.slice(0, 8),
          }],
        }
      } catch (err) {
        console.error(`[ActionExecutor] Re-search failed for "${query}" (${storeId}):`, err)
        return `שגיאה בחיפוש "${query}" ב${store.label}.`
      }
    }

    case 'remove_items': {
      const names = normalizeNames(action.items)
      if (names.length === 0) return null
      const rmStoreId = await resolveActionStore(uid, action)
      // Use multi-store if store specified, otherwise legacy
      if (action.store) {
        await removeStorePendingItems(uid, rmStoreId, names)
      } else {
        await removePendingItems(uid, names)
      }

      // If Shufersal and active order, also remove from live cart
      if (rmStoreId === 'shufersal') {
        const removeCycle = await getOrderCycle(uid)
        if (removeCycle?.status === 'active' || removeCycle?.status === 'review') {
          try {
            if (removeCycle.orderId) await orderLoadToCart(uid, removeCycle.orderId)
            const cart = await cartRead(uid)
            for (const name of names) {
              const lowerName = name.toLowerCase()
              const match = cart.find((c: any) => c.name.toLowerCase().includes(lowerName))
              if (match?.entryNumber) await cartRemove(uid, match.entryNumber)
            }
          } catch (err) {
            console.error(`[ActionExecutor] Failed to remove from live cart:`, err)
          }
        }
      }
      return null
    }

    case 'remove_standing': {
      const names = normalizeNames(action.items)
      if (names.length === 0) return null
      if (action.store) {
        await removeFromStoreStanding(uid, await resolveActionStore(uid, action), names)
      } else {
        await removeFromStanding(uid, names)
      }
      return null
    }

    case 'show_list': {
      const slStoreId = await resolveActionStore(uid, action)
      const slStore = getStore(slStoreId)
      const data = action.store
        ? await getStoreData(uid, slStoreId)
        : await getGroceryData(uid)
      const standing = data.standingList
      const pending = data.pendingChanges
      if (standing.length === 0 && pending.add.length === 0) return `הרשימה של ${slStore?.label || slStoreId} ריקה.`
      const parts: string[] = []
      if (standing.length > 0) {
        parts.push(`רשימה קבועה (${slStore?.label || slStoreId}):`)
        for (const i of standing) {
          parts.push(`• ${i.name}${i.qty > 1 ? ` x${i.qty}` : ''}`)
        }
      }
      if (pending.add.length > 0) {
        parts.push('\nתוספות השבוע:')
        for (const i of pending.add) {
          parts.push(`• ${i.name}${i.qty > 1 ? ` x${i.qty}` : ''}`)
        }
      }
      if (pending.remove.length > 0) {
        parts.push(`\nהסרות השבוע: ${pending.remove.join(', ')}`)
      }
      return parts.join('\n')
    }

    case 'clear_pending': {
      if (action.store) {
        await clearStorePending(uid, await resolveActionStore(uid, action))
      } else {
        await clearPending(uid)
      }
      return null
    }

    case 'trigger_order': {
      const storeId = await resolveActionStore(uid, action)
      const store = getStore(storeId)
      if (!store) return `חנות "${storeId}" לא מוכרת.`

      const data = action.store
        ? await getStoreData(uid, storeId)
        : await getGroceryData(uid)
      const merged = mergeList(data.standingList, data.pendingChanges)
      if (merged.length === 0) return 'הרשימה ריקה — אין מה להזמין.'

      const withId = merged.filter(i => i.catalogId)
      const withoutId = merged.filter(i => !i.catalogId)
      if (withId.length === 0) {
        return `אין מוצרים מקושרים. ${withoutId.length} מוצרים לא מקושרים: ${withoutId.map(i => i.name).join(', ')}`
      }
      if (withoutId.length > 0) {
        console.log(`[ActionExecutor] Ordering without unlinked: ${withoutId.map(i => i.name).join(', ')}`)
      }

      const items = withId.map(i => ({ code: i.catalogId!, qty: i.qty }))
      const actionDay = typeof action.day === 'string' ? action.day : undefined
      const actionTime = typeof action.time === 'string' ? action.time : undefined
      const schedule = data.schedule
      const day = actionDay || schedule?.preferredSlot.day
      const time = actionTime || schedule?.preferredSlot.time?.split('-')[0]

      const result = await store.checkout(uid, items, { day, time, nearest: !day })
      if (result.success) {
        return `הזמנה בוצעה ב${store.label}! #${result.orderId || ''}\nמשלוח: ${result.deliveryWindow?.day} ${result.deliveryWindow?.date} ${result.deliveryWindow?.time}`
      }
      return `שגיאה בהזמנה ב${store.label}: ${result.error}`
    }

    case 'show_orders': {
      const storeId = await resolveActionStore(uid, action)
      const store = getStore(storeId)
      if (!store) return `חנות "${storeId}" לא מוכרת.`

      try {
        const orders = await store.listOrders(uid)
        if (orders.length === 0) return `אין הזמנות פעילות ב${store.label}.`
        const lines = orders.map(o => {
          const deliveryStr = o.delivery.date ? `${o.delivery.date} ${o.delivery.time}${o.delivery.endTime ? `-${o.delivery.endTime}` : ''}` : 'לא נקבע'
          return `#${o.orderId} — ${o.total}\n  משלוח: ${deliveryStr}\n  ${o.cancelable ? 'ניתן לבטל' : ''}\n  ${o.itemsCount} פריטים`
        })
        return `הזמנות פעילות ב${store.label}:\n\n${lines.join('\n\n')}`
      } catch (err) {
        console.error(`[ActionExecutor] Failed to list orders (${storeId}):`, err)
        return `שגיאה בקריאת הזמנות מ${store.label}.`
      }
    }

    case 'cancel_order': {
      const storeId = await resolveActionStore(uid, action)
      const store = getStore(storeId)
      if (!store) return `חנות "${storeId}" לא מוכרת.`

      const data = await getGroceryData(uid)
      const cancelCycle = data.orderCycle
      if (!cancelCycle || cancelCycle.status === 'delivered') {
        return `אין הזמנה פעילה לביטול ב${store.label}.`
      }
      if (cancelCycle.orderId) {
        try {
          const ok = await store.cancelOrder(uid, cancelCycle.orderId)
          if (!ok) return `${store.label} לא אישר את הביטול.`
        } catch (err) {
          console.error(`[ActionExecutor] Cancel order failed (${storeId}):`, err)
          return `שגיאה בביטול ההזמנה ב${store.label}.`
        }
      }
      await setOrderCycle(uid, { ...cancelCycle, status: 'delivered', updatedAt: new Date().toISOString() })
      return null
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
      await setSchedule(uid, schedule)
      return null
    }

    case 'show_schedule': {
      const schedule = await getSchedule(uid)
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
      return null
    }

    case 'list_tasks': {
      return null
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
