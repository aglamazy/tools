import { db, type YpayDocument } from '@/app/db/financeDB'
import { YpayDocType } from '@/app/services/ypayService'
import { customerInvoiceTransactionId, normalizeEmail, type Customer } from './customerInvoices'

/**
 * Calendar billing, slice 6 (aglamazo#433): no double billing. A customer
 * (normalized email) that already has a student invoice for the month, for
 * this business, is BILLED — shown with its invoice, never approvable again.
 *
 * A student invoice is recorded like a project invoice (aglamazo#437):
 * transactionId `invoice:<normalizedEmail>:<monthName>` plus `businessId`.
 * Identity is that transactionId + businessId ONLY. If a sibling's email
 * changed after the month was billed, the new email reads as an unbilled
 * customer — the document records the email it was issued to, and that is
 * all we compare.
 *
 * Cancellation: a credit note (107 חשבונית מס זיכוי) is never written to
 * ypayDocuments by this app, and no ypayDocuments row links a credit to the
 * invoice it cancels, so "credited" is not modelled. Only the invoice doc
 * types an approve can issue (104 / 106, see getBillingDocType) count; any
 * other doc type with the same transactionId is ignored.
 */

/** The doc types a student invoice is issued as: exempt → 104, authorized → 106. */
export const STUDENT_INVOICE_DOC_TYPES: ReadonlySet<number> = new Set([YpayDocType.BusinessInvoice, YpayDocType.TaxInvoice])

/** What the UI shows for a billed customer. */
export type BilledDoc = Pick<YpayDocument, 'serialNumber' | 'url'> & Partial<Pick<YpayDocument, 'docType' | 'createdAt'>>

/** Normalized email → the invoice(s) already issued to it for the month. */
export type BilledCustomers = ReadonlyMap<string, BilledDoc[]>

/**
 * The customers already billed for `monthName` (project-invoice format,
 * "ספטמבר 2026" — see billingMonthName) by the business with
 * `businessSyncId`: docs with that businessId, an invoice doc type
 * (104 / 106), and transactionId `invoice:<email>:<monthName>`.
 */
export function findBilledCustomers(docs: readonly YpayDocument[], businessSyncId: string, monthName: string): Map<string, BilledDoc[]> {
  const billed = new Map<string, BilledDoc[]>()
  if (!businessSyncId || !monthName) return billed
  const prefix = 'invoice:'
  const suffix = `:${monthName}`
  for (const doc of docs) {
    if (doc.businessId !== businessSyncId) continue
    if (!STUDENT_INVOICE_DOC_TYPES.has(doc.docType)) continue
    const tid = doc.transactionId
    if (!tid.startsWith(prefix) || !tid.endsWith(suffix)) continue
    const email = normalizeEmail(tid.slice(prefix.length, tid.length - suffix.length))
    if (!email || customerInvoiceTransactionId(email, monthName) !== tid) continue
    const list = billed.get(email) ?? []
    list.push({ serialNumber: doc.serialNumber, url: doc.url, docType: doc.docType, createdAt: doc.createdAt })
    billed.set(email, list)
  }
  return billed
}

/** Whether a customer already has an invoice for the month. */
export function isCustomerBilled(billed: BilledCustomers, email: string): boolean {
  return (billed.get(normalizeEmail(email))?.length ?? 0) > 0
}

/** The run's approvable set: customers with something to bill and no invoice yet this month. */
export function approvableCustomers(customers: readonly Customer[], billed: BilledCustomers): Customer[] {
  return customers.filter(c => c.total > 0 && !isCustomerBilled(billed, c.email))
}

/** A new billed map with `doc` recorded for `email` — applied right after a successful issue. */
export function markCustomerBilled(billed: BilledCustomers, email: string, doc: BilledDoc): Map<string, BilledDoc[]> {
  const key = normalizeEmail(email)
  const next = new Map(billed)
  next.set(key, [...(billed.get(key) ?? []), doc])
  return next
}

/**
 * Read the month's billed customers from ypayDocuments. businessId is
 * unindexed, so this scans the table and filters (same read path the
 * YPAY service uses for ypayDocuments).
 */
export async function loadBilledCustomers(businessSyncId: string, monthName: string): Promise<Map<string, BilledDoc[]>> {
  const docs = await db.ypayDocuments.toArray()
  return findBilledCustomers(docs, businessSyncId, monthName)
}
