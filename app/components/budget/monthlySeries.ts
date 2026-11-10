import type { BudgetTransaction } from '@/app/types/transactions'
import type { Category } from '@/app/types/category'

/**
 * The catch-all subject of the breakdown (aglamazo#467): a daily expense row
 * with no subject, or with a subject name not in the list, counts here so the
 * breakdown adds up to the expenses card. Not a stored category.
 */
export const OTHER_SUBJECT: Category = {
  id: '__other__',
  name: 'ללא נושא',
  type: 'expense',
  color: '#94a3b8',
  createdAt: '',
}

/**
 * The one rule for "which subject does this row count toward" in the
 * "פילוח הוצאות לפי נושא" breakdown (aglamazo#465). The budget page's
 * getCategoryData and the yearly graph both use it, so the page total and the
 * graph's point for the same month cannot disagree.
 *
 * A row counts when it is a daily expense: amount < 0, not a credit-card
 * charge, and the row's own subject is not capital/external. It is attributed to its
 * subject; a sub-subject's row also rolls into its parent. A row with no
 * subject, an unknown subject, or a sub-subject whose parent is gone counts
 * toward OTHER_SUBJECT (aglamazo#467).
 * Returns null for a row that is not counted at all.
 */
export function expenseSubject(
  t: BudgetTransaction,
  categories: Category[],
): { parent: Category; sub: Category | null } | null {
  if (t.amount >= 0 || t.isCreditCardCharge) return null
  const category = t.category ? categories.find((c) => c.name === t.category) : undefined
  if (!category) return { parent: OTHER_SUBJECT, sub: null }
  // Excluded by name, like the page's nonDailyNames: any capital/external subject of that name
  if (categories.some((c) => c.name === t.category && (c.isCapital || c.isExternal))) return null
  if (category.parentId) {
    const parent = categories.find((c) => c.id === category.parentId)
    if (!parent) return { parent: OTHER_SUBJECT, sub: null }
    return { parent, sub: category }
  }
  return { parent: category, sub: null }
}

/** Does this row count toward the subject named `subjectName` (parent or sub)? */
export function countsTowardSubject(t: BudgetTransaction, subjectName: string, categories: Category[]): boolean {
  const s = expenseSubject(t, categories)
  if (!s) return false
  return s.parent.name === subjectName || s.sub?.name === subjectName
}

/**
 * 12 values Jan..Dec for one subject. `transactionsByMonth` is keyed by month
 * index 1..12. A month with no rows at all (not loaded, a future month, none
 * recorded) is null — a gap in the graph; a month with rows but none in this
 * subject is a real 0.
 */
export function subjectMonthlyTotals(
  transactionsByMonth: Record<number, BudgetTransaction[] | undefined>,
  subjectName: string,
  categories: Category[],
): (number | null)[] {
  return Array.from({ length: 12 }, (_, i) => {
    const rows = transactionsByMonth[i + 1]
    if (!rows || rows.length === 0) return null
    const total = rows
      .filter((t) => countsTowardSubject(t, subjectName, categories))
      .reduce((sum, t) => sum + Math.abs(t.amount), 0)
    return Math.round(total * 100) / 100
  })
}

// Re-exported so callers of the subject series get its axis rule from one place
export { yAxisDomain } from '@/app/components/charts/yAxisDomain'
