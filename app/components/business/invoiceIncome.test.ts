import { describe, it, expect } from 'vitest'
import { computeInvoiceIncome, monthIncomeFor } from './invoiceIncome'
import type { Project, Transaction, YpayDocument } from '@/app/db/financeDB'

// aglamazo#485 Done-when a-e, on synthetic shapes copied from the real dev
// data (2026): one ypay account, invoices attributed by project, receipts
// linking deposits to invoices via closesAllocations.

const AH = 'biz-ah'
const BL = 'biz-bl'
const OTHER = 'biz-other' // a business not on this table

const projects: Project[] = [
  { businessId: AH, name: 'Client A', archived: false, createdAt: '' } as Project,
  { businessId: BL, name: 'Client B', archived: false, createdAt: '' } as Project,
  // same name in a business that is not a column here (real case: AH + MA)
  { businessId: OTHER, name: 'Client A', archived: false, createdAt: '' } as Project,
  { businessId: OTHER, name: 'Other only', archived: false, createdAt: '' } as Project,
]
const bizCategoryMap = new Map([[AH, ['AH income']], [BL, ['BL income']]])
const authorizedNet = (_t: Transaction, gross: number) => gross / 1.18
const exemptNet = (_t: Transaction, gross: number) => gross

let n = 0
const doc = (p: Partial<YpayDocument>): YpayDocument =>
  ({ id: ++n, syncId: `doc-${n}`, transactionId: '', url: '', serialNumber: String(n), createdAt: '2026-06-15T09:00:00.000Z', ...p }) as YpayDocument
const tx = (p: Partial<Transaction>): Transaction =>
  ({ id: ++n, syncId: `tx-${n}`, type: 'bank', description: 'deposit', isFixed: false, ...p }) as Transaction

const run = (docs: YpayDocument[], transactions: Transaction[], depositNet = authorizedNet) =>
  computeInvoiceIncome({ businessSyncIds: [AH, BL], docs, projects, transactions, bizCategoryMap, depositNet })

describe('computeInvoiceIncome (aglamazo#485)', () => {
  it('a: one invoice + its linked deposit -> invoice net once, deposit zero times, panel lists the invoice', () => {
    const inv = doc({ docType: 106, serialNumber: '700002', projectName: 'Client A', amount: 3500, createdAt: '2026-05-12T09:00:00.000Z' })
    const dep = tx({ category: 'AH income', month: '06/2026', date: '2026-06-02', amount: 4130 })
    const rcpt = doc({ docType: 108, serialNumber: '800015', transactionId: dep.syncId!, closesAllocations: [{ docId: inv.syncId!, amount: 4130 }] })
    const r = run([inv, rcpt], [dep])
    const may = r.byBusiness.get(AH)!.get('05/2026')!
    expect(may.total).toBe(3500)
    expect(may.docs.map(d => d.serial)).toEqual(['700002'])
    expect(r.byBusiness.get(AH)!.get('06/2026')).toBeUndefined() // the deposit month adds nothing
  })

  it('a: a 109 invoice-receipt linked straight to its deposit counts net once, by document date', () => {
    const inv = doc({ docType: 109, serialNumber: '900003', amount: 1180, createdAt: '2026-08-10T00:00:00.000Z' })
    const dep = tx({ category: 'AH income', month: '09/2026', date: '2026-09-02', amount: 1180 })
    inv.transactionId = dep.syncId!
    const r = run([inv], [dep])
    expect(r.byBusiness.get(AH)!.get('08/2026')!.total).toBeCloseTo(1000, 2)
    expect(r.byBusiness.get(AH)!.get('09/2026')).toBeUndefined()
  })

  it('b: a credit note (107) is subtracted from the month', () => {
    const inv = doc({ docType: 106, serialNumber: '700010', projectName: 'Client B', amount: 5000 })
    const cr = doc({ docType: 107, serialNumber: '600001', projectName: 'Client B', amount: 1200 })
    const r = run([inv, cr], [])
    const jun = r.byBusiness.get(BL)!.get('06/2026')!
    expect(jun.total).toBe(3800)
    expect(jun.docs.map(d => d.net)).toEqual([5000, -1200])
  })

  it('c: a deposit with no document is an unpapered line and counts excl. VAT', () => {
    const dep = tx({ category: 'BL income', month: '09/2026', date: '2026-09-07', amount: 4748.37 })
    const r = run([], [dep])
    const sep = r.byBusiness.get(BL)!.get('09/2026')!
    expect(sep.unpapered).toHaveLength(1)
    expect(sep.unpapered[0].receiptSerial).toBeUndefined()
    expect(sep.total).toBeCloseTo(4024.04, 2)
  })

  it('c: a receipt that pays no counted invoice (exempt dealer, or a 104 proforma) leaves the deposit counted', () => {
    const proforma = doc({ docType: 104, serialNumber: '300007', projectName: 'Client B', amount: 30513.02 })
    const dep = tx({ category: 'BL income', month: '03/2026', date: '2026-03-11', amount: 30513.02 })
    const rcpt = doc({ docType: 108, serialNumber: '800010', transactionId: dep.syncId!, closesAllocations: [{ docId: proforma.syncId!, amount: 30513.02 }] })
    const r = run([proforma, rcpt], [dep], exemptNet)
    const mar = r.byBusiness.get(BL)!.get('03/2026')!
    expect(mar.total).toBe(30513.02)
    expect(mar.unpapered[0].receiptSerial).toBe('800010')
    expect(mar.docs).toHaveLength(0)
  })

  it('c: the unallocated remainder of a partly-allocated receipt stays visible', () => {
    const inv = doc({ docType: 106, projectName: 'Client A', amount: 1000 })
    const dep = tx({ category: 'AH income', month: '06/2026', date: '2026-06-20', amount: 2360 })
    const rcpt = doc({ docType: 108, transactionId: dep.syncId!, closesAllocations: [{ docId: inv.syncId!, amount: 1180 }] })
    const jun = run([inv, rcpt], [dep]).byBusiness.get(AH)!.get('06/2026')!
    expect(jun.unpapered[0].gross).toBe(1180)
    expect(jun.total).toBeCloseTo(2000, 2)
  })

  it('c: a linked 109 record with no amount (old manual-link stub) does not hide its deposit', () => {
    const dep = tx({ category: 'BL income', month: '02/2026', date: '2026-02-17', amount: 1260 })
    const stub = doc({ docType: 109, serialNumber: '800008', transactionId: dep.syncId!, createdAt: '2026-09-07T18:36:18.540Z' })
    const r = run([stub], [dep], exemptNet)
    const feb = r.byBusiness.get(BL)!.get('02/2026')!
    expect(feb.total).toBe(1260)
    expect(feb.unpapered[0]).toMatchObject({ receiptSerial: '800008', linkedDocNoAmount: true })
    expect(r.byBusiness.get(BL)!.get('09/2026')).toBeUndefined()
  })

  it('d: both business columns follow the same rule, and a project shared with an off-table business resolves to the table one', () => {
    const ah = doc({ docType: 106, projectName: 'Client A', amount: 2900 })
    const bl = doc({ docType: 106, projectName: 'Client B', amount: 4024 })
    const off = doc({ docType: 106, projectName: 'Other only', amount: 99 })
    const r = run([ah, bl, off], [])
    expect(r.byBusiness.get(AH)!.get('06/2026')!.total).toBe(2900)
    expect(r.byBusiness.get(BL)!.get('06/2026')!.total).toBe(4024)
    expect(r.unattributed).toHaveLength(0) // the off-table doc is someone else's, not lost
  })

  it('d: a doc with no project/business is attributed through its receipt\'s deposit, else reported unattributed', () => {
    const inv = doc({ docType: 106, amount: 1000 })
    const dep = tx({ category: 'BL income', month: '07/2026', date: '2026-07-01', amount: 1180 })
    const rcpt = doc({ docType: 108, transactionId: dep.syncId!, closesAllocations: [{ docId: inv.syncId!, amount: 1180 }] })
    const orphan = doc({ docType: 109, amount: 500 })
    const r = run([inv, rcpt, orphan], [dep])
    expect(r.byBusiness.get(BL)!.get('06/2026')!.total).toBe(1000)
    expect(r.byBusiness.get(BL)!.get('07/2026')).toBeUndefined()
    expect(r.unattributed.map(d => d.syncId)).toEqual([orphan.syncId])
  })

  it('e: monthIncomeFor sums the same per-month figure every consumer reads', () => {
    const a = doc({ docType: 106, projectName: 'Client A', amount: 1000 })
    const b = doc({ docType: 106, projectName: 'Client B', amount: 500 })
    const r = run([a, b], [])
    expect(monthIncomeFor(r, [AH, BL], '06/2026')).toBe(1500)
    expect(monthIncomeFor(r, [AH], '06/2026')).toBe(1000)
  })
})
