import type { Transaction } from '@/app/db/financeDB'
import { canonicalizeForDedup } from './dedupKey'

export type DuplicateGroup = {
  key: string
  keep: Transaction
  remove: Transaction[]
  needsReview: boolean
  reviewReason?: string
}

// Same grouping rule as saveBankTransactions's dedup key: the bank's own
// reference/אסמכתא number when present (deterministic — identical regardless
// of which import path produced the row), else a canonicalized description
// (bidi/whitespace-order-insensitive) as a fallback for rows that predate the
// reference-capture fix, or came from a bank export without that column.
function groupKey(t: Transaction): string {
  const scope = t.type === 'credit' ? (t.cardNumber || '') : (t.accountNumber || '')
  if (t.reference) {
    return `ref|${t.type}|${scope}|${t.reference}`
  }
  const desc = t.type === 'credit' ? (t.merchant || t.description) : t.description
  return `heur|${t.type}|${scope}|${t.date}|${canonicalizeForDedup(desc || '')}|${t.amount}`
}

/**
 * Group transactions into duplicate sets. Never suggests removing a row that
 * has a linked ExpenseDocument unless every other member of the group ALSO
 * lacks one — if two+ duplicates each have their own linked document, the
 * group is flagged needsReview instead of auto-picking which document wins.
 */
export function findDuplicateTransactions(
  transactions: Transaction[],
  linkedTransactionSyncIds: Set<string>,
): DuplicateGroup[] {
  const groups = new Map<string, Transaction[]>()
  for (const t of transactions) {
    if (t.id == null) continue
    const key = groupKey(t)
    const arr = groups.get(key)
    if (arr) arr.push(t)
    else groups.set(key, [t])
  }

  const result: DuplicateGroup[] = []
  for (const [key, members] of groups) {
    if (members.length < 2) continue

    const withDocs = members.filter((m) => m.syncId != null && linkedTransactionSyncIds.has(m.syncId))

    let keep: Transaction
    let needsReview = false
    let reviewReason: string | undefined

    if (withDocs.length > 1) {
      keep = withDocs[0]
      needsReview = true
      reviewReason = `${withDocs.length} מהכפילויות מקושרות למסמך שונה — נדרשת בדיקה ידנית`
    } else if (withDocs.length === 1) {
      keep = withDocs[0]
    } else {
      const categorized = members.filter((m) => m.category)
      const pool = categorized.length > 0 ? categorized : members
      keep = [...pool].sort((a, b) => (a.importedAt || '').localeCompare(b.importedAt || ''))[0]
    }

    const remove = members.filter((m) => m.id !== keep.id)
    result.push({ key, keep, remove, needsReview, reviewReason })
  }

  return result.sort((a, b) => b.remove.length - a.remove.length)
}
