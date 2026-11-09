import type { Category } from '@/app/types/category'
import { OTHER_SUBJECT } from '@/app/components/budget/monthlySeries'

/**
 * The budget topic cards roll a sub-topic's rows into its parent (see
 * getCategoryData in the budget page), so selecting a parent card must show
 * the parent's rows AND its sub-topics' rows (aglamazo#456). Returns the
 * selected names plus the name of every category whose parentId is the id of
 * a selected category. Unknown names pass through unchanged; selecting a
 * sub-topic does not add its parent.
 */
export function expandSelectedCategories(selected: Set<string>, categories: Category[]): Set<string> {
  const expanded = new Set(selected)
  if (selected.size === 0) return expanded
  const selectedIds = new Set(categories.filter((c) => selected.has(c.name)).map((c) => c.id))
  for (const c of categories) {
    if (c.parentId && selectedIds.has(c.parentId)) expanded.add(c.name)
  }
  return expanded
}

/**
 * The row predicate the budget table uses while topics are selected.
 * Selecting the "ללא נושא" line (OTHER_SUBJECT, aglamazo#467) shows the rows
 * with no subject or a subject not in `categories`, so they can be classified.
 */
export function matchesSelectedCategories(
  category: string | undefined,
  expanded: Set<string>,
  categories: Category[] = [],
): boolean {
  if (expanded.has(OTHER_SUBJECT.name) && (!category || !categories.some((c) => c.name === category))) return true
  return !!category && expanded.has(category)
}
