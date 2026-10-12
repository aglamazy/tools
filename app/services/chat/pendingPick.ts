/**
 * Resolve a typed reply to the product pickers that are open (saliko#36).
 *
 * Before: select_pending_product took only a number and always applied it to
 * "the latest" picker, so typing the product name ("בננה, 1 ק"ג") made the
 * model search again and re-show the same picker, and with three pickers open
 * a bare "1" landed on whichever was saved last (the middle one, in Tester's run).
 *
 * Now the reply can name the product (matched against the shown options) and/or
 * the item being chosen for (matched against the picker's query). A bare number
 * with more than one picker open is not guessed: the caller asks which item.
 */
import { nameMatchesQuery } from '@/app/services/grocery/catalogMatch'
import type { PendingProductSelection } from './pendingSearchService'

export interface OpenPicker { key: string; entry: PendingProductSelection }

export type PickResolution =
  | { kind: 'pick'; key: string; index: number }
  | { kind: 'ask'; message: string }

const matches = (a: string, b: string) => nameMatchesQuery(a, b) || nameMatchesQuery(b, a)

export function resolvePendingPick(
  open: OpenPicker[],
  args: { resultIndex?: number; productName?: string; forItem?: string },
): PickResolution {
  if (open.length === 0) return { kind: 'ask', message: 'אין בחירה פתוחה — צריך לחפש שוב.' }
  const productName = args.productName?.trim()
  const forItem = args.forItem?.trim()

  let candidates = open
  if (forItem) {
    const byItem = open.filter(p => matches(p.entry.query, forItem))
    if (byItem.length) candidates = byItem
  }
  if (productName && candidates.length > 1) {
    const byProduct = candidates.filter(p => p.entry.results.some(r => matches(r.name, productName)))
    if (byProduct.length) candidates = byProduct
  }
  if (candidates.length > 1) {
    const items = candidates.map(p => `"${p.entry.query}"`).join(', ')
    return { kind: 'ask', message: `יש כמה בחירות פתוחות (${items}). לאיזה מוצר הבחירה? כתוב למשל "${candidates[0].entry.query} 1".` }
  }

  const picker = candidates[0]
  const results = picker.entry.results
  if (typeof args.resultIndex === 'number' && Number.isInteger(args.resultIndex)) {
    const index = args.resultIndex - 1
    if (index < 0 || index >= results.length) {
      return { kind: 'ask', message: `ל"${picker.entry.query}" יש ${results.length} אפשרויות — מספר לא תקין.` }
    }
    return { kind: 'pick', key: picker.key, index }
  }
  if (productName) {
    const exact = results.findIndex(r => r.name.trim() === productName)
    const index = exact >= 0 ? exact : results.findIndex(r => matches(r.name, productName))
    if (index >= 0) return { kind: 'pick', key: picker.key, index }
    return { kind: 'ask', message: `לא מצאתי "${productName}" באפשרויות של "${picker.entry.query}". כתוב את המספר שלו מהרשימה.` }
  }
  return { kind: 'ask', message: `איזו אפשרות ל"${picker.entry.query}"? כתוב מספר או שם מוצר.` }
}
