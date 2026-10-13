/**
 * Basket proposals (saliko#38): "about 10 basic veg/fruit, lowest prices, for
 * my approval". Before this there was no tool for it, so the model improvised
 * — it pulled dried cranberries into a fresh basket, skipped the cheaper
 * variants and showed no prices or total.
 *
 * propose_basket searches each item, takes the top-ranked option (catalog
 * ranking: fresh produce, then the item itself, then cheapest), drops items
 * with no fresh match when freshOnly, and returns a priced list with an
 * estimated total. Nothing is added yet: the proposal is stored, and
 * approve_basket adds it (minus any items the user rejects).
 */
import { getAdminFirestore } from '@/app/lib/firebaseAdmin'
import { getStore } from '@/app/services/grocery/storeRegistry'
import { addStorePendingItems } from '@/app/services/grocery/groceryStoreMulti'
import { saveProductMapping } from '@/app/services/grocery/productResolver'
import { isFreshProduce, nameMatchesQuery } from '@/app/services/grocery/catalogMatch'
import type { StoreSearchResult } from '@/app/services/grocery/storeTypes'
import { sellUnitOf } from '@/app/services/grocery/unitLabel'

export interface ProposedItem {
  query: string
  catalogId: string
  name: string
  price: number
  unitPrice: string
  sellUnit?: string
  sellingUnitId?: number
}

export interface BasketProposal {
  store: string
  items: ProposedItem[]
  createdAt: string
}

const proposalRef = (uid: string) =>
  getAdminFirestore().collection('groceries').doc(uid).collection('private').doc('basketProposal')

/** Pure pick + format, separated for tests. */
export function pickForBasket(
  query: string,
  results: StoreSearchResult[],
  freshOnly: boolean,
): { item: ProposedItem } | { skip: string } {
  const usable = freshOnly ? results.filter(r => isFreshProduce(r.brand, '', r.name)) : results
  const best = usable[0]
  if (!best) return { skip: freshOnly && results.length ? `"${query}": אין גרסה טרייה בקטלוג` : `"${query}": לא נמצא בקטלוג` }
  return {
    item: {
      query, catalogId: best.productId, name: best.name,
      price: Number(best.price) || 0, unitPrice: best.unitPrice, sellUnit: best.sellUnit, sellingUnitId: best.sellingUnitId,
    },
  }
}

export function formatProposal(storeLabel: string, items: ProposedItem[], skipped: string[]): string {
  const lines = items.map((it, i) => `${i + 1}. ${it.name} — ${it.unitPrice}`)
  const total = items.reduce((sum, it) => sum + it.price, 0)
  return [
    `הצעת סל מ${storeLabel} (${items.length} פריטים, הגרסה הזולה ביותר של כל אחד):`,
    ...lines,
    `סה"כ משוער: ${total.toFixed(2)} ₪ (לפי 1 ק"ג או יחידה/מארז מכל פריט; במוצרים במשקל הסכום הסופי לפי השקילה).`,
    ...(skipped.length ? [`לא נכנסו: ${skipped.join('; ')}.`] : []),
    'זו הצעה בלבד, עוד לא הוספתי כלום. הצג אותה למשתמש כמו שהיא (שורה, מחיר, סה"כ) ושאל אם לאשר או מה להוריד/להחליף.',
  ].join('\n')
}

export async function proposeBasket(uid: string, storeId: string, queries: string[], freshOnly: boolean): Promise<string> {
  const store = getStore(storeId)
  if (!store) return `חנות "${storeId}" לא מוכרת.`
  const items: ProposedItem[] = []
  const skipped: string[] = []
  for (const query of queries.map(q => q.trim()).filter(Boolean)) {
    try {
      const picked = pickForBasket(query, await store.search(uid, query), freshOnly)
      if ('item' in picked) items.push(picked.item)
      else skipped.push(picked.skip)
    } catch (err) {
      console.error(`[basketProposal] search failed for "${query}" (${storeId}):`, err)
      skipped.push(`"${query}": שגיאה בחיפוש`)
    }
  }
  if (items.length === 0) return `לא הצלחתי להרכיב סל: ${skipped.join('; ')}.`
  await proposalRef(uid).set({ store: storeId, items: JSON.parse(JSON.stringify(items)), createdAt: new Date().toISOString() })
  return formatProposal(store.label, items, skipped)
}

export async function approveBasket(uid: string, exclude: string[], validTo?: string): Promise<string> {
  const doc = await proposalRef(uid).get()
  if (!doc.exists) return 'אין הצעת סל פתוחה — צריך להציע סל קודם.'
  const proposal = doc.data() as BasketProposal
  const store = getStore(proposal.store)
  if (!store) return `חנות "${proposal.store}" לא מוכרת.`
  const isExcluded = (it: ProposedItem) => exclude.some(x => nameMatchesQuery(it.name, x) || nameMatchesQuery(it.query, x))
  const chosen = proposal.items.filter(it => !isExcluded(it))
  if (chosen.length === 0) return 'כל הפריטים הוצאו מההצעה — לא הוספתי כלום.'
  await addStorePendingItems(uid, proposal.store, chosen.map(it => ({
    name: it.name, qty: 1, catalogId: it.catalogId,
    unit: sellUnitOf(it),
    ...(it.sellingUnitId != null ? { sellingUnitId: it.sellingUnitId } : {}),
  })), { validTo })
  await Promise.all(chosen.map(it => saveProductMapping(uid, it.query, it.catalogId, it.name, proposal.store)))
  await proposalRef(uid).delete()
  const left = proposal.items.length - chosen.length
  return `✅ הוספתי ${chosen.length} פריטים לרשימה ב${store.label}: ${chosen.map(it => it.name).join(', ')}.` +
    (left ? ` (${left} הוצאו לפי בקשתך.)` : '')
}
