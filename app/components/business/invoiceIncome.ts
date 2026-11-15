import type { Project, Transaction, YpayDocument } from '@/app/db/financeDB'
import { YpayDocType, invoiceNetAmount } from '@/app/services/ypayService'
import { getVatRateForDate } from '@/app/lib/vat'

/**
 * aglamazo#485 (Agla, live 2026-11-15): the taxes page's self-employed income
 * is the business's ypay tax documents, not its bank deposits.
 *
 *  - Income for a month = חשבונית מס (106, 7xxxxx) + חשבונית מס קבלה (109,
 *    9xxxxx) by document date, minus חשבונית מס זיכוי (107, 6xxxxx), all
 *    excl. VAT (invoiceNetAmount).
 *  - A bank deposit that pays one of those documents (a 109 linked to it, or
 *    a receipt whose closesAllocations point at a 106/109) is that invoice's
 *    payment, not income: counted zero times.
 *  - A deposit with no such invoice is never dropped (method doc §4: link a
 *    receipt or issue one). It counts toward income at its excl.-VAT amount
 *    and is listed as its own "unpapered" line, so the column never silently
 *    understates income. A receipt that only partly pays counted invoices
 *    leaves its unallocated remainder as such a line.
 *
 * Pure: every figure on the page (table, forecast, BTL, income tax) reads
 * this one result.
 */

const INCOME_DOC_TYPES = new Set<number>([YpayDocType.TaxInvoice, YpayDocType.TaxInvoiceReceipt])
const CREDIT_DOC_TYPE = YpayDocType.TaxInvoiceCredit as number

export type IncomeDocLine = {
  docId?: number
  serial: string
  docType: number
  date: string // YYYY-MM-DD, the document's own date
  customer: string
  net: number // signed: a credit note is negative
}

export type UnpaperedDepositLine = {
  txId?: number
  date: string
  description: string
  category: string
  gross: number // the part of the deposit no counted invoice covers
  net: number // gross excl. VAT — what it adds to income
  receiptSerial?: string // set when a receipt exists but pays no counted invoice
  linkedDocNoAmount?: boolean // the linked 106/109 record carries no amount (an old manual-link stub)
}

export type MonthIncome = {
  total: number
  docs: IncomeDocLine[]
  unpapered: UnpaperedDepositLine[]
}

export type InvoiceIncomeInput = {
  /** syncIds of the businesses that are columns on this table */
  businessSyncIds: string[]
  docs: YpayDocument[]
  projects: Project[]
  transactions: Transaction[]
  /** business syncId -> its income category names */
  bizCategoryMap: Map<string, string[]>
  /** a deposit's gross amount excl. VAT (exempt dealer: unchanged) */
  depositNet: (tx: Transaction, gross: number) => number
}

export type InvoiceIncomeResult = {
  /** business syncId -> MM/YYYY -> income */
  byBusiness: Map<string, Map<string, MonthIncome>>
  /** income documents no business on the table could be resolved for */
  unattributed: YpayDocument[]
}

const pad2 = (n: number) => String(n).padStart(2, '0')

function docLocalDate(createdAt: string): { iso: string; month: string } {
  const d = new Date(createdAt)
  const iso = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
  return { iso, month: `${pad2(d.getMonth() + 1)}/${d.getFullYear()}` }
}

export const emptyMonthIncome = (): MonthIncome => ({ total: 0, docs: [], unpapered: [] })

export function computeInvoiceIncome(input: InvoiceIncomeInput): InvoiceIncomeResult {
  const { businessSyncIds, docs, projects, transactions, bizCategoryMap, depositNet } = input
  const bizSet = new Set(businessSyncIds)

  const catToBiz = new Map<string, string>()
  for (const b of businessSyncIds) for (const c of bizCategoryMap.get(b) || []) catToBiz.set(c, b)

  const projectBizByName = new Map<string, Set<string>>()
  for (const p of projects) {
    if (!p.name) continue
    const s = projectBizByName.get(p.name) || new Set<string>()
    s.add(p.businessId)
    projectBizByName.set(p.name, s)
  }

  const txByKey = new Map<string, Transaction>()
  for (const t of transactions) {
    if (t.syncId) txByKey.set(t.syncId, t)
    if (t.id != null) txByKey.set(String(t.id), t)
  }
  const txOfDoc = (d: YpayDocument) => (d.transactionId ? txByKey.get(d.transactionId) : undefined)
  const bizOfTx = (t?: Transaction) => (t?.category ? catToBiz.get(t.category) : undefined)

  // receipts allocating to an invoice, by the invoice's syncId
  const receiptsByInvoice = new Map<string, YpayDocument[]>()
  for (const d of docs) {
    for (const a of d.closesAllocations || []) {
      const list = receiptsByInvoice.get(a.docId) || []
      list.push(d)
      receiptsByInvoice.set(a.docId, list)
    }
  }

  // Which table business issued an income/credit document:
  // its businessId, else its project (when the name is unique among the
  // table's businesses), else the business of the deposit it or its receipt
  // is linked to. A project or businessId of a business NOT on this table
  // means the document is someone else's — not ours to count.
  const resolveBiz = (d: YpayDocument): string | null | undefined => {
    if (d.businessId) return bizSet.has(d.businessId) ? d.businessId : null
    if (d.projectName) {
      const owners = projectBizByName.get(d.projectName)
      const ours = owners ? Array.from(owners).filter(b => bizSet.has(b)) : []
      if (ours.length === 1) return ours[0]
      if (owners && owners.size > 0 && ours.length === 0) return null
    }
    const direct = bizOfTx(txOfDoc(d))
    if (direct) return direct
    for (const r of (d.syncId && receiptsByInvoice.get(d.syncId)) || []) {
      const b = bizOfTx(txOfDoc(r))
      if (b) return b
    }
    return undefined
  }

  const byBusiness = new Map<string, Map<string, MonthIncome>>()
  for (const b of businessSyncIds) byBusiness.set(b, new Map())
  const slot = (biz: string, month: string): MonthIncome => {
    const m = byBusiness.get(biz)!
    let v = m.get(month)
    if (!v) { v = emptyMonthIncome(); m.set(month, v) }
    return v
  }

  const unattributed: YpayDocument[] = []
  const countedDocSyncIds = new Set<string>()
  for (const d of docs) {
    const isIncome = INCOME_DOC_TYPES.has(d.docType)
    if (!isIncome && d.docType !== CREDIT_DOC_TYPE) continue
    if (!d.createdAt) continue
    // A record with no amount (a pre-#380 manual-link stub) adds nothing and
    // must not hide its deposit either — see the deposit loop below.
    if (isIncome && !(d.amount && d.amount > 0)) continue
    const biz = resolveBiz(d)
    if (biz === null) continue
    if (biz === undefined) { unattributed.push(d); continue }
    if (d.syncId && isIncome) countedDocSyncIds.add(d.syncId)
    const { iso, month } = docLocalDate(d.createdAt)
    const netAbs = Math.abs(invoiceNetAmount(d, getVatRateForDate(iso)))
    const net = isIncome ? netAbs : -netAbs
    const s = slot(biz, month)
    s.docs.push({ docId: d.id, serial: d.serialNumber, docType: d.docType, date: iso, customer: d.customerName || d.projectName || '', net })
    s.total += net
  }

  // A deposit's linked document, by the same two keys IncomeTab uses.
  const docByTxKey = new Map<string, YpayDocument>()
  for (const d of docs) if (d.transactionId && !docByTxKey.has(d.transactionId)) docByTxKey.set(d.transactionId, d)

  for (const t of transactions) {
    const biz = bizOfTx(t)
    if (!biz || !t.month || !(t.amount > 0)) continue
    const linked = (t.syncId && docByTxKey.get(t.syncId)) || (t.id != null ? docByTxKey.get(String(t.id)) : undefined)
    let covered = 0
    const linkedNoAmount = !!linked && INCOME_DOC_TYPES.has(linked.docType) && !(linked.amount && linked.amount > 0)
    if (linked && INCOME_DOC_TYPES.has(linked.docType)) {
      // a 109 (or a 106 linked straight to the money): the deposit IS that
      // document's payment, and the document is what counts
      if (!linkedNoAmount) covered = t.amount
    } else if (linked) {
      for (const a of linked.closesAllocations || []) {
        if (countedDocSyncIds.has(a.docId)) covered += a.amount
      }
    }
    const remainder = Math.round((t.amount - covered) * 100) / 100
    if (remainder < 1) continue
    const net = depositNet(t, remainder)
    const s = slot(biz, t.month)
    s.unpapered.push({
      txId: t.id,
      date: t.date,
      description: t.description || '',
      category: t.category || '',
      gross: remainder,
      net,
      receiptSerial: linked ? linked.serialNumber : undefined,
      linkedDocNoAmount: linkedNoAmount || undefined,
    })
    s.total += net
  }

  for (const m of byBusiness.values()) {
    for (const v of m.values()) {
      v.docs.sort((a, b) => a.date.localeCompare(b.date))
      v.unpapered.sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    }
  }
  return { byBusiness, unattributed }
}

/** Sum of one month's income over a set of businesses. */
export function monthIncomeFor(result: InvoiceIncomeResult, bizSyncIds: string[], month: string): number {
  let s = 0
  for (const b of bizSyncIds) s += result.byBusiness.get(b)?.get(month)?.total || 0
  return s
}

/** One month's income merged over a set of businesses (a person's tax rows). */
export function mergedMonthIncome(result: InvoiceIncomeResult, bizSyncIds: string[], month: string): MonthIncome {
  const out = emptyMonthIncome()
  for (const b of bizSyncIds) {
    const m = result.byBusiness.get(b)?.get(month)
    if (!m) continue
    out.total += m.total
    out.docs.push(...m.docs)
    out.unpapered.push(...m.unpapered)
  }
  out.docs.sort((a, b) => a.date.localeCompare(b.date))
  out.unpapered.sort((a, b) => (a.date || '').localeCompare(b.date || ''))
  return out
}
