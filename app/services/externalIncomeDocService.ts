import { db, type Transaction, type YpayDocument } from '@/app/db/financeDB'
import type { Category } from '@/app/types/category'
import { YpayDocType } from '@/app/services/ypayService'
import { subjectStore } from '@/app/stores/subjectStore'
import { projectStore } from '@/app/stores/projectStore'

// aglamazo#481 (Agla 119505): "What is needed now, is to upload an
// invoice-reciept/invoice from external source. (My case - GROW payments
// create document in the clearance operation)".
//
// An uploaded document is ONE ypayDocuments row, nothing else:
// - VAT output sums ypayDocuments of type 106/109 (TaxVatSection.tsx), so
//   the document is counted there once.
// - Income tax and the Incomes tab sum transactions only. The money itself
//   arrives as a bank/card credit through the Import page, so no transaction
//   is created here — creating one would double the income once the credit
//   is imported.
// - A 109 (invoice-receipt = money received) is linked to its credit through
//   transactionId when exactly one unlinked credit of this business matches
//   its total and date — the same link the Incomes tab's "קשר" flow writes.

export const EXTERNAL_DOC_TYPES = [YpayDocType.TaxInvoice, YpayDocType.TaxInvoiceReceipt] as const
const SYNTHETIC_TRANSACTION_ID_PREFIX = 'external:'
const MATCH_TOLERANCE_DAYS = 5
const DAY_MS = 24 * 60 * 60 * 1000

export type ExternalIncomeDocInput = {
  businessId: string // Business.syncId
  docType: number // 106 or 109
  serialNumber: string
  date: string // YYYY-MM-DD, the document's issue date
  customerName: string
  netAmount: number
  vatAmount: number
  grossAmount: number
  url: string // Drive webViewLink of the PDF
  driveFileId?: string
}

export type ExternalIncomeSaveResult =
  | { ok: true; doc: YpayDocument; linkedTransaction?: Transaction }
  | { ok: false; error: string }

/** Every input check, in Hebrew for the form. Empty array = valid. */
export function validateExternalIncomeInput(input: ExternalIncomeDocInput): string[] {
  const errors: string[] = []
  if (!(EXTERNAL_DOC_TYPES as readonly number[]).includes(input.docType)) errors.push('סוג מסמך לא נתמך')
  if (!input.serialNumber.trim()) errors.push('חסר מספר מסמך')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) errors.push('תאריך לא תקין')
  if (!input.customerName.trim()) errors.push('חסר שם לקוח')
  if (!(input.netAmount > 0)) errors.push('סכום לפני מע״מ חייב להיות חיובי')
  if (!(input.vatAmount >= 0)) errors.push('מע״מ לא תקין')
  if (Math.abs(input.netAmount + input.vatAmount - input.grossAmount) > 0.01) {
    errors.push('סכום לפני מע״מ + מע״מ אינו שווה לסה״כ')
  }
  if (!input.url) errors.push('הקובץ לא הועלה')
  return errors
}

async function businessIncomeCategoryNames(businessId: string): Promise<Set<string>> {
  const categories = (await subjectStore.getAll()).filter(
    (c: Category) => c.type === 'income' && c.businessId === businessId,
  )
  return new Set(categories.map(c => c.name))
}

/**
 * The one unlinked income credit of this business whose amount equals the
 * document's total and whose date is within MATCH_TOLERANCE_DAYS of it.
 * Zero or several candidates -> undefined (never guessed).
 */
export async function findLinkableCredit(businessId: string, grossAmount: number, date: string): Promise<Transaction | undefined> {
  const catNames = await businessIncomeCategoryNames(businessId)
  if (catNames.size === 0) return undefined
  const dateMs = new Date(date).getTime()
  if (Number.isNaN(dateMs)) return undefined

  const linkedIds = new Set((await db.ypayDocuments.toArray()).map(d => d.transactionId))
  const candidates = (await db.transactions.toArray()).filter((t: Transaction) => {
    if (!t.syncId || !t.category || !catNames.has(t.category)) return false
    if (linkedIds.has(t.syncId) || (t.id != null && linkedIds.has(String(t.id)))) return false
    if (Math.abs((t.amount || 0) - grossAmount) > 0.01) return false
    const tMs = new Date(t.date).getTime()
    return !Number.isNaN(tMs) && Math.abs(tMs - dateMs) <= MATCH_TOLERANCE_DAYS * DAY_MS
  })
  return candidates.length === 1 ? candidates[0] : undefined
}

async function matchBusinessProjectName(businessId: string, customerName: string): Promise<string | undefined> {
  const trimmed = customerName.trim()
  if (!trimmed) return undefined
  const projects = await projectStore.getByBusinessId(businessId)
  const matches = projects.filter(p => p.name.trim() === trimmed)
  return matches.length === 1 ? matches[0].name : undefined
}

async function isDateInClosedVatPeriod(date: string): Promise<boolean> {
  const payments = await db.vatPayments.toArray()
  return payments.some(p => p.periodStart <= date && date <= p.periodEnd)
}

export async function saveExternalIncomeDocument(input: ExternalIncomeDocInput): Promise<ExternalIncomeSaveResult> {
  const errors = validateExternalIncomeInput(input)
  if (errors.length > 0) return { ok: false, error: errors.join(' · ') }

  const serial = input.serialNumber.trim()
  // A period already declared and paid must not change under it (same rule
  // as the YPAY import, aglamazo#383).
  if (await isDateInClosedVatPeriod(input.date)) {
    return { ok: false, error: `תקופת המע״מ של ${input.date} כבר דווחה ושולמה — המסמך לא נשמר` }
  }
  const duplicate = (await db.ypayDocuments.toArray()).find(d =>
    String(d.serialNumber).trim() === serial && d.docType === input.docType
    && (d.businessId === input.businessId || d.source !== 'external'),
  )
  if (duplicate) {
    return { ok: false, error: `מסמך מספר ${serial} מסוג זה כבר קיים` }
  }

  const isReceipt = input.docType === YpayDocType.TaxInvoiceReceipt
  const [credit, projectName] = await Promise.all([
    isReceipt ? findLinkableCredit(input.businessId, input.grossAmount, input.date) : Promise.resolve(undefined),
    matchBusinessProjectName(input.businessId, input.customerName),
  ])

  const now = new Date().toISOString()
  const doc: YpayDocument = {
    transactionId: credit?.syncId || `${SYNTHETIC_TRANSACTION_ID_PREFIX}${input.businessId}:${input.docType}:${serial}`,
    url: input.url,
    serialNumber: serial,
    docType: input.docType,
    // Same amount convention as every other ypayDocuments row: a 106 stores
    // NET, a 109 stores GROSS (invoiceNetAmount/invoiceVatAmount rely on it).
    amount: isReceipt ? input.grossAmount : input.netAmount,
    businessId: input.businessId,
    source: 'external',
    customerName: input.customerName.trim(),
    ...(projectName ? { projectName } : {}),
    ...(input.driveFileId ? { driveFileId: input.driveFileId } : {}),
    // An invoice-receipt is paid by definition; the credit's date is when the
    // money landed (moneyReceivedAt), the document date drives the VAT period.
    ...(isReceipt ? { paidAt: new Date(input.date).toISOString() } : {}),
    ...(credit ? { moneyReceivedAt: credit.date } : {}),
    createdAt: new Date(input.date).toISOString(),
    updatedAt: now,
  }
  console.log('[ExternalIncome] saving', { serial, docType: doc.docType, amount: doc.amount, linked: !!credit, projectName })
  const id = await db.ypayDocuments.add(doc)
  const saved = await db.ypayDocuments.get(id)
  return { ok: true, doc: saved ?? doc, linkedTransaction: credit }
}
