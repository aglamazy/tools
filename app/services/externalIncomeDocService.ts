import { db, type YpayDocument } from '@/app/db/financeDB'
import { YpayDocType } from '@/app/services/ypayService'
import { projectStore } from '@/app/stores/projectStore'

// aglamazo#481 (Agla 119505): "What is needed now, is to upload an
// invoice-reciept/invoice from external source. (My case - GROW payments
// create document in the clearance operation)". 119509: "The money
// transaction will come later when I ask GROW to pull the money.
// Accumolated number will be there."
//
// An uploaded document is ONE ypayDocuments row, nothing else:
// - VAT output sums ypayDocuments of type 106/109 (TaxVatSection.tsx), so
//   the document is counted there once, in the period of its own date.
// - Income tax and the Incomes tab sum transactions only. The money arrives
//   later as one accumulated GROW payout credit through the Import page, so
//   no transaction is created here (it would double the income) and no
//   document-to-credit link is attempted (one payout covers many documents).

export const EXTERNAL_DOC_TYPES = [YpayDocType.TaxInvoice, YpayDocType.TaxInvoiceReceipt] as const
const SYNTHETIC_TRANSACTION_ID_PREFIX = 'external:'

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
  | { ok: true; doc: YpayDocument }
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

/**
 * Everything that can refuse a document, run BEFORE its PDF is uploaded so a
 * refused document never leaves a file behind in Drive. null = may be saved.
 */
export async function precheckExternalIncomeDocument(input: Omit<ExternalIncomeDocInput, 'url'> & { url?: string }): Promise<string | null> {
  const errors = validateExternalIncomeInput({ ...input, url: input.url ?? 'pending-upload' })
  if (errors.length > 0) return errors.join(' · ')

  const serial = input.serialNumber.trim()
  // A period already declared and paid must not change under it (same rule
  // as the YPAY import, aglamazo#383).
  if (await isDateInClosedVatPeriod(input.date)) {
    return `תקופת המע״מ של ${input.date} כבר דווחה ושולמה — המסמך לא נשמר`
  }
  // Same number + type already in this business (or issued via YPAY) = the
  // same document uploaded twice; refusing it keeps VAT counted once.
  const duplicate = (await db.ypayDocuments.toArray()).find(d =>
    String(d.serialNumber).trim() === serial && d.docType === input.docType
    && (d.businessId === input.businessId || d.source !== 'external'),
  )
  if (duplicate) {
    return `מסמך מספר ${serial} מסוג זה כבר קיים`
  }
  return null
}

export async function saveExternalIncomeDocument(input: ExternalIncomeDocInput): Promise<ExternalIncomeSaveResult> {
  if (!input.url) return { ok: false, error: 'הקובץ לא הועלה' }
  const refused = await precheckExternalIncomeDocument(input)
  if (refused) return { ok: false, error: refused }

  const serial = input.serialNumber.trim()

  const isReceipt = input.docType === YpayDocType.TaxInvoiceReceipt
  const projectName = await matchBusinessProjectName(input.businessId, input.customerName)
  const now = new Date().toISOString()
  const doc: YpayDocument = {
    // transactionId is a unique index; an external document has no single
    // transaction, so it gets its own synthetic key.
    transactionId: `${SYNTHETIC_TRANSACTION_ID_PREFIX}${input.businessId}:${input.docType}:${serial}`,
    url: input.url,
    serialNumber: serial,
    docType: input.docType,
    // Same convention as every other ypayDocuments row: a 106 stores NET, a
    // 109 stores GROSS (invoiceNetAmount/invoiceVatAmount rely on it).
    amount: isReceipt ? input.grossAmount : input.netAmount,
    businessId: input.businessId,
    source: 'external',
    customerName: input.customerName.trim(),
    ...(projectName ? { projectName } : {}),
    ...(input.driveFileId ? { driveFileId: input.driveFileId } : {}),
    // An invoice-receipt is paid by definition (shown as closed on the tab).
    ...(isReceipt ? { paidAt: new Date(input.date).toISOString() } : {}),
    createdAt: new Date(input.date).toISOString(),
    updatedAt: now,
  }
  console.log('[ExternalIncome] saving', { serial, docType: doc.docType, amount: doc.amount, projectName })
  const id = await db.ypayDocuments.add(doc)
  const saved = await db.ypayDocuments.get(id)
  return { ok: true, doc: saved ?? doc }
}
