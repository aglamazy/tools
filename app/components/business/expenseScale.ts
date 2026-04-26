import type { Category } from '@/app/types/category'
import type { Business, Transaction } from '@/app/db/financeDB'

/**
 * Effective deductible amount of an expense transaction for a given business.
 * - Direct business expenses (cat.businessId set) → full |amount|.
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
  if (cat.businessId === business.id) return raw
  if (cat.businessId) return 0 // belongs to a different business
  if (!cat.isDeductible || !cat.deductibleByMember) return 0
  if (!business.userId) return 0
  const pct = cat.deductibleByMember[business.userId] ?? 0
  if (pct <= 0) return 0
  return raw * (pct / 100)
}
