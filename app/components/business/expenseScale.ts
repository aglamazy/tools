import type { Category } from '@/app/types/category'
import type { Business, ExpenseDocument, Transaction } from '@/app/db/financeDB'

/**
 * Group expense documents by transaction, keeping every doc rather than
 * letting a plain Map overwrite silently keep whichever came last — a
 * transaction can carry more than one ExpenseDocument (Sheli found one
 * real transaction with 4, split across pin states) and a naive last-wins
 * map could hide a correctly pinned doc behind an unrelated unpinned one
 * (aglamazo#402).
 */
export function groupExpenseDocsByTransaction(docs: ExpenseDocument[]): Map<string, ExpenseDocument[]> {
  const byTxId = new Map<string, ExpenseDocument[]>()
  for (const d of docs) {
    if (d.transactionId == null) continue
    const list = byTxId.get(d.transactionId)
    if (list) list.push(d)
    else byTxId.set(d.transactionId, [d])
  }
  return byTxId
}

/**
 * Which of a transaction's documents belongs in the current VAT-period view:
 * for a closed period, the one actually tagged to that payment (or none —
 * never a stray unrelated doc); for an open period, an untagged one,
 * preferring one that actually carries extracted amount/VAT data.
 */
export function resolveLinkedExpenseDoc(
  candidates: ExpenseDocument[] | undefined,
  opts: { isPeriodClosed: boolean; paymentSyncId?: string },
): ExpenseDocument | undefined {
  if (!candidates) return undefined
  if (opts.isPeriodClosed) {
    return candidates.find((d) => d.vatPaymentId === opts.paymentSyncId)
  }
  const unpinned = candidates.filter((d) => d.vatPaymentId == null)
  return unpinned.find((d) => d.amount != null || d.vatAmount != null) || unpinned[0]
}

/**
 * The fraction (0-1) of a transaction's ILS amount that counts toward this
 * business — 1 for a directly-assigned category, the owner's
 * deductibleByMember% for a folded household category, 0 otherwise. Shared
 * by effectiveExpenseAmount and effectiveExpenseNetAmount so gross and net
 * scale by the exact same ratio.
 */
export function expenseScaleFraction(
  tx: Transaction,
  business: Business,
  categoryByName: Map<string, Category>,
): number {
  if (!tx.category) return 0
  const cat = categoryByName.get(tx.category)
  if (!cat) return 0
  if (cat.businessId === business.syncId) return cat.excludeFromBusinessTotals ? 0 : 1
  if (cat.businessId) return 0 // belongs to a different business
  if (business.ownerSharePercent !== undefined) return 0 // partnership — a personal home-office deduction is not a shared-book expense
  if (!cat.isDeductible || !cat.deductibleByMember) return 0
  if (!business.userId) return 0
  const pct = cat.deductibleByMember[business.userId] ?? 0
  return pct > 0 ? pct / 100 : 0
}

export function effectiveExpenseAmount(
  tx: Transaction,
  business: Business,
  categoryByName: Map<string, Category>,
): number {
  const raw = Math.abs(tx.amount || 0)
  return raw * expenseScaleFraction(tx, business, categoryByName)
}

export type ExpenseLine = { tx: Transaction; fraction: number; recognizedAmount: number }

/**
 * aglamazo#394: a table that aggregates expenses across several of a
 * person's businesses (e.g. SelfEmployedIncomeTaxSection) doesn't know in
 * advance which business "owns" a given transaction's category — a
 * directly-assigned category matches exactly one, a household-folded one
 * (ארנונה/חשמל) matches whichever of the candidates the member owns. Try
 * each candidate and take the first non-zero fraction; every business in
 * the household-fold branch of expenseScaleFraction shares the same
 * deductibleByMember% for a given member, so it's not order-sensitive.
 */
export function resolveExpenseLine(
  tx: Transaction,
  candidateBusinesses: Business[],
  categoryByName: Map<string, Category>,
): ExpenseLine {
  let fraction = 0
  for (const business of candidateBusinesses) {
    fraction = expenseScaleFraction(tx, business, categoryByName)
    if (fraction > 0) break
  }
  const raw = Math.abs(tx.amount || 0)
  return { tx, fraction, recognizedAmount: raw * fraction }
}

/**
 * Net (VAT-excluded) counterpart of effectiveExpenseAmount (aglamazo#345).
 *
 * The BANK is authoritative for how many shekels actually left the account;
 * the matched document is authoritative for the VAT portion of that spend —
 * NOT for the total, since a foreign-currency invoice (Anthropic, Vercel,
 * DigitalOcean...) is denominated in USD while the bank charged ILS. Using
 * doc.amount as the base would silently record e.g. a ₪517.69 charge as
 * "174.46" (Sheli, 2026-09-08, live data). So: net = tx amount (ILS) minus
 * the document's own extracted VAT, 0 when there's no matched document or
 * it has none (most foreign SaaS invoices carry no Israeli VAT line at all).
 * Both terms are scaled by the same household/business fraction as the
 * gross figure, so a folded household expense's VAT reduces proportionally
 * too, not by its full amount.
 */
export function effectiveExpenseNetAmount(
  tx: Transaction,
  business: Business,
  categoryByName: Map<string, Category>,
  docVatAmount: number | undefined,
): number {
  const fraction = expenseScaleFraction(tx, business, categoryByName)
  if (fraction <= 0) return 0
  const raw = Math.abs(tx.amount || 0)
  const vat = Math.abs(docVatAmount || 0)
  return Math.max(0, raw - vat) * fraction
}

/**
 * Every expense category that contributes to a business's own Expense tab
 * and supplier pivot: categories directly assigned to this business
 * (cat.businessId === business.syncId) only.
 *
 * Previously also folded in household-scope deductible categories via the
 * owner's deductibleByMember share (2026-08-23, "Agla's electricity/water
 * example"; narrowed to wholly-owned businesses by aglamazo#340). Agla's
 * later, narrower call (aglamazo#369, 2026-09-13, live with Sheli): "The
 * household items should apear in taxes, but not iside BL" — a household
 * deduction (electricity, ארנונה) belongs on /app/taxes, never inside a
 * business's own Expense tab/pivot, wholly-owned or not. The proportional
 * split itself (expenseScaleFraction below) is unchanged and still drives
 * /app/taxes's TaxSelfEmployedSummaryTable, which doesn't call this
 * function — only the business-side category list narrowed.
 */
export function resolveBusinessExpenseCategories(categories: Category[], business: Business): Category[] {
  return categories.filter((c) => {
    if (c.type !== 'expense') return false
    return c.businessId === business.syncId && !c.excludeFromBusinessTotals
  })
}

/**
 * Every expense category that belongs to the household scope, not any
 * business — i.e. every category with no businessId (aglamazo#373: there
 * was no household equivalent of resolveBusinessExpenseCategories, so no
 * page could show the same year×vendor pivot for מזון/בית/חשמל/... that
 * every business already gets). Unlike resolveBusinessExpenseCategories,
 * this is unconditional on isDeductible/deductibleByMember — household
 * spend (groceries, culture, health) is real household spend whether or
 * not any part of it happens to also be tax-deductible.
 */
export function resolveHouseholdExpenseCategories(categories: Category[]): Category[] {
  return categories.filter((c) => c.type === 'expense' && !c.businessId)
}

/**
 * Net (VAT-excluded) amount for a household-scope transaction — the FULL
 * bank amount minus the matched document's own extracted VAT, never
 * scaled by any percentage. Household spend is 100% household by
 * definition; the business-side fractional scaling in
 * expenseScaleFraction only exists because a business may claim a SHARE
 * of a household-deductible category, which has no meaning on the
 * household's own view of its own full spend.
 */
export function householdExpenseNetAmount(tx: Transaction, docVatAmount: number | undefined): number {
  const raw = Math.abs(tx.amount || 0)
  const vat = Math.abs(docVatAmount || 0)
  return Math.max(0, raw - vat)
}

/**
 * A transaction's category resolves to its TOP-LEVEL name for the household
 * pivot's rows (aglamazo#373) — a sub-category (cat.parentId set) rolls up
 * into its parent's row rather than getting its own, matching the same
 * top-level-only convention Settings > נושאים > 🏠 משק בית uses for its own
 * listing (CategoriesTab.tsx's `!cat.parentId` filter). Falls back to the
 * category's own name when it has no resolvable parent (parent missing or
 * deleted) — rolling spend up to a name that no longer exists would hide
 * it, not organize it.
 */
export function resolveTopLevelCategoryName(
  categoryName: string,
  categoriesByName: Map<string, Category>,
  categoriesById: Map<string, Category>,
): string {
  const cat = categoriesByName.get(categoryName)
  if (!cat || !cat.parentId) return categoryName
  const parent = categoriesById.get(cat.parentId)
  return parent ? parent.name : categoryName
}
