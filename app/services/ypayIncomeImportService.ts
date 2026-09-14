import { db, type YpayDocument } from '@/app/db/financeDB'
import { YpayDocType } from '@/app/services/ypayService'

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
export function buildYpayDocumentFromImportRow(row: YpayIncomeImportRow): Omit<YpayDocument, 'id' | 'syncId' | 'updatedAt'> {
  const amount = row.docType === YpayDocType.TaxInvoice ? row.netAmount : row.grossAmount
  return {
    transactionId: `ypay-import:${row.serialNumber}`,
    url: '',
    serialNumber: row.serialNumber,
    docType: row.docType,
    amount,
    createdAt: row.date ? new Date(row.date).toISOString() : new Date().toISOString(),
  }
}

export type YpayIncomeImportSummary = {
  added: number
  repaired: number // an existing STUB record (no amount) got its real amount+date filled in
  alreadyCorrect: number
  ignoredType: number
  possibleTestRows: string[] // serialNumbers whose customer name suggests test/sandbox data — flagged, not excluded
}

/**
 * Imports the parsed rows into db.ypayDocuments, deduped by serialNumber
 * against whatever's already there (aglamazo#381: "should be taken care
 * and dedup from existing data"). Three outcomes per row:
 *   - no existing record with this serial -> add a new one.
 *   - an existing record with no `amount` (the #380 stub shape) -> repair
 *     it in place with the real amount/date, keeping everything else
 *     (transactionId, url, closesAllocations) untouched.
 *   - an existing record that already has a real amount -> leave it alone;
 *     it's already correct (created directly inside Aglamazo, or already
 *     fixed) and this import must never clobber a real, possibly-different
 *     figure with a guess.
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
    possibleTestRows: [],
  }

  for (const row of rows) {
    if (row.customerName === 'בדיקות') summary.possibleTestRows.push(row.serialNumber)

    const existing = await db.ypayDocuments
      .filter((d) => String(d.serialNumber).trim() === row.serialNumber)
      .first()

    if (!existing) {
      await db.ypayDocuments.add(buildYpayDocumentFromImportRow(row))
      summary.added++
    } else if (!existing.amount) {
      const built = buildYpayDocumentFromImportRow(row)
      await db.ypayDocuments.update(existing.id!, { amount: built.amount, createdAt: built.createdAt })
      summary.repaired++
    } else {
      summary.alreadyCorrect++
    }
  }

  return summary
}
