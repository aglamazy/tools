// One-time, Agla-approved repairs for specific rows (aglamazo#372 and its
// duplicate-row delete). Each function is a targeted, auditable action that
// re-checks the row still matches what was verified before it changes anything —
// not a blanket sweep. The supplier-merge / category / cross-feed duplicate tools
// that used to live here were removed from Settings on Agla's request (2026-09-22).

import { db } from '@/app/db/financeDB'

export type ConfirmedAmountRepairResult = {
  repaired: boolean
  reason?: string
}

/**
 * Overwrite one specific transaction's `amount` after verifying its vendor
 * text, CURRENT (wrong) amount and date still match what was verified as
 * mispriced (aglamazo#372: a foreign-currency charge got imported at its
 * USD figure instead of the real NIS billing amount — root cause fixed in
 * pdfExtractionRows.ts/extract-pdf-statement, extract-xls-statement; this
 * repairs the two rows that were already imported wrong before the fix).
 * Same verify-then-mutate discipline as deleteConfirmedDuplicateTransaction
 * — refuses rather than overwriting if the row has changed since
 * verification.
 */
export async function repairConfirmedForeignCurrencyAmount(
  id: number,
  expected: { merchantContains: string; currentAmount: number; date: string },
  correctedAmount: number,
): Promise<ConfirmedAmountRepairResult> {
  const existing = await db.transactions.get(id)
  if (!existing) return { repaired: false, reason: 'not found — already deleted?' }
  const vendorText = existing.merchant || existing.description || ''
  const merchantOk = vendorText.includes(expected.merchantContains)
  const amountOk = existing.amount === expected.currentAmount
  const dateOk = existing.date === expected.date
  if (!merchantOk || !amountOk || !dateOk) {
    const mismatches = [
      !merchantOk && `vendor text "${vendorText}" doesn't contain "${expected.merchantContains}"`,
      !amountOk && `amount ${existing.amount} !== ${expected.currentAmount}`,
      !dateOk && `date "${existing.date}" !== "${expected.date}"`,
    ].filter(Boolean).join('; ')
    return { repaired: false, reason: `row changed since verification — ${mismatches}` }
  }
  await db.transactions.update(id, { amount: correctedAmount })
  return { repaired: true }
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
