import { describe, it, expect, beforeEach } from 'vitest'
import { db, type Project, type VatPayment } from '@/app/db/financeDB'
import { YpayDocType, invoiceNetAmount, invoiceVatAmount } from './ypayService'
import { getVatRateForDate } from '@/app/lib/vat'
import { saveExternalIncomeDocument, precheckExternalIncomeDocument, type ExternalIncomeDocInput } from './externalIncomeDocService'

// aglamazo#481: an invoice-receipt issued outside Aglamazo (GROW) is uploaded
// to a business. It must count in VAT once, and must not touch transactions
// (income tax comes from the later accumulated payout credit, Agla 119509).

const BIZ = 'biz-agents-head'

const receipt = (over: Partial<ExternalIncomeDocInput> = {}): ExternalIncomeDocInput => ({
  businessId: BIZ,
  docType: YpayDocType.TaxInvoiceReceipt,
  serialNumber: '4001',
  date: '2026-10-11',
  customerName: 'לקוח בדיקה',
  netAmount: 400,
  vatAmount: 72,
  grossAmount: 472,
  url: 'https://drive.test/file/4001',
  driveFileId: 'drive-4001',
  ...over,
})

beforeEach(async () => {
  await db.ypayDocuments.clear()
  await db.transactions.clear()
  await db.vatPayments.clear()
  await db.projects.clear()
})

describe('saveExternalIncomeDocument (aglamazo#481)', () => {
  it('109 is stored GROSS, tagged external, linked to the business, and adds no transaction', async () => {
    const r = await saveExternalIncomeDocument(receipt())
    expect(r.ok).toBe(true)
    const docs = await db.ypayDocuments.toArray()
    expect(docs).toHaveLength(1)
    expect(docs[0]).toMatchObject({
      docType: YpayDocType.TaxInvoiceReceipt, amount: 472, serialNumber: '4001',
      source: 'external', businessId: BIZ, customerName: 'לקוח בדיקה',
      url: 'https://drive.test/file/4001', driveFileId: 'drive-4001',
    })
    expect(docs[0].transactionId.startsWith('external:')).toBe(true)
    expect(docs[0].projectName).toBeUndefined() // customer is not a project here — VAT must not skip it
    expect(await db.transactions.count()).toBe(0)
  })

  it('counts its VAT once: 472.00 gross -> 72.00 output VAT, 400.00 net', async () => {
    await saveExternalIncomeDocument(receipt())
    const [doc] = await db.ypayDocuments.toArray()
    const rate = getVatRateForDate(new Date(doc.createdAt))
    expect(invoiceVatAmount(doc, rate)).toBeCloseTo(72, 2)
    expect(invoiceNetAmount(doc, rate)).toBeCloseTo(400, 2)
  })

  it('106 is stored NET (same convention as YPAY-issued tax invoices)', async () => {
    await saveExternalIncomeDocument(receipt({ docType: YpayDocType.TaxInvoice, serialNumber: '5000' }))
    const [doc] = await db.ypayDocuments.toArray()
    expect(doc.amount).toBe(400)
    expect(doc.paidAt).toBeUndefined()
  })

  it('refuses the same number + type a second time, so VAT is not doubled', async () => {
    expect((await saveExternalIncomeDocument(receipt())).ok).toBe(true)
    const second = await saveExternalIncomeDocument(receipt({ url: 'https://drive.test/other' }))
    expect(second.ok).toBe(false)
    expect(await db.ypayDocuments.count()).toBe(1)
  })

  it('refuses a document dated inside a VAT period already declared and paid', async () => {
    await db.vatPayments.add({ periodStart: '2026-09-01', periodEnd: '2026-10-31' } as unknown as VatPayment)
    const refused = await precheckExternalIncomeDocument(receipt())
    expect(refused).toMatch(/כבר דווחה/)
    expect((await saveExternalIncomeDocument(receipt())).ok).toBe(false)
    expect(await db.ypayDocuments.count()).toBe(0)
  })

  it('refuses net + VAT that does not equal the total', async () => {
    const r = await saveExternalIncomeDocument(receipt({ grossAmount: 500 }))
    expect(r.ok).toBe(false)
    expect(await db.ypayDocuments.count()).toBe(0)
  })

  it('takes projectName only from a project of THIS business', async () => {
    await db.projects.add({ name: 'לקוח בדיקה', businessId: BIZ } as unknown as Project)
    await saveExternalIncomeDocument(receipt())
    const [doc] = await db.ypayDocuments.toArray()
    expect(doc.projectName).toBe('לקוח בדיקה')
  })

  it('matches the project despite a double or non-breaking space in the read customer name', async () => {
    await db.projects.add({ name: 'לקוח בדיקה', businessId: BIZ } as unknown as Project)
    await saveExternalIncomeDocument(receipt({ customerName: 'לקוח\u00a0 בדיקה ' }))
    const [doc] = await db.ypayDocuments.toArray()
    expect(doc.projectName).toBe('לקוח בדיקה')
  })
})
