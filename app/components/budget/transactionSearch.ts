import type { BudgetTransaction } from '@/app/types/transactions'

/**
 * Free-text search across every visible column (date/business/category/
 * payment method/amount) — a plain substring match, no field prefixes.
 * Shared between the monthly budget table and the all-time search tab so
 * both boxes behave identically.
 */
export function matchesTransactionSearch(t: BudgetTransaction, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return (
    (t.date || '').includes(q) ||
    (t.business || '').toLowerCase().includes(q) ||
    (t.category || '').toLowerCase().includes(q) ||
    (t.paymentMethod || '').toLowerCase().includes(q) ||
    String(t.amount).includes(q)
  )
}
