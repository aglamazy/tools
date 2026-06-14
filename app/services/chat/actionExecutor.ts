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
} from '@/app/services/grocery/shufersalClient'
import { grantServerCredsConsent, hasCurrentServerCredsConsent, NoTier3ConsentError } from '@/app/services/consentService'
import { assertConsentForTurn, credActionErrorMessage } from '@/app/services/chat/credGuards'
// Note: retalixClient functions are no longer imported directly — the OTP
// flow goes through the resolved plugin (multi-store Rexail support).
// Exception: the anon Tier-1 path bypasses the plugin contract and calls
// `*WithCreds` helpers directly, because anon creds live in request memory
// (passed in from sessionStorage on the client) rather than Firestore.
import {
  sendOtpWithCreds,
  verifyOtpWithCreds,
  checkoutWithCreds,
  getRetalixConfigForStore,
} from '@/app/services/grocery/retalixClient'
import { getStore, getAllStores } from '@/app/services/grocery/storeRegistry'
import { getUserStores, setDefaultStore, addActiveStore, getStoreData, addToStoreStanding, addStorePendingItems, removeFromStoreStanding, removeStorePendingItems, clearStorePending, movePendingToStanding as moveStorePendingToStanding, getStoreSchedule, setStoreSchedule } from '@/app/services/grocery/groceryStoreMulti'
import type { OtpStorePlugin, CredentialsStorePlugin, StoreOrder } from '@/app/services/grocery/storeTypes'
import { preflightOrderSafety, finalizeOrderSuccess, finalizeOrderFailure, checkOrderSize } from '@/app/services/grocery/orderSafety'

import { listTasks, createTask, updateTask, deleteTask, findTasks } from '@/app/services/taskFirestoreService'
import { randomBytes } from 'crypto'
import { deleteMapping, lookupMapping, saveProductMapping } from '@/app/services/grocery/productResolver'

/**
 * Actions that require a connected store (auth-gated). Catalog reads
 * (search_product, list_categories, product_details) are deliberately NOT
 * here — Rexail's `/public/store/catalog` endpoint is fully public, so
 * anon visitors can browse any chain's catalog without first connecting.
 */
const STORE_ACTIONS = new Set(['trigger_order', 'cancel_order', 're_search', 'list_slots'])
// Note: `show_orders` handles its own auth check because it iterates all
// authenticated stores when no store is specified.

/**
 * Actions that fundamentally require a real signed-in account
 * (encrypted credentials, server-side cron registration, persistent state).
 * Anon visitors get a polite Hebrew response instead of execution.
 *
 * Saliko Tier 1 (anonymous OTP one-shot order) — per the privacy policy at
 * `app/saliko/privacy/privacyContent.ts` (SALIKO_PRIVACY_TIERS.anonymous),
 * anon visitors ARE allowed to:
 *   - set_otp_phone + verify_otp (OTP flow against a Rexail chain)
 *   - trigger_order (one shot — creds wiped at session end via TTL)
 *   - show_cart (see what's about to be ordered)
 * Persistent things (set_credentials/Shufersal, set_schedule, cancel_order,
 * show_orders) stay gated — they need state that outlives the session.
 */
const ACTIONS_REQUIRING_ACCOUNT = new Set([
  'cancel_order', 'set_credentials', 'set_schedule', 'show_orders',
])

const ANON_PREFIX = 'anon:'

/** True iff the anon caller has a valid token for the requested chain. */
function isAnonAuthedForStore(creds: AnonStoreCreds | null | undefined, storeId: string): boolean {
  return !!creds && creds.storeId === storeId && !!creds.token
}

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
 * Wipe ALL pending product-picker searches for this user. Called on greeting
 * (soft-reset) — a stale picker from yesterday is the wrong context for a
 * fresh "שלום" turn, and the user can't see+dismiss it from the floating
 * widget. Cheap: one Firestore overwrite, zero reads.
 */
export async function clearAllPendingSearches(uid: string): Promise<void> {
  await getAdminFirestore().collection('groceries').doc(uid)
    .collection('private').doc('pendingSearches').set({})
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

/**
 * Add a product to an already-open Shufersal order. MUST go through
 * `plugin.modifyOrder` — the full edit-order flow (login → cartFromOrder →
 * cartMerge(false) → cartAdd → commitCheckout(isEdit:true)).
 *
 * The previous implementation only did `orderLoadToCart` + `cartAdd`, which
 * put the session in edit-order mode without ever committing. A subsequent
 * `cartClear` (e.g. from a later checkout) would then wipe the order's
 * contents in-place — the 2026-04-28 "order opened with 1 product" incident.
 * See `project_shufersal_edit_order_flow.md`.
 */
async function pushToActiveCart(uid: string, catalogId: string, qty: number): Promise<void> {
  try {
    const shufersal = getStore('shufersal')
    if (!shufersal) return
    const orders = await shufersal.listOrders(uid).catch(() => [])
    const active = orders.find(o => o.cancelable)
    if (!active) {
      console.log(`[pushToActiveCart] uid=${uid} no active order — skip`)
      return
    }
    console.log(`[pushToActiveCart] uid=${uid} order=#${active.orderId} add catalog=${catalogId} qty=${qty}`)
    const result = await shufersal.modifyOrder(uid, active.orderId, {
      add: [{ productId: catalogId, qty }],
    })
    console.log(`[pushToActiveCart] uid=${uid} order=#${active.orderId} done: added=${result.added} failed=${result.failed.length}`)
    if (result.failed.length > 0) {
      console.error(`[pushToActiveCart] uid=${uid} order=#${active.orderId} failures:`, result.failed)
    }
  } catch (err) {
    console.error('[ActionExecutor] Failed to push to active cart:', err)
  }
}

/**
 * Anonymous Tier-1 cred state. Lives in the browser's sessionStorage (key
 * `saliko.anonStoreCreds`) and traverses the server in-memory only — the
 * server never persists it. The client reads it before each `/api/chat`
 * POST, ships it in the request body, and writes back whatever the server
 * returns on the response. On tab close: gone.
 *
 * `orderedOnce` enforces the Tier-1 "one-shot" guarantee: the server sets
 * it to `true` after a successful `trigger_order` and refuses subsequent
 * `trigger_order` calls — the user must register to keep ordering.
 */
export interface AnonStoreCreds {
  /** Chain id, e.g. 'retalix', 'rexail_basra'. */
  storeId: string
  /** Phone number captured at `set_otp_phone`. */
  phone: string
  /** Bearer token set on successful `verify_otp`. Absent before verify. */
  token?: string
  /** True after a successful Tier-1 `trigger_order` — locks further orders. */
  orderedOnce?: boolean
}

export interface ActionResult {
  /** Per-action results, in the same order as the input `actions` array — used to feed tool responses back to the LLM. */
  results: { name: string; result: string }[]
  /** Pending product searches that need user selection (stops the agentic loop — requires a callback). */
  pendingSelections?: PendingProductSelection[]
  /**
   * Updated anon-creds state to ship back to the client (only set when an
   * action mutated it: `set_otp_phone`, `verify_otp`, or successful Tier-1
   * `trigger_order`). When undefined, the client should keep whatever it had.
   */
  anonStoreCreds?: AnonStoreCreds | null
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

export async function executeActions(
  uid: string,
  actions: ChatAction[],
  sessionStore?: string | null,
  inboundAnonCreds?: AnonStoreCreds | null,
): Promise<ActionResult> {
  const results: { name: string; result: string }[] = []
  const allPending: PendingProductSelection[] = []
  // Carry the anon cred forward across actions in the same batch. Each
  // executeOne call may read it (current state) and/or return an updated
  // version (set_otp_phone / verify_otp / successful trigger_order). The
  // final value is what gets shipped back to the client.
  let workingAnonCreds: AnonStoreCreds | null | undefined = inboundAnonCreds
  let anonCredsTouched = false

  // Same-turn consent defense (C01): snapshot whether Tier-3 consent existed
  // BEFORE this batch. A server-side save must require consent from a PRIOR
  // turn, so a bundled grant + set_credentials/set_otp_phone can't self-authorize.
  const consentExistedBeforeBatch = !uid.startsWith(ANON_PREFIX) && await hasCurrentServerCredsConsent(uid)

  for (const action of actions) {
    try {
      const r = await executeOne(uid, action, sessionStore, workingAnonCreds, consentExistedBeforeBatch)
      if (typeof r === 'string') {
        results.push({ name: action.action, result: r })
      } else if (r) {
        // Collect per-action text for feedback; attach pendingSelections separately.
        if (r.followUp) results.push({ name: action.action, result: r.followUp })
        else results.push({ name: action.action, result: 'ok' })
        if (r.pendingSelections) allPending.push(...r.pendingSelections)
        if (r.anonStoreCreds !== undefined) {
          workingAnonCreds = r.anonStoreCreds
          anonCredsTouched = true
        }
      } else {
        results.push({ name: action.action, result: 'ok' })
      }
    } catch (err) {
      console.error(`[ActionExecutor] Failed action=${action.action}:`, err instanceof Error ? err.message : String(err))
      // C10-aware: decryption failure → re-enter-cred message, else generic.
      results.push({ name: action.action, result: credActionErrorMessage(err) })
    }
  }

  return {
    results,
    pendingSelections: allPending.length > 0 ? allPending : undefined,
    // Only surface anonStoreCreds when an action actually mutated it. This
    // keeps the response payload clean for the common no-op case and lets
    // the client distinguish "nothing changed, keep current" (undefined)
    // from "wipe it" (null).
    anonStoreCreds: anonCredsTouched ? workingAnonCreds ?? null : undefined,
  }
}

interface ExecuteOneResult {
  followUp?: string | null
  pendingSelections?: PendingProductSelection[]
  /**
   * Updated anon Tier-1 cred state. `undefined` = unchanged, `null` = wipe.
   * Set by `set_otp_phone`, `verify_otp`, and successful Tier-1 `trigger_order`.
   */
  anonStoreCreds?: AnonStoreCreds | null
}

async function executeOne(
  uid: string,
  action: ChatAction,
  sessionStore?: string | null,
  inboundAnonCreds?: AnonStoreCreds | null, consentExistedBeforeBatch = false,
): Promise<string | ExecuteOneResult | null> {
  const isAnon = uid.startsWith(ANON_PREFIX)

  // Guard: anon visitors can chat freely with the LLM, but tools that need
  // a real account (encrypted creds, schedule, cron) get a friendly Hebrew
  // bounce. The LLM relays this back to the user verbatim.
  if (isAnon && ACTIONS_REQUIRING_ACCOUNT.has(action.action)) {
    return 'כדי להפעיל את הסוכן (לחבר חנות, לקבוע לוח זמנים, או לפתוח הזמנה) צריך להתחבר. כל השאר זמין גם בלי התחברות.'
  }

  // Guard: store actions require authenticated store.
  // For anon: "authenticated" means we have an unexpired token in the
  // request-scope `inboundAnonCreds` (sessionStorage state). For logged-in
  // users it's the standard Firestore-backed `isAuthenticated` check.
  if (STORE_ACTIONS.has(action.action)) {
    const storeId = await resolveActionStore(uid, action, sessionStore)
    const store = getStore(storeId)
    if (!store) return `חנות "${storeId}" לא מוכרת.`
    const authenticated = isAnon
      ? isAnonAuthedForStore(inboundAnonCreds, storeId)
      : await store.isAuthenticated(uid)
    if (!authenticated) {
      if (isAnon) {
        // For anon, "not authed" means either no cred at all (need OTP) or
        // session-storage was wiped/lost between turns. Either way, restart
        // the OTP flow.
        if (store.authType === 'otp') return `${store.label} לא מחובר בסשן הזה. שלח מספר טלפון כדי לחבר.`
        return `${store.label} לא תומך בחיבור אנונימי — נדרשת הרשמה.`
      }
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

      // If Shufersal has an active (cancelable) order, also remove from it
      // through the proper edit-order flow. Same destructive-cart trap as
      // pushToActiveCart if we cartRemove without cartMerge + commitCheckout.
      if (rmStoreId === 'shufersal') {
        try {
          const shufersal = getStore('shufersal')
          if (shufersal) {
            const orders = await shufersal.listOrders(uid).catch(() => [])
            const active = orders.find(o => o.cancelable)
            if (active) {
              const orderItems = await shufersal.readOrderItems(uid, active.orderId).catch(() => [])
              const refs: string[] = []
              for (const name of names) {
                const lowerName = name.toLowerCase()
                const match = orderItems.find(i => i.name.toLowerCase().includes(lowerName))
                if (match?.entryRef) refs.push(match.entryRef)
              }
              if (refs.length > 0) {
                console.log(`[remove_items] uid=${uid} order=#${active.orderId} remove refs=${refs.join(',')}`)
                const result = await shufersal.modifyOrder(uid, active.orderId, { remove: refs })
                console.log(`[remove_items] uid=${uid} order=#${active.orderId} done: removed=${result.removed} failed=${result.failed.length}`)
              }
            }
          }
        } catch (err) {
          console.error(`[ActionExecutor] Failed to remove from live order:`, err)
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

      // Defensive size guard — same floor as the cron. The 2026-04-28 incident
      // placed a 1-line chat-triggered order because this check was missing here.
      const sizeCheck = checkOrderSize(merged)
      if (!sizeCheck.ok) {
        console.warn(`[ActionExecutor] Safety: uid=${uid} store=${storeId} decision=size-skip`)
        return `⚠️ לא פתחתי הזמנה ב${store.label}: ${sizeCheck.reason}. אפשר להוסיף פריטים ולנסות שוב.`
      }

      const withId = merged.filter(i => i.catalogId)
      const withoutId = merged.filter(i => !i.catalogId)
      if (withoutId.length > 0) {
        console.log(`[ActionExecutor] Ordering without unlinked: ${withoutId.map(i => i.name).join(', ')}`)
      }

      const items = withId.map(i => ({ code: i.catalogId!, qty: i.qty, sellingUnitId: i.sellingUnitId }))
      const actionDay = typeof action.day === 'string' ? action.day : undefined
      const actionTime = typeof action.time === 'string' ? action.time : undefined
      const schedule = data.schedule
      const day = actionDay || schedule?.preferredSlot.day
      const time = actionTime || schedule?.preferredSlot.time?.split('-')[0]

      // --- Anon Tier-1 branch ---
      // No safety gate (cron-only concern), no finalizeOrderSuccess writes.
      // Enforce the policy's one-shot rule via the orderedOnce flag carried
      // in sessionStorage. checkoutWithCreds bypasses the Firestore cred read.
      if (isAnon) {
        if (!inboundAnonCreds || inboundAnonCreds.storeId !== storeId || !inboundAnonCreds.token) {
          return 'אבד החיבור — צריך להתחיל מחדש. שלח מספר טלפון כדי לחבר את החנות.'
        }
        if (inboundAnonCreds.orderedOnce === true) {
          return 'כבר ביצעת הזמנה אחת באנונימי. כדי לבצע עוד — תתחבר (Google sign-in).'
        }
        const config = getRetalixConfigForStore(storeId)
        if (!config) return `חנות "${storeId}" לא מוכרת.`
        // Convert items to numeric ids (Rexail format) and pass through.
        const numericItems = items.map(i => ({
          id: parseInt(i.code, 10),
          qty: i.qty,
          sellingUnitId: i.sellingUnitId || 0,
        }))
        try {
          const result = await checkoutWithCreds(
            uid,
            storeId,
            numericItems,
            { day, hour: time ? parseInt(time, 10) : undefined, nearest: !day },
            { phone: inboundAnonCreds.phone, token: inboundAnonCreds.token, config },
          )
          if (result.success) {
            // Lock further anon orders; ship the new state back to sessionStorage.
            return {
              followUp: `הזמנה בוצעה ב${store.label}! #${result.orderId || ''}\nמשלוח: ${result.deliveryWindow?.day} ${result.deliveryWindow?.date} ${result.deliveryWindow?.time}`,
              anonStoreCreds: { ...inboundAnonCreds, orderedOnce: true },
            }
          }
          if (result.dryRun) {
            return `דמה-ריצה (SALIKO_DRY_RUN): לא בוצעה הזמנה אמיתית. חלון משלוח שזוהה: ${result.deliveryWindow?.day} ${result.deliveryWindow?.date} ${result.deliveryWindow?.time}.`
          }
          return `שגיאה בהזמנה ב${store.label}: ${result.error}`
        } catch (checkoutErr) {
          const msg = checkoutErr instanceof Error ? checkoutErr.message : String(checkoutErr)
          console.error('[ActionExecutor] Anon checkout failed:', msg)
          return `שגיאה בהזמנה ב${store.label}: ${msg}`
        }
      }

      // --- Logged-in branch ---
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
        if (result.dryRun) {
          // dryRun short-circuits before the real place-order call. Release
          // the safety-gate lock so subsequent attempts aren't blocked by a
          // 'race' verdict from a previous dryRun that never finalized.
          await finalizeOrderFailure({
            uid, storeId, idempotencyKey: gate.idempotencyKey, cycle: gate.cycle, now: safetyNow,
            error: 'dry-run',
          })
          return `דמה-ריצה: לא בוצעה הזמנה אמיתית. חלון משלוח שזוהה: ${result.deliveryWindow?.day} ${result.deliveryWindow?.date} ${result.deliveryWindow?.time}.`
        }
        await finalizeOrderFailure({
          uid, storeId, idempotencyKey: gate.idempotencyKey, cycle: gate.cycle, now: safetyNow,
          error: result.error || 'unknown',
        })
        return `שגיאה בהזמנה ב${store.label}: ${result.error || 'שגיאה לא ידועה'}`
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

    case 'list_categories': {
      const storeId = await resolveActionStore(uid, action, sessionStore)
      const store = getStore(storeId)
      if (!store) return `חנות "${storeId}" לא מוכרת.`
      try {
        const cats = await store.listCategories(uid)
        if (cats.length === 0) return `ב${store.label} אין רשימת קטגוריות זמינה — נסה לחפש מוצר ספציפי.`
        // Cap at 30 to keep replies tight; the most common ones come first.
        const list = cats.slice(0, 30).join(', ')
        const more = cats.length > 30 ? ` (ועוד ${cats.length - 30})` : ''
        return `קטגוריות ב${store.label}: ${list}${more}.`
      } catch (err) {
        console.error(`[ActionExecutor] list_categories failed (${storeId}):`, err)
        return `שגיאה בקריאת קטגוריות ב${store.label}.`
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
        const cart = await shufersal.readOrderItems(uid, active.orderId)
        if (cart.length === 0) return `הזמנה #${active.orderId}: העגלה ריקה.`
        const lines = cart.map(item => {
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
    //
    // Saliko Tier 3 — connecting a store from chat = persisting credentials
    // server-side. Per the privacy policy
    // (`app/saliko/privacy/privacyContent.ts`, SALIKO_PRIVACY_TIERS.loggedInWithServerCreds)
    // consent MUST be on file BEFORE this call. The umbrella
    // `acceptServerCredsConsent` flag was removed (B02 regression: the LLM
    // interpreted "user sent creds in chat" as implicit consent and auto-flipped
    // it, silently graduating Tier 2 users to Tier 3). The LLM must now emit
    // `grant_server_creds_consent` as a SEPARATE action first — and only after
    // the user explicitly said one of the recognized consent phrases (see the
    // hard rule in `chatProcessor.ts`'s "🚨 כלל קשיח" section). If consent isn't
    // on file, this throws NoTier3ConsentError and the caller routes the user
    // to either the Settings vault (Tier 2) or explicit consent.
    case 'set_credentials': {
      const email = typeof action.email === 'string' ? action.email.trim() : ''
      const password = typeof action.password === 'string' ? action.password : ''
      if (!email || !password) return 'חסר אימייל או סיסמה.'
      // Same-turn defense: needs consent from a PRIOR turn (see executeActions).
      assertConsentForTurn(isAnon || consentExistedBeforeBatch, 'shufersal')
      try {
        await saveCredentials(uid, email, password)
      } catch (err) {
        if (err instanceof NoTier3ConsentError) {
          return 'כדי לשמור פרטי שופרסל בשרת (כדי שהזמנות אוטומטיות יוכלו לרוץ כשאינך מחובר) צריך אישור מפורש שטרם נתת. שתי דרכים מקובלות: (1) שמירה מקומית בלבד דרך הגדרות → חיבורים חיצוניים (Tier 2 — הסיסמה נשארת רק בדפדפן שלך). (2) אם דווקא רוצה שמירה בשרת (Tier 3): תאמר במפורש "אני מאשר Tier 3" / "אני מאשר שמירה בשרת" ואז אחזור על הפעולה.'
        }
        throw err
      }
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

    case 'grant_server_creds_consent': {
      // Explicit Tier-3 consent grant (chat-side). Idempotent — re-granting
      // simply re-stamps the current policy version. Anon users land here
      // only if the LLM misroutes; we'd no-op rather than crash.
      if (uid.startsWith(ANON_PREFIX)) {
        return 'אישור Tier 3 רלוונטי רק למשתמשים רשומים. נסה להירשם דרך Google sign-in קודם.'
      }
      await grantServerCredsConsent(uid)
      return 'אישור Tier 3 (שמירת פרטי חיבור בשרת) נרשם. עכשיו אפשר לחבר חנויות כך שהזמנות אוטומטיות יוכלו לפעול גם כשאינך מחובר.'
    }

    case 'set_otp_phone': {
      const phone = typeof action.phone === 'string' ? action.phone.trim() : ''
      if (!phone) return 'חסר מספר טלפון.'
      // Resolve which OTP-based chain the user is connecting. Default keeps
      // the legacy 'retalix' (Makor HaShefa) for back-compat with old prompts.
      const targetStoreId = await resolveActionStore(uid, action, sessionStore).catch(() => 'retalix')
      const plugin = getStore(targetStoreId)
      if (!plugin || plugin.authType !== 'otp') return `חנות "${targetStoreId}" לא תומכת בחיבור עם SMS.`

      // --- Anon Tier-1 branch ---
      // Per privacy policy SALIKO_PRIVACY_TIERS.anonymous: do NOT touch
      // Firestore. Resolve the chain config statically, dispatch the SMS
      // via the cred-pass-through helper, and return the new anon cred
      // state for the client to stash in sessionStorage. No `orderedOnce`
      // yet — that gets set only after a successful trigger_order.
      if (isAnon) {
        const config = getRetalixConfigForStore(targetStoreId)
        if (!config) return `חנות "${targetStoreId}" לא מוכרת.`
        try {
          await sendOtpWithCreds({ phone, config })
          return {
            followUp: `שלחתי קוד SMS ל-${plugin.label}. שלח לי את הקוד שקיבלת.`,
            anonStoreCreds: { storeId: targetStoreId, phone },
          }
        } catch (err) {
          console.error('[ActionExecutor] Anon Send OTP failed:', err)
          return 'שגיאה בשליחת SMS. בדוק את מספר הטלפון.'
        }
      }

      // --- Logged-in branch (Tier 2/3) ---
      // Consent must already be on file. The umbrella `acceptServerCredsConsent`
      // flag was removed (B02 regression — same reason as set_credentials).
      // For Tier 3, the LLM must emit `grant_server_creds_consent` as a separate
      // prior action after the user said one of the recognized consent phrases.
      // Same-turn defense (C01): require consent from a PRIOR turn.
      assertConsentForTurn(consentExistedBeforeBatch, 'otp', plugin.label)
      try {
        await (plugin as OtpStorePlugin).sendOtp(uid, phone)
        return `שלחתי קוד SMS ל-${plugin.label}. שלח לי את הקוד שקיבלת.`
      } catch (err) {
        if (err instanceof NoTier3ConsentError) {
          return `כדי לחבר את ${plugin.label} בחשבון רשום צריך אישור Tier 3 שטרם נתת. תאמר במפורש "אני מאשר Tier 3" / "אני מאשר שמירה בשרת" ואחזור על הפעולה. לחלופין, חיבור Tier 2 דרך הגדרות → חיבורים חיצוניים שומר את הטלפון רק בדפדפן.`
        }
        console.error('[ActionExecutor] Send OTP failed:', err)
        return 'שגיאה בשליחת SMS. בדוק את מספר הטלפון.'
      }
    }

    case 'verify_otp': {
      const otp = typeof action.otp === 'string' ? action.otp.trim() : ''
      if (!otp) return 'חסר קוד.'
      const targetStoreId = await resolveActionStore(uid, action, sessionStore).catch(() => 'retalix')
      const plugin = getStore(targetStoreId)
      if (!plugin || plugin.authType !== 'otp') return `חנות "${targetStoreId}" לא תומכת בחיבור עם SMS.`

      // --- Anon Tier-1 branch ---
      // The inbound creds carry `{storeId, phone}` from the previous
      // set_otp_phone turn (round-tripped through sessionStorage). Validate
      // OTP via the pass-through helper, then return the cred with the new
      // token for the client to stash. Server keeps nothing.
      if (isAnon) {
        if (!inboundAnonCreds || inboundAnonCreds.storeId !== targetStoreId || !inboundAnonCreds.phone) {
          return 'אבד החיבור — צריך להתחיל מחדש. שלח מספר טלפון.'
        }
        const config = getRetalixConfigForStore(targetStoreId)
        if (!config) return `חנות "${targetStoreId}" לא מוכרת.`
        try {
          const token = await verifyOtpWithCreds({ phone: inboundAnonCreds.phone, config }, otp)
          return {
            followUp: `חשבון ${plugin.label} חובר בהצלחה! החיבור תקף לסשן הזה בלבד — מתאים להזמנה חד-פעמית. הרשמה תאפשר לשמור רשימות וקביעת לוח זמנים.`,
            anonStoreCreds: { storeId: targetStoreId, phone: inboundAnonCreds.phone, token },
          }
        } catch (err) {
          console.error('[ActionExecutor] Anon Verify OTP failed:', err)
          return 'הקוד שגוי. נסה שוב או בקש קוד חדש.'
        }
      }

      // --- Logged-in branch ---
      try {
        await (plugin as OtpStorePlugin).verifyOtp(uid, otp)
        await addActiveStore(uid, targetStoreId)
        return `חשבון ${plugin.label} חובר בהצלחה!`
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
