/**
 * Execute chat actions against the grocery store and task queue.
 * Returns a follow-up message if the action produces data to show.
 */

import type { ChatAction } from './chatProcessor'
import {
  addPendingItems,
  removePendingItems,
  addToStanding,
  removeFromStanding,
  getMergedList,
  clearPending,
  getSchedule,
  setSchedule,
  getGroceryData,
  mergeList,
  type GroceryItem,
  type GrocerySchedule,
} from '@/app/services/grocery/groceryStore'
import {
  checkout,
  cancelOrder as shufersalCancel,
  cartAdd,
  cartRead,
  cartRemove,
  orderLoadToCart,
  ordersList,
  saveCredentials,
  setCredentialsVerified,
  isCredentialsVerified,
  login as shufersalLogin,
  search,
} from '@/app/services/grocery/shufersalClient'

const SHUFERSAL_ACTIONS = new Set(['show_orders', 'trigger_order', 'cancel_order'])
import { getOrderCycle, setOrderCycle, type OrderCycle } from '@/app/services/grocery/groceryStore'
// Product resolver used for mapping lookup only — search results shown to user for picking

export interface ActionResult {
  /** Extra text to append to the bot's reply (e.g. the list). Null = nothing to add. */
  followUp: string | null
  /** Pending product searches that need user selection. */
  pendingSelections?: PendingProductSelection[]
}

export interface PendingProductSelection {
  name: string
  qty: number
  results: { catalogId: string; name: string; brand: string; price: string }[]
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
  // Guard: Shufersal actions require verified credentials
  if (SHUFERSAL_ACTIONS.has(action.action)) {
    const verified = await isCredentialsVerified(uid)
    if (!verified) return 'חשבון שופרסל לא מחובר. שלח לי אימייל וסיסמה של שופרסל כדי לחבר.'
  }

  switch (action.action) {
    case 'add_items': {
      const items = normalizeItems(action.items)
      if (items.length === 0) return null

      const verified = await isCredentialsVerified(uid)
      const pendingSelections: PendingProductSelection[] = []

      for (const item of items) {
        if (item.catalogId) {
          await addPendingItems(uid, [item])
          continue
        }

        if (verified) {
          // Check saved mappings only (no auto-search)
          const { lookupMapping } = await import('@/app/services/grocery/productResolver')
          const mapping = await lookupMapping(uid, item.name)
          if (mapping) {
            await addPendingItems(uid, [{ ...item, catalogId: mapping.catalogId }])
            continue
          }

          // No mapping — search Shufersal and let user pick
          try {
            const results = await search(uid, item.name)
            if (results.length > 0) {
              await addPendingItems(uid, [item])
              pendingSelections.push({
                name: item.name,
                qty: item.qty,
                results: results.slice(0, 5).map(r => ({
                  catalogId: r.catalogId,
                  name: r.name,
                  brand: r.brand,
                  price: r.price,
                })),
              })
              continue
            }
          } catch (err) {
            console.error(`[ActionExecutor] Search failed for "${item.name}":`, err)
          }
        }

        // No credentials or search failed — add without catalogId
        await addPendingItems(uid, [item])
      }

      return pendingSelections.length > 0 ? { pendingSelections } : null
    }

    case 'remove_items': {
      const names = normalizeNames(action.items)
      if (names.length === 0) return null
      await removePendingItems(uid, names)

      // If there's an active order, also remove from live Shufersal cart
      const removeCycle = await getOrderCycle(uid)
      if (removeCycle?.status === 'active' || removeCycle?.status === 'review') {
        try {
          if (removeCycle.orderId) await orderLoadToCart(uid, removeCycle.orderId)
          const cart = await cartRead(uid)
          for (const name of names) {
            const lowerName = name.toLowerCase()
            const match = cart.find(c => c.name.toLowerCase().includes(lowerName))
            if (match?.entryNumber) {
              await cartRemove(uid, match.entryNumber)
            }
          }
        } catch (err) {
          console.error('[ActionExecutor] Failed to remove from live Shufersal cart:', err)
          return 'הוסר מהרשימה, אבל לא הצלחתי לעדכן את ההזמנה בשופרסל.'
        }
      }
      return null
    }

    case 'add_standing': {
      const items = normalizeItems(action.items)
      if (items.length === 0) return null

      await addToStanding(uid, items)
      return null
    }

    case 'remove_standing': {
      const names = normalizeNames(action.items)
      if (names.length === 0) return null
      await removeFromStanding(uid, names)
      return null
    }

    case 'show_list': {
      const merged = await getMergedList(uid)
      if (merged.length === 0) return 'הרשימה ריקה.'
      const lines = merged.map(i => {
        const resolved = i.catalogId ? '' : ' (לא מקושר)'
        return `• ${i.name}${i.qty > 1 ? ` x${i.qty}` : ''}${resolved}`
      })
      return `רשימה להזמנה:\n${lines.join('\n')}`
    }

    case 'clear_pending': {
      await clearPending(uid)
      return null
    }

    case 'trigger_order': {
      const data = await getGroceryData(uid)
      const merged = mergeList(data.standingList, data.pendingChanges)
      if (merged.length === 0) return 'הרשימה ריקה — אין מה להזמין.'

      const withId = merged.filter(i => i.catalogId)
      const withoutId = merged.filter(i => !i.catalogId)

      if (withId.length === 0) {
        return `אין מוצרים מקושרים לשופרסל. ${withoutId.length} מוצרים לא מקושרים: ${withoutId.map(i => i.name).join(', ')}`
      }

      if (withoutId.length > 0) {
        console.log(`[ActionExecutor] Ordering without unlinked: ${withoutId.map(i => i.name).join(', ')}`)
      }

      const items = withId.map(i => ({ code: i.catalogId!, qty: i.qty }))

      const schedule = data.schedule
      const result = await checkout(uid, items, {
        day: schedule?.preferredSlot.day,
        time: schedule?.preferredSlot.time?.split('-')[0],
        nearest: !schedule, // no schedule = pick first available slot
      })

      if (result.success) {
        return `הזמנה בוצעה! #${result.orderId || ''}\nמשלוח: ${result.deliveryWindow?.day} ${result.deliveryWindow?.date} ${result.deliveryWindow?.time}`
      }
      return `שגיאה בהזמנה: ${result.error}`
    }

    case 'show_orders': {
      try {
        const orders = await ordersList(uid)
        if (orders.length === 0) return 'אין הזמנות פעילות.'
        const lines = orders.map(o => {
          const del = o.delivery
          const deliveryStr = del.date ? `${del.date} ${del.time}-${del.endTime}` : 'לא נקבע'
          const flags = [
            o.updatable ? 'ניתן לעדכן' : null,
            o.cancelable ? 'ניתן לבטל' : null,
          ].filter(Boolean).join(', ')
          const deadline = o.updateDeadline ? `\n  עדכון עד: ${o.updateDeadline}` : ''
          const itemsSummary = o.items.length > 0
            ? '\n  ' + o.items.slice(0, 5).map(i => `${i.name} x${i.qty}`).join(', ')
              + (o.itemsCount > 5 ? ` (+${o.itemsCount - 5} עוד)` : '')
            : `\n  ${o.itemsCount} פריטים`
          return `#${o.orderId} — ${o.total}\n  משלוח: ${deliveryStr}\n  ${flags}${deadline}${itemsSummary}`
        })
        return `הזמנות פעילות:\n\n${lines.join('\n\n')}`
      } catch (err) {
        console.error('[ActionExecutor] Failed to list orders:', err)
        return 'שגיאה בקריאת הזמנות משופרסל.'
      }
    }

    case 'cancel_order': {
      const data = await getGroceryData(uid)
      const cancelCycle = data.orderCycle
      if (!cancelCycle || cancelCycle.status === 'delivered') {
        return 'אין הזמנה פעילה לביטול.'
      }
      if (cancelCycle.orderId) {
        try {
          const ok = await shufersalCancel(uid, cancelCycle.orderId)
          if (!ok) return 'שופרסל לא אישר את הביטול. אולי ההזמנה כבר ננעלה.'
        } catch (err) {
          console.error('[ActionExecutor] Cancel order failed:', err)
          return 'שגיאה בביטול ההזמנה בשופרסל.'
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
        `לוח זמנים:`,
        `• פתיחת הזמנה: יום ${DAY_NAMES[schedule.orderDay]}`,
        `• משלוח: ${schedule.preferredSlot.day} ${schedule.preferredSlot.time}`,
        `• תזכורת: ${schedule.reviewReminderHours} שעות לפני`,
      ].join('\n')
    }

    case 'set_credentials': {
      const email = typeof action.email === 'string' ? action.email.trim() : ''
      const password = typeof action.password === 'string' ? action.password : ''
      if (!email || !password) return 'חסר אימייל או סיסמה.'
      await saveCredentials(uid, email, password)
      // Try to login immediately to verify
      try {
        await shufersalLogin(uid)
        await setCredentialsVerified(uid, true)
        return 'פרטי שופרסל נשמרו והתחברות הצליחה!'
      } catch (err) {
        console.error('[ActionExecutor] Shufersal login failed:', err)
        return 'פרטים נשמרו, אבל ההתחברות נכשלה. בדוק שהאימייל והסיסמה נכונים.'
      }
    }

    case 'create_task': {
      // TODO: push to confidential queue (agentTasks)
      return null
    }

    case 'list_tasks': {
      // TODO: read from open layer tasks
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
