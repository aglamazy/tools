import { db, type YpayDocument, type Transaction } from '@/app/db/financeDB'
import { YpayDocType } from '@/app/services/ypayService'
import { subjectStore } from '@/app/stores/subjectStore'

const SYNTHETIC_TRANSACTION_ID_PREFIX = 'ypay-import:'
const MATCH_TOLERANCE_DAYS = 5

/**
 * A ypayDocuments row belongs to a business via either a linked transaction
 * or a matching projectName (sharedBusinessSyncService.ts) — there is no
 * businessId field on the table at all. A synthetic `ypay-import:<serial>`
 * transactionId (the old always-unlinked shape) matches neither, so an
 * imported row was an orphan: it existed, but no business tab ever showed
 * it (aglamazo#381, Agla: "the incomes should go into existing business").
 *
 * Fix: look for an already-imported bank/card Transaction whose amount and
 * date match the real, gross-amount deposit this document represents, and
 * link to ITS syncId instead — the existing category->business chain then
 * attributes the document correctly, with no new field needed. A row with
 * no unambiguous match stays on the synthetic key (same as an invoice that
 * genuinely hasn't been paid yet) rather than guessing.
 */
async function findMatchingIncomeTransactionId(grossAmount: number, date: string): Promise<string | undefined> {
  if (!date) return undefined
  const incomeCategories = await subjectStore.getIncomeCategories()
  const incomeCatNames = new Set(incomeCategories.map((c) => c.name))
  if (incomeCatNames.size === 0) return undefined

  const dateMs = new Date(date).getTime()
  if (Number.isNaN(dateMs)) return undefined

  const allTransactions = await db.transactions.toArray()
  const candidates = allTransactions.filter((t: Transaction) => {
    if (!t.syncId || !t.category || !incomeCatNames.has(t.category)) return false
    if (Math.abs((t.amount || 0) - grossAmount) > 0.01) return false
    const tMs = new Date(t.date).getTime()
    if (Number.isNaN(tMs)) return false
    return Math.abs(tMs - dateMs) <= MATCH_TOLERANCE_DAYS * 24 * 60 * 60 * 1000
  })

  return candidates.length === 1 ? candidates[0].syncId : undefined
}

// aglamazo#381 (Agla, 2026-09-14): ypay's own API has no bulk "list my
// documents" endpoint (checked against the v1.9 API doc — only Document
// Generator, Credit-Clearing + its own Transaction-Info callback, and Bank
// List). Agla's own answer: he exports the "ארכיון הכנסות" report from
// ypay's dashboard by hand and hands it to the app. This parses that real
// export — columns confirmed against a live file: אסמכתא, סוג מסמך, תאריך,
// לקוח, מזהה לקוח, לפני מע"מ, מע"מ, אחרי מע"מ, מס' הקצאה — with a few
// metadata rows above the header, found by scanning for the header row
// rather than assuming a fixed offset.

export type YpayIncomeImportRow = {
  serialNumber: string
  docType: number
  date: string // YYYY-MM-DD
  customerName: string
  netAmount: number
  vatAmount: number
  grossAmount: number
}

// Agla, 2026-09-14, exact instruction (by document-type label, not
// inferred): חשבונית מס (106) and חשבונית מס קבלה (109) are real income —
// import them. חשבונית מס זיכוי (107, credit note) and קבלה (108, plain
// receipt) are explicitly "ignore" — a credit note only cancels a tax
// invoice already counted elsewhere, and a plain receipt acknowledges
// payment against turnover a tax invoice already recorded; counting either
// separately would double- or mis-count מחזור.
const IMPORTABLE_DOC_TYPES: Record<string, number> = {
  'חשבונית מס': YpayDocType.TaxInvoice,
  'חשבונית מס קבלה': YpayDocType.TaxInvoiceReceipt,
}

function parseYpayNumber(raw: string | number | null | undefined): number {
  if (raw == null || raw === '') return 0
  const n = Number(String(raw).replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

function parseYpayDate(raw: string): string {
  const [d, m, y] = raw.split('/')
  if (!d || !m || !y) return ''
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

/**
 * Parses the raw sheet rows (as returned by XLSX's `sheet_to_json(sheet,
 * {header: 1})` — an array of arrays, one per row) into the two real income
 * document types, skipping credit notes and plain receipts. Finds the
 * header row by content (the cell reading "אסמכתא") rather than assuming a
 * fixed row offset, since the metadata rows above it (export date,
 * business name, business id, report title, date range) aren't a stable
 * count to hard-code against.
 */
export function parseYpayIncomeExportRows(rows: unknown[][]): {
  imported: YpayIncomeImportRow[]
  ignoredCount: number
} {
  const headerIdx = rows.findIndex((r) => String(r?.[0] ?? '').trim() === 'אסמכתא')
  if (headerIdx === -1) {
    throw new Error('לא נמצאה שורת כותרות ("אסמכתא") בקובץ — ודא שזהו ייצוא ארכיון הכנסות מ-ypay')
  }

  const imported: YpayIncomeImportRow[] = []
  let ignoredCount = 0

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    const serialNumber = String(row?.[0] ?? '').trim()
    const docTypeLabel = String(row?.[1] ?? '').trim()
    if (!serialNumber || !docTypeLabel) continue // trailing blank row

    const docType = IMPORTABLE_DOC_TYPES[docTypeLabel]
    if (docType == null) {
      ignoredCount++
      continue
    }

    imported.push({
      serialNumber,
      docType,
      date: parseYpayDate(String(row?.[2] ?? '')),
      customerName: String(row?.[3] ?? '').trim(),
      netAmount: parseYpayNumber(row?.[5] as string),
      vatAmount: parseYpayNumber(row?.[6] as string),
      grossAmount: parseYpayNumber(row?.[7] as string),
    })
  }

  return { imported, ignoredCount }
}

/**
 * The ypayDocuments fields to write for one imported row — NOT tied to any
 * local bank transaction. `transactionId` is schema-enforced UNIQUE
 * (schemaVersions.ts: `&transactionId`), so it can't be a shared empty-
 * string sentinel for every unlinked import row (confirmed the hard way —
 * a real ConstraintError on the second row); `ypay-import:<serialNumber>`
 * is synthetic but genuinely unique (serial numbers are ypay's own), and
 * self-describing if anyone greps for it later. Amount convention matches
 * the rest of ypayService.ts: docType 106 (חשבונית מס) stores the NET
 * pre-VAT amount (invoiceGrossAmount grosses it up for display/payment-
 * matching only); every other importable type (109) stores the GROSS
 * amount directly.
 */
export async function buildYpayDocumentFromImportRow(row: YpayIncomeImportRow): Promise<Omit<YpayDocument, 'id' | 'syncId' | 'updatedAt'>> {
  const amount = row.docType === YpayDocType.TaxInvoice ? row.netAmount : row.grossAmount
  const matchedTransactionId = await findMatchingIncomeTransactionId(row.grossAmount, row.date)
  return {
    transactionId: matchedTransactionId || `${SYNTHETIC_TRANSACTION_ID_PREFIX}${row.serialNumber}`,
    url: '',
    serialNumber: row.serialNumber,
    docType: row.docType,
    amount,
    createdAt: row.date ? new Date(row.date).toISOString() : new Date().toISOString(),
  }
}

export type YpayIncomeImportSummary = {
  added: number
  repaired: number // an existing STUB record (no amount, or an orphaned synthetic transactionId) got fixed in place
  alreadyCorrect: number
  ignoredType: number
  unmatchedCount: number // imported/kept on the synthetic key — no unambiguous matching transaction found, so not attributed to a business yet
  possibleTestRows: string[] // serialNumbers whose customer name suggests test/sandbox data — flagged, not excluded
}

const isSynthetic = (transactionId: string | undefined) => !!transactionId?.startsWith(SYNTHETIC_TRANSACTION_ID_PREFIX)

/**
 * Imports the parsed rows into db.ypayDocuments, deduped by serialNumber
 * against whatever's already there (aglamazo#381: "should be taken care
 * and dedup from existing data"). Outcomes per row:
 *   - no existing record with this serial -> add a new one, linked to a
 *     matching transaction when one is found (see
 *     findMatchingIncomeTransactionId) so it's attributed to the right
 *     business, same as the manual "קשר" link flow.
 *   - an existing record with no `amount` (the #380 stub shape) and/or a
 *     still-orphaned synthetic transactionId (rows imported before this fix)
 *     -> repair whichever of those is wrong, keeping everything else
 *     (url, closesAllocations) untouched.
 *   - an existing record that already has a real amount AND a real
 *     (non-synthetic) transactionId -> leave it alone; it's already correct
 *     and this import must never clobber a real, possibly-different figure
 *     or a manually-set link with a guess.
 */
export async function importYpayIncomeRows(
  rows: YpayIncomeImportRow[],
  ignoredCount: number,
): Promise<YpayIncomeImportSummary> {
  const summary: YpayIncomeImportSummary = {
    added: 0,
    repaired: 0,
    alreadyCorrect: 0,
    ignoredType: ignoredCount,
    unmatchedCount: 0,
    possibleTestRows: [],
  }

  for (const row of rows) {
    if (row.customerName === 'בדיקות') summary.possibleTestRows.push(row.serialNumber)

    const existing = await db.ypayDocuments
      .filter((d) => String(d.serialNumber).trim() === row.serialNumber)
      .first()

    if (!existing) {
      const built = await buildYpayDocumentFromImportRow(row)
      await db.ypayDocuments.add(built)
      summary.added++
      if (isSynthetic(built.transactionId)) summary.unmatchedCount++
    } else {
      const needsAmount = !existing.amount
      const needsRelink = isSynthetic(existing.transactionId)
      if (needsAmount || needsRelink) {
        const built = await buildYpayDocumentFromImportRow(row)
        const patch: Partial<YpayDocument> = {}
        if (needsAmount) {
          patch.amount = built.amount
          patch.createdAt = built.createdAt
        }
        if (needsRelink && !isSynthetic(built.transactionId)) {
          patch.transactionId = built.transactionId
        }
        if (Object.keys(patch).length > 0) {
          await db.ypayDocuments.update(existing.id!, patch)
          summary.repaired++
        } else {
          summary.alreadyCorrect++
        }
        if (isSynthetic(patch.transactionId ?? existing.transactionId)) summary.unmatchedCount++
      } else {
        summary.alreadyCorrect++
      }
    }
  }

  return summary
}
