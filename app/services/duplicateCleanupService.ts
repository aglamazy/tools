// One-time, Agla-approved cleanup for the specific duplicates found and
// enumerated 2026-09-11 (aglamazo#362/#364/#365, general#46/#48,
// Buddy/docs/aglamazo-crossfile-duplicates-2026-09-11.json). Approved via
// oct_message #44942 ("go"), backup taken first (Sheli,
// ~/finance/aglamazo-backup-20260911-092518).
//
// Each function is a targeted, auditable action — not a blanket sweep of
// everything in the audit. The audit itself flagged several LOOK-alike
// groups that must NOT be touched here: the known ghost pair (general#46,
// already flagged never-classify), card-settlement rows (excluded from the
// expense base anyway), and קיזוז/ריבית categories (legitimately two
// different real categories, one expense one income, sharing a name).

import { db } from '@/app/db/financeDB'

export type SkippedSupplierVariant = {
  id: number
  emailSenders: string[]
  categoryId?: string
  isForeign?: boolean
}

export type SupplierMergeResult = {
  groupsExamined: number
  groupsMerged: number
  rowsDeleted: number
  skippedNonIdentical: { name: string; variants: SkippedSupplierVariant[] }[]
}

/**
 * Merge duplicate Supplier rows created by the 2026-07-13/14 seed race
 * (aglamazo#364/#365) — same name + same bankCardAliases (as a set) + same
 * businessId. Keeps the earliest (by createdAt) row per group, deletes the
 * rest. A group is skipped (not merged) if any field besides id/syncId/
 * createdAt/updatedAt differs — that's no longer a pure accidental
 * duplicate, and merging it could silently drop a real edit.
 */
export async function mergeDuplicateSuppliers(): Promise<SupplierMergeResult> {
  const all = await db.suppliers.toArray()
  const groups = new Map<string, typeof all>()

  const fingerprint = (s: (typeof all)[number]) =>
    JSON.stringify({
      name: s.name,
      aliases: [...s.bankCardAliases].sort(),
      businessId: s.businessId ?? null,
    })

  for (const s of all) {
    const key = fingerprint(s)
    const list = groups.get(key) || []
    list.push(s)
    groups.set(key, list)
  }

  let groupsMerged = 0
  let rowsDeleted = 0
  const skippedNonIdentical: { name: string; variants: SkippedSupplierVariant[] }[] = []

  for (const group of groups.values()) {
    if (group.length < 2) continue

    // Require every OTHER field to also match exactly across the group —
    // a group that only agrees on name+aliases+businessId but differs in
    // emailSenders/categoryId/isForeign is not a pure accidental duplicate.
    const rest = (s: (typeof group)[number]) =>
      JSON.stringify({
        emailSenders: [...s.emailSenders].sort(),
        categoryId: s.categoryId ?? null,
        isForeign: s.isForeign ?? false,
      })
    const restKeys = new Set(group.map(rest))
    if (restKeys.size > 1) {
      skippedNonIdentical.push({
        name: group[0].name,
        variants: group
          .filter((s) => s.id != null)
          .map((s) => ({ id: s.id!, emailSenders: s.emailSenders, categoryId: s.categoryId, isForeign: s.isForeign })),
      })
      continue
    }

    const sorted = [...group].sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))
    const [keep, ...drop] = sorted
    for (const s of drop) {
      if (s.id != null) {
        await db.suppliers.delete(s.id)
        rowsDeleted++
      }
    }
    void keep
    groupsMerged++
  }

  return { groupsExamined: groups.size, groupsMerged, rowsDeleted, skippedNonIdentical }
}

export type SupplierEmailSubsetMergeResult = {
  groupsExamined: number
  groupsMerged: number
  rowsDeleted: number
  skippedAmbiguous: { name: string; variants: SkippedSupplierVariant[] }[]
}

/**
 * Second-pass merge for the 31 rows `mergeDuplicateSuppliers` deliberately
 * left behind (Sheli, 2026-09-11): 16 groups where categoryId/isForeign
 * match but emailSenders doesn't — because one copy carries emailSenders
 * and the other copies have it empty. An empty array holds nothing the
 * populated one doesn't, so this is a strict-subset case, not a real
 * conflict. Rule: keep the populated copy, drop the empty ones. If more
 * than one populated copy exists with genuinely DIFFERENT senders, that's
 * a real conflict — skip the whole group and report it rather than guess.
 */
export async function mergeSupplierEmptyEmailDuplicates(): Promise<SupplierEmailSubsetMergeResult> {
  const all = await db.suppliers.toArray()
  const groups = new Map<string, typeof all>()

  const fingerprint = (s: (typeof all)[number]) =>
    JSON.stringify({
      name: s.name,
      aliases: [...s.bankCardAliases].sort(),
      businessId: s.businessId ?? null,
    })

  for (const s of all) {
    const key = fingerprint(s)
    const list = groups.get(key) || []
    list.push(s)
    groups.set(key, list)
  }

  let groupsMerged = 0
  let rowsDeleted = 0
  const skippedAmbiguous: { name: string; variants: SkippedSupplierVariant[] }[] = []

  for (const group of groups.values()) {
    if (group.length < 2) continue

    // This rule relaxes ONLY emailSenders — categoryId/isForeign must
    // still match exactly, otherwise it's not this rule's business.
    const restKey = (s: (typeof group)[number]) =>
      JSON.stringify({ categoryId: s.categoryId ?? null, isForeign: s.isForeign ?? false })
    if (new Set(group.map(restKey)).size > 1) continue

    const populated = group.filter((s) => s.emailSenders.length > 0)
    const empty = group.filter((s) => s.emailSenders.length === 0)
    if (populated.length === 0 || empty.length === 0) continue

    const distinctSenderSets = new Set(populated.map((s) => [...s.emailSenders].sort().join('|')))
    if (distinctSenderSets.size > 1) {
      skippedAmbiguous.push({
        name: group[0].name,
        variants: populated
          .filter((s) => s.id != null)
          .map((s) => ({ id: s.id!, emailSenders: s.emailSenders, categoryId: s.categoryId, isForeign: s.isForeign })),
      })
      continue
    }

    const sortedPopulated = [...populated].sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))
    const [keep, ...dropPopulated] = sortedPopulated
    void keep
    for (const s of [...dropPopulated, ...empty]) {
      if (s.id != null) {
        await db.suppliers.delete(s.id)
        rowsDeleted++
      }
    }
    groupsMerged++
  }

  return { groupsExamined: groups.size, groupsMerged, rowsDeleted, skippedAmbiguous }
}

/**
 * Delete one specific category (Subject row — the app's actual category
 * table, string ids like `custom-<timestamp>`; the unrelated numeric-id
 * `db.categories` table is legacy/unused) by id. Covers general#48's
 * תשתיות duplicate: two rows share the same name/businessId/type, only one
 * has isDeductible: true. Transactions link to categories by NAME, not id,
 * so deleting the wrong-flagged duplicate row is enough — nothing else
 * needs to change for existing transactions to resolve correctly after.
 */
export async function deleteCategoryById(categoryId: string): Promise<boolean> {
  const existing = await db.subjects.get(categoryId)
  if (!existing) return false
  await db.subjects.delete(categoryId)
  return true
}

/** Delete one specific transaction by its Dexie auto-increment id. */
export async function deleteTransactionById(id: number): Promise<boolean> {
  const existing = await db.transactions.get(id)
  if (!existing) return false
  await db.transactions.delete(id)
  return true
}

export type ConfirmedDuplicateDeleteResult = {
  deleted: boolean
  reason?: string
}

/**
 * Delete one specific transaction by id, but only after its vendor text
 * (substring match — a truncated import can differ by a trailing
 * character or two, e.g. "ANTHROPIC* CLAUDE SU" vs "...SUB"), amount and
 * at least one of {date, fileId} all match what was actually verified as
 * the duplicate (aglamazo#370/#371). A hardcoded id alone isn't enough
 * evidence on live financial data — if the row has since changed or been
 * touched by something else, this refuses rather than deleting the wrong
 * thing.
 *
 * Vendor text falls back to `description` when `merchant` is empty — a
 * BANK-type row (unlike a credit-card row) never populates `merchant`
 * (see saveBankTransactions), so checking `merchant` alone would silently
 * refuse to delete every genuine bank-side duplicate. Same
 * merchant-or-description resolution ExpenseRowsTable/TaxVatSection
 * already use elsewhere in this codebase.
 */
export async function deleteConfirmedDuplicateTransaction(
  id: number,
  expected: { merchantContains: string; amount: number; date?: string; fileId?: string },
): Promise<ConfirmedDuplicateDeleteResult> {
  if (expected.date == null && expected.fileId == null) {
    throw new Error('deleteConfirmedDuplicateTransaction requires at least one of {date, fileId}')
  }
  const existing = await db.transactions.get(id)
  if (!existing) return { deleted: false, reason: 'not found — already deleted?' }
  const vendorText = existing.merchant || existing.description || ''
  const merchantOk = vendorText.includes(expected.merchantContains)
  const amountOk = existing.amount === expected.amount
  const dateOk = expected.date == null || existing.date === expected.date
  const fileIdOk = expected.fileId == null || existing.fileId === expected.fileId
  if (!merchantOk || !amountOk || !dateOk || !fileIdOk) {
    const mismatches = [
      !merchantOk && `vendor text "${vendorText}" doesn't contain "${expected.merchantContains}"`,
      !amountOk && `amount ${existing.amount} !== ${expected.amount}`,
      !dateOk && `date "${existing.date}" !== "${expected.date}"`,
      !fileIdOk && `fileId "${existing.fileId}" !== "${expected.fileId}"`,
    ].filter(Boolean).join('; ')
    return { deleted: false, reason: `row changed since verification — ${mismatches}` }
  }
  await db.transactions.delete(id)
  return { deleted: true }
}
