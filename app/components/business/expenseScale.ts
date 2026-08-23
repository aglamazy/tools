import type { Category } from '@/app/types/category'
import type { Business, Transaction } from '@/app/db/financeDB'

/**
 * Effective deductible amount of an expense transaction for a given business.
 * - Direct business expenses (cat.businessId set) → full |amount|, unless
 *   cat.excludeFromBusinessTotals is set (partner-offset-only category) → 0.
 * - Household-scope deductible categories (no businessId, isDeductible=true) → |amount| × deductibleByMember[business.userId] / 100.
 * - Categories that aren't tied to the business at all → 0.
 *
 * Returns a positive number (callers can negate when displaying expenses).
 */
export function effectiveExpenseAmount(
  tx: Transaction,
  business: Business,
  categoryByName: Map<string, Category>,
): number {
  const raw = Math.abs(tx.amount || 0)
  if (!tx.category) return 0
  const cat = categoryByName.get(tx.category)
  if (!cat) return 0
  if (cat.businessId === business.syncId) return cat.excludeFromBusinessTotals ? 0 : raw
  if (cat.businessId) return 0 // belongs to a different business
  if (!cat.isDeductible || !cat.deductibleByMember) return 0
  if (!business.userId) return 0
  const pct = cat.deductibleByMember[business.userId] ?? 0
  if (pct <= 0) return 0
  return raw * (pct / 100)
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
 */
export function resolveBusinessExpenseCategories(categories: Category[], business: Business): Category[] {
  return categories.filter((c) => {
    if (c.type !== 'expense') return false
    if (c.businessId === business.syncId) return !c.excludeFromBusinessTotals
    if (c.businessId) return false
    if (!business.userId) return false
    return !!c.isDeductible && (c.deductibleByMember?.[business.userId] ?? 0) > 0
  })
}
