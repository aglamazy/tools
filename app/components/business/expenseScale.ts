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
 * Every expense category that contributes to a business's own expense
 * views: directly assigned (cat.businessId === business.syncId) OR a
 * household-scope deductible category folded in via the business owner's
 * deductibleByMember share (same rule effectiveExpenseAmount uses to scale
 * the amount). Centralized here so every consumer (ExpenseTab, the supplier
 * pivot, Taxes) resolves the same category set — a business-only view of
 * this list previously missed the household-deductible half entirely
 * (aglamazo: Agla's electricity/water example, 2026-08-23).
 *
 * The household fold only applies to a business the member WHOLLY owns —
 * gated on ownerSharePercent being absent, not on its value (a partnership
 * temporarily at 100% is still a partnership). A personal home-office
 * deduction is Agla's own tax attribute; it has no place in a shared book a
 * partner reads, so it never reaches a business with ownerSharePercent set
 * (aglamazo#340, Agla 2026-09-08: "This doesn't relate to AH settlement with
 * Nadar" — it still belongs on /app/taxes and on his own solely-owned
 * businesses' Expense tabs, unchanged).
 */
export function resolveBusinessExpenseCategories(categories: Category[], business: Business): Category[] {
  return categories.filter((c) => {
    if (c.type !== 'expense') return false
    if (c.businessId === business.syncId) return !c.excludeFromBusinessTotals
    if (c.businessId) return false
    if (business.ownerSharePercent !== undefined) return false
    if (!business.userId) return false
    return !!c.isDeductible && (c.deductibleByMember?.[business.userId] ?? 0) > 0
  })
}
