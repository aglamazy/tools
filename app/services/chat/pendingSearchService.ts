/**
 * Storage + resolution for product-picker state: a search that returned
 * multiple candidates and is waiting for the user to pick one (by button
 * click on Telegram/web, or by a free-text reply resolved via
 * select_pending_product in actionExecutor.ts).
 *
 * Split out of actionExecutor.ts (#276) to keep that file under the 850-line
 * eslint cap — this is a cohesive, self-contained unit (all reads/writes of
 * the `pendingSearches` Firestore subdocument).
 */

import { randomBytes } from 'crypto'
import { getAdminFirestore } from '@/app/lib/firebaseAdmin'
import { getUserStores, clearStorePending, addToStoreStanding, addStorePendingItems } from '@/app/services/grocery/groceryStoreMulti'
import { saveProductMapping } from '@/app/services/grocery/productResolver'

export interface PendingProductSelection {
  query: string
  qty: number
  target: 'pending' | 'standing'
  store?: string  // which store these results came from
  /** ISO date/datetime — only meaningful for target='pending'. Absent = single-shot. */
  validTo?: string
  results: { catalogId: string; name: string; brand: string; price: string; unitPrice: string; sellingUnitId?: number }[]
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
 * The most recently shown picker for this user, so a free-text reply
 * ("2", "השני", "תוסיף 2 מהראשון") can resolve against it without the LLM
 * needing to know the internal searchKey (#276 — text replies used to fall
 * through to a fresh search_product call instead of picking).
 */
export async function loadLatestPendingSearch(uid: string): Promise<{ key: string; entry: PendingProductSelection } | null> {
  const doc = await getAdminFirestore().collection('groceries').doc(uid)
    .collection('private').doc('pendingSearches').get()
  if (!doc.exists) return null
  const data = doc.data() || {}
  let latestKey: string | null = null
  let latestAt = ''
  for (const [key, entry] of Object.entries(data)) {
    const createdAt = (entry as { createdAt?: string })?.createdAt || ''
    if (!latestKey || createdAt > latestAt) {
      latestKey = key
      latestAt = createdAt
    }
  }
  if (!latestKey) return null
  const entry = await loadPendingSearch(uid, latestKey)
  return entry ? { key: latestKey, entry } : null
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
 * Clear all pending cart state for the user's active stores, plus any stale
 * product-picker searches. Leaves chat history and standing lists intact.
 */
export async function clearAllPendingState(uid: string): Promise<void> {
  const meta = await getUserStores(uid)
  await Promise.all([
    clearAllPendingSearches(uid),
    ...meta.activeStores.map(store => clearStorePending(uid, store)),
  ])
}

/**
 * Select a product from a pending search and save it to the appropriate list.
 * Returns a confirmation message. Used by both Telegram callback and app chat select.
 */
export async function selectProduct(uid: string, searchKey: string, resultIndex: number, qtyOverride?: number): Promise<{ message: string; target: string }> {
  const pendingSearch = await loadPendingSearch(uid, searchKey)
  if (!pendingSearch || resultIndex >= pendingSearch.results.length) {
    throw new Error('החיפוש פג תוקף')
  }

  const qty = qtyOverride && qtyOverride > 0 ? qtyOverride : pendingSearch.qty
  const selected = pendingSearch.results[resultIndex]
  const unit = selected.unitPrice?.split('/')?.pop()?.trim()
  const item = {
    name: selected.name, qty, catalogId: selected.catalogId,
    ...(unit ? { unit } : {}),
    ...(selected.sellingUnitId != null ? { sellingUnitId: selected.sellingUnitId } : {}),
  }

  const selStoreId = pendingSearch.store || 'shufersal'
  if (pendingSearch.target === 'standing') {
    await addToStoreStanding(uid, selStoreId, [item])
  } else {
    await addStorePendingItems(uid, selStoreId, [item], { validTo: pendingSearch.validTo })
  }

  await saveProductMapping(uid, pendingSearch.query, selected.catalogId, selected.name, selStoreId)
  await deletePendingSearch(uid, searchKey)

  // NOTE: even when there's an open order, we do NOT push to the live order
  // here. Each live edit is a full ~30s login→merge→commit cycle (the
  // 33.9s-per-item problem). Instead the item just buffers into pendingChanges,
  // and the user applies the whole batch in one commit via the `update_order`
  // tool after the agent asks for approval. See the "הזמנה פתוחה" prompt section.
  const targetLabel = pendingSearch.target === 'standing' ? 'קבועה' : 'הזמנה'
  return {
    message: `✅ ${selected.name} (x${qty}) נוסף לרשימה ${targetLabel}`,
    target: targetLabel,
  }
}
