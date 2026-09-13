import type { Category } from '@/app/types/category'
import type { Business, Transaction } from '@/app/db/financeDB'

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
