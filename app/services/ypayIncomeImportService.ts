import { db, type YpayDocument, type Transaction } from '@/app/db/financeDB'
import { YpayDocType } from '@/app/services/ypayService'
import { subjectStore } from '@/app/stores/subjectStore'
import { projectStore } from '@/app/stores/projectStore'

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
async function findMatchingIncomeTransaction(grossAmount: number, date: string): Promise<Transaction | undefined> {
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

  return candidates.length === 1 ? candidates[0] : undefined
}

/**
 * Second, independent attribution path — by CUSTOMER, per Agla's own
 * question (aglamazo#381): "did you create a logic to send the incomes to
 * the business, based on the customer?" ypay's export names the client on
 * every row (row.customerName); when it matches a Project's name exactly
 * (Projects are per-business), that project's name is the SAME projectName
 * field ypayService already writes on every invoice created inside
 * Aglamazo — sharedBusinessSyncService.ts already attributes a document via
 * a matching projectName as an alternative to a linked transaction, so this
 * doesn't need a new field either. Unlike the transaction match, this one
 * doesn't require the payment to have landed in the bank yet — it works for
 * an unpaid invoice too, not just a settled receipt. An ambiguous or absent
 * match is left unset rather than guessed.
 */
async function findMatchingProjectName(customerName: string): Promise<string | undefined> {
  const trimmed = customerName.trim()
  if (!trimmed) return undefined
  const allProjects = await projectStore.getAll()
  const candidates = allProjects.filter((p) => !p.archived && p.name.trim() === trimmed)
  return candidates.length === 1 ? candidates[0].name : undefined
}

/**
 * A period already reported to the tax authority and paid (a matching
 * VatPayment record covers the date) must not change under it silently
 * (aglamazo#383, Sheli: מאי-יוני moved from the declared, paid 18,148 to
 * 22,750 with no warning). Neither adding a new document nor repairing an
 * existing one may touch a date inside a closed period — TaxVatSection.tsx
 * already has this exact concept (isPeriodClosed, gated on a matching
 * VatPayment); this reuses the same signal rather than inventing a second
 * one. Whether to eventually offer an override is a product call left to
 * Agla — this is the safe default until he makes it.
 */
async function isDateInClosedPeriod(date: string): Promise<boolean> {
  if (!date) return false
  const payments = await db.vatPayments.toArray()
  return payments.some((p) => p.periodStart <= date && date <= p.periodEnd)
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
//
// aglamazo#383 (Sheli, 2026-09-14): "already counted elsewhere" does not
// hold when the credit note cancels THIS SAME row rather than a separate
// tax invoice — a real pair in Agla's export: 900000 (חשבונית מס קבלה,
// +3,898.28) and 600000 (חשבונית מס זיכוי, -3,898.28), same customer, same
// day. Skipping the credit note while keeping the receipt it cancels books
// revenue that does not exist. A credit note matching an imported row
// EXACTLY (same customer, same date, exactly-negated net amount) now
// excludes that row too, not just the credit note itself.
const IMPORTABLE_DOC_TYPES: Record<string, number> = {
  'חשבונית מס': YpayDocType.TaxInvoice,
  'חשבונית מס קבלה': YpayDocType.TaxInvoiceReceipt,
}
const CREDIT_NOTE_LABEL = 'חשבונית מס זיכוי'

// Agla's standing instruction, per Sheli 2026-09-14: sandbox/test rows
// (customer "בדיקות") must be ignored outright, not surfaced for review —
// the earlier flag-but-import behavior was a cautious default of mine, not
// what he actually wants.
const TEST_CUSTOMER_NAME = 'בדיקות'

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

export type YpayParseResult = {
  imported: YpayIncomeImportRow[]
  ignoredCount: number // wrong doc type entirely (credit notes, plain receipts, unknown labels)
  cancelledCount: number // a real importable type, but a matching credit note voids it
  testRowsExcluded: string[] // serialNumbers of customer "בדיקות" rows — excluded, not imported
}

/**
 * Parses the raw sheet rows (as returned by XLSX's `sheet_to_json(sheet,
 * {header: 1})` — an array of arrays, one per row) into the two real income
 * document types. Finds the header row by content (the cell reading
 * "אסמכתא") rather than assuming a fixed row offset, since the metadata
 * rows above it (export date, business name, business id, report title,
 * date range) aren't a stable count to hard-code against.
 */
export function parseYpayIncomeExportRows(rows: unknown[][]): YpayParseResult {
  const headerIdx = rows.findIndex((r) => String(r?.[0] ?? '').trim() === 'אסמכתא')
  if (headerIdx === -1) {
    throw new Error('לא נמצאה שורת כותרות ("אסמכתא") בקובץ — ודא שזהו ייצוא ארכיון הכנסות מ-ypay')
  }

  const candidates: YpayIncomeImportRow[] = []
  const creditNotes: YpayIncomeImportRow[] = []
  let ignoredCount = 0

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    const serialNumber = String(row?.[0] ?? '').trim()
    const docTypeLabel = String(row?.[1] ?? '').trim()
    if (!serialNumber || !docTypeLabel) continue // trailing blank row

    const parsedRow: YpayIncomeImportRow = {
      serialNumber,
      docType: IMPORTABLE_DOC_TYPES[docTypeLabel] ?? 0,
      date: parseYpayDate(String(row?.[2] ?? '')),
      customerName: String(row?.[3] ?? '').trim(),
      netAmount: parseYpayNumber(row?.[5] as string),
      vatAmount: parseYpayNumber(row?.[6] as string),
      grossAmount: parseYpayNumber(row?.[7] as string),
    }

    if (docTypeLabel === CREDIT_NOTE_LABEL) {
      creditNotes.push({ ...parsedRow, docType: YpayDocType.TaxInvoiceCredit })
      ignoredCount++
      continue
    }
    if (!(docTypeLabel in IMPORTABLE_DOC_TYPES)) {
      ignoredCount++
      continue
    }
    candidates.push(parsedRow)
  }

  const imported: YpayIncomeImportRow[] = []
  const testRowsExcluded: string[] = []
  let cancelledCount = 0

  for (const row of candidates) {
    if (row.customerName === TEST_CUSTOMER_NAME) {
      testRowsExcluded.push(row.serialNumber)
      continue
    }
    const isCancelled = creditNotes.some(
      (c) => c.customerName === row.customerName && c.date === row.date && Math.abs(c.netAmount + row.netAmount) < 0.01,
    )
    if (isCancelled) {
      cancelledCount++
      continue
    }
    imported.push(row)
  }

  return { imported, ignoredCount, cancelledCount, testRowsExcluded }
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
  const [matchedTransaction, matchedProjectName] = await Promise.all([
    findMatchingIncomeTransaction(row.grossAmount, row.date),
    findMatchingProjectName(row.customerName),
  ])
  return {
    transactionId: matchedTransaction?.syncId || `${SYNTHETIC_TRANSACTION_ID_PREFIX}${row.serialNumber}`,
    url: '',
    serialNumber: row.serialNumber,
    docType: row.docType,
    amount,
    ...(matchedProjectName ? { projectName: matchedProjectName } : {}),
    // The matched transaction's own date is the real day the money landed
    // in the bank — distinct from createdAt (row.date, ypay's own issue
    // date, which drives the tax-reporting period). aglamazo#381, Agla:
    // "the first is when I created the document in ypay, the second is
    // when the money come." Left unset when there's no matched transaction
    // (nothing to source a real money-date from) rather than guessed.
    ...(matchedTransaction ? { moneyReceivedAt: matchedTransaction.date } : {}),
    createdAt: row.date ? new Date(row.date).toISOString() : new Date().toISOString(),
  }
}

export type YpayIncomeImportSummary = {
  added: number
  repaired: number // an existing STUB record (no amount, or an orphaned synthetic transactionId) got fixed in place
  alreadyCorrect: number
  ignoredType: number // wrong doc type entirely (credit notes, plain receipts, unknown labels)
  cancelledCount: number // a real importable type, excluded because a matching credit note voids it
  testRowsExcluded: string[] // serialNumbers of customer "בדיקות" rows — excluded, not imported
  unmatchedCount: number // imported/kept on the synthetic key — no unambiguous matching transaction found, so not attributed to a business yet
  skippedClosedPeriod: string[] // serialNumbers whose date falls in an already-declared-and-paid VAT period — left untouched
}

const isSynthetic = (transactionId: string | undefined) => !!transactionId?.startsWith(SYNTHETIC_TRANSACTION_ID_PREFIX)

// A document is attributed to a business if EITHER path resolved — a real
// linked transaction, or a matching project (see sharedBusinessSyncService.ts's
// OR condition). Neither means it's a genuine orphan, same as an invoice
// nobody has entered a project/payment for yet.
const isAttributed = (d: { transactionId?: string; projectName?: string }) =>
  !isSynthetic(d.transactionId) || !!d.projectName

/**
 * Imports the parsed rows into db.ypayDocuments, deduped by serialNumber
 * against whatever's already there (aglamazo#381: "should be taken care
 * and dedup from existing data"). Outcomes per row:
 *   - no existing record with this serial -> add a new one, linked to a
 *     matching transaction when one is found (see
 *     findMatchingIncomeTransaction) so it's attributed to the right
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
  counts: { ignoredCount: number; cancelledCount: number; testRowsExcluded: string[] },
): Promise<YpayIncomeImportSummary> {
  const summary: YpayIncomeImportSummary = {
    added: 0,
    repaired: 0,
    alreadyCorrect: 0,
    ignoredType: counts.ignoredCount,
    cancelledCount: counts.cancelledCount,
    testRowsExcluded: counts.testRowsExcluded,
    unmatchedCount: 0,
    skippedClosedPeriod: [],
  }

  for (const row of rows) {
    if (await isDateInClosedPeriod(row.date)) {
      summary.skippedClosedPeriod.push(row.serialNumber)
      continue
    }

    const existing = await db.ypayDocuments
      .filter((d) => String(d.serialNumber).trim() === row.serialNumber)
      .first()

    if (!existing) {
      const built = await buildYpayDocumentFromImportRow(row)
      await db.ypayDocuments.add(built)
      summary.added++
      if (!isAttributed(built)) summary.unmatchedCount++
    } else {
      const needsAmount = !existing.amount
      const needsAttributionFix = !isAttributed(existing)
      if (needsAmount || needsAttributionFix) {
        const built = await buildYpayDocumentFromImportRow(row)
        const patch: Partial<YpayDocument> = {}
        if (needsAmount) {
          patch.amount = built.amount
          patch.createdAt = built.createdAt
        }
        if (needsAttributionFix) {
          if (!isSynthetic(built.transactionId)) {
            patch.transactionId = built.transactionId
            if (built.moneyReceivedAt && !existing.moneyReceivedAt) patch.moneyReceivedAt = built.moneyReceivedAt
          }
          if (built.projectName && !existing.projectName) patch.projectName = built.projectName
        }
        if (Object.keys(patch).length > 0) {
          await db.ypayDocuments.update(existing.id!, patch)
          summary.repaired++
        } else {
          summary.alreadyCorrect++
        }
        const afterState = {
          transactionId: patch.transactionId ?? existing.transactionId,
          projectName: patch.projectName ?? existing.projectName,
        }
        if (!isAttributed(afterState)) summary.unmatchedCount++
      } else {
        summary.alreadyCorrect++
      }
    }
  }

  return summary
}
