import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { db, type Business } from '@/app/db/financeDB'
import { ypayService, YpayDocType } from './ypayService'

// aglamazo#432 / #437: the student (calendar-billing) invoice goes through the existing
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
  customerMonth: { businessId: 'biz-1', customer: 'parent@example.com', monthName: 'ספטמבר 2026' },
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
  it('exempt dealer → one חשבונית עסקה (104) request, lines with NO VAT flag (no VAT added, #440), to the customer contact', async () => {
    await ypayService.createItemBasedInvoice(business('exempt'), { ...params })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.action).toBe('createDocument')
    expect(body.docType).toBe(YpayDocType.BusinessInvoice)
    expect(body.items).toEqual(params.items)
    expect(body.items.every((it: Record<string, unknown>) => !('vatIncluded' in it))).toBe(true)
    expect(body.contact).toEqual(params.contact)
    expect(body.date).toBe('2026-10-01')
  })

  it('authorized dealer → חשבונית מס (106), net lines with vatIncluded:false so YPAY adds VAT', async () => {
    await ypayService.createItemBasedInvoice(business('authorized'), { ...params })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.docType).toBe(YpayDocType.TaxInvoice)
    expect(body.items).toEqual(params.items.map(it => ({ ...it, vatIncluded: false })))
  })

  it('sandbox business → the request is marked sandbox so /api/ypay sends mail:false (#441)', async () => {
    const sb = { ...business('exempt'), ypayUseSandbox: true, ypaySandboxClientId: 'scid', ypaySandboxClientSecret: 'ssecret' } as Business
    await ypayService.createItemBasedInvoice(sb, { ...params })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.clientId).toBe('scid')
    expect(body.sandbox).toBe(true)
  })

  it('production business → not marked sandbox', async () => {
    await ypayService.createItemBasedInvoice(business('exempt'), { ...params })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).sandbox).toBeUndefined()
  })

  it('an explicit vatType overrides the business field', async () => {
    await ypayService.createItemBasedInvoice(business('exempt'), { ...params, vatType: 'authorized' })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).docType).toBe(YpayDocType.TaxInvoice)
  })

  it('records the issued document like a project invoice + businessId, with none of the #432 fields', async () => {
    await ypayService.createItemBasedInvoice(business('exempt'), { ...params })
    const rows = await db.ypayDocuments.toArray()
    expect(rows).toHaveLength(1)
    const row = rows[0]
    expect(row).toMatchObject({
      transactionId: 'invoice:parent@example.com:ספטמבר 2026',
      serialNumber: '5001',
      url: 'https://ypay.test/doc.pdf',
      docType: YpayDocType.BusinessInvoice,
      amount: 960,
      monthName: 'ספטמבר 2026',
      businessId: 'biz-1',
    })
    // id / syncId / updatedAt are stamped by the DB layer, not by this writer.
    const written = Object.keys(row).filter(k => !['id', 'syncId', 'updatedAt'].includes(k)).sort()
    expect(written).toEqual(['amount', 'businessId', 'createdAt', 'docType', 'monthName', 'serialNumber', 'transactionId', 'url'])
    for (const gone of ['projectName', 'customerEmail', 'billingMonth', 'billingBusinessId', 'studentSyncIds']) {
      expect(gone in row).toBe(false)
    }
  })

  it('a project item invoice (no customerMonth) is recorded exactly as before: invoice-items:<serial>, no businessId/monthName', async () => {
    const { customerMonth: _cm, ...projectParams } = params
    void _cm
    await ypayService.createItemBasedInvoice(business('exempt'), { ...projectParams, projectName: 'אתר' })
    const [row] = await db.ypayDocuments.toArray()
    expect(row).toMatchObject({ transactionId: 'invoice-items:5001', projectName: 'אתר', amount: 960 })
    expect('businessId' in row).toBe(false)
    expect('monthName' in row).toBe(false)
  })

  it('a YPAY refusal throws and records nothing', async () => {
    fetchMock.mockResolvedValueOnce({ json: async () => ({ success: false, message: 'contact invalid' }) })
    await expect(ypayService.createItemBasedInvoice(business('exempt'), { ...params })).rejects.toThrow('contact invalid')
    expect(await db.ypayDocuments.count()).toBe(0)
  })
})
