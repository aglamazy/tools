import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { db, type Business } from '@/app/db/financeDB'
import { ypayService, YpayDocType } from './ypayService'

// aglamazo#432: the student (calendar-billing) invoice goes through the existing
// createItemBasedInvoice flow. `fetch` is stubbed — no request ever leaves the
// test — and the issued document lands in fake-indexeddb.

const fetchMock = vi.fn()

const business = (vatType: 'exempt' | 'authorized'): Business => ({
  id: 1, syncId: 'biz-1', name: 'מורה', userId: 'u1', vatType,
  ypayClientId: 'cid', ypayClientSecret: 'secret',
} as unknown as Business)

const params = {
  items: [
    { description: 'משה לוי - 4 שיעורים × 150 ₪', quantity: 1, price: 600 },
    { description: 'דנה לוי - 3 שיעורים × 120 ₪', quantity: 1, price: 360 },
  ],
  date: '2026-10-01',
  contact: { email: 'parent@example.com', name: 'משה לוי' },
  studentBilling: { customerEmail: 'parent@example.com', billingMonth: '2026-09', businessId: 'biz-1', studentSyncIds: ['s-moshe', 's-dana'] },
}

beforeEach(async () => {
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({ json: async () => ({ success: true, url: 'https://ypay.test/doc.pdf', serialNumber: '5001' }) })
  vi.stubGlobal('fetch', fetchMock)
  await db.ypayDocuments.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createItemBasedInvoice — student invoice (aglamazo#432)', () => {
  it('exempt dealer → one חשבונית עסקה (104) request, net lines with vatIncluded:false, to the customer contact', async () => {
    await ypayService.createItemBasedInvoice(business('exempt'), { ...params })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.action).toBe('createDocument')
    expect(body.docType).toBe(YpayDocType.BusinessInvoice)
    expect(body.items).toEqual(params.items.map(it => ({ ...it, vatIncluded: false })))
    expect(body.contact).toEqual(params.contact)
    expect(body.date).toBe('2026-10-01')
  })

  it('authorized dealer → חשבונית מס (106)', async () => {
    await ypayService.createItemBasedInvoice(business('authorized'), { ...params })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).docType).toBe(YpayDocType.TaxInvoice)
  })

  it('an explicit vatType overrides the business field', async () => {
    await ypayService.createItemBasedInvoice(business('exempt'), { ...params, vatType: 'authorized' })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).docType).toBe(YpayDocType.TaxInvoice)
  })

  it('records the issued document with the customer email + billing month, and no projectName key', async () => {
    await ypayService.createItemBasedInvoice(business('exempt'), { ...params })
    const rows = await db.ypayDocuments.toArray()
    expect(rows).toHaveLength(1)
    const row = rows[0]
    expect(row).toMatchObject({
      transactionId: 'invoice-items:5001',
      serialNumber: '5001',
      url: 'https://ypay.test/doc.pdf',
      docType: YpayDocType.BusinessInvoice,
      amount: 960,
      customerEmail: 'parent@example.com',
      billingMonth: '2026-09',
      billingBusinessId: 'biz-1',
      studentSyncIds: ['s-moshe', 's-dana'],
    })
    expect('projectName' in row).toBe(false)
  })

  it('a YPAY refusal throws and records nothing', async () => {
    fetchMock.mockResolvedValueOnce({ json: async () => ({ success: false, message: 'contact invalid' }) })
    await expect(ypayService.createItemBasedInvoice(business('exempt'), { ...params })).rejects.toThrow('contact invalid')
    expect(await db.ypayDocuments.count()).toBe(0)
  })
})
