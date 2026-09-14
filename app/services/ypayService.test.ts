import { describe, it, expect } from 'vitest'
import { invoiceGrossAmount, invoiceNetAmount, invoiceVatAmount } from './ypayService'
import { YpayDocType } from './ypayService'
import type { YpayDocument } from '@/app/db/financeDB'

// aglamazo#382, Sheli 2026-09-14: YpayDocument.amount's meaning depends on
// docType (106 stores NET, 109 stores GROSS — see buildYpayDocumentFromImportRow),
// but TaxVatSection.tsx read every docType's amount as NET, multiplying by
// the VAT rate directly. Masked for months because every real 109 sat at
// amount: undefined until aglamazo#380/#381 started filling in real
// amounts. Real case: #900003, net 1,120.00 / VAT 201.60 / gross 1,321.60.

const doc = (docType: number, amount: number): YpayDocument => ({
  transactionId: 't', url: '', serialNumber: 's', docType, amount, createdAt: '2026-08-10T00:00:00.000Z',
})

const RATE = 0.18

describe('invoiceNetAmount / invoiceVatAmount (aglamazo#382)', () => {
  it('TaxInvoice (106): amount is already net — passed through unchanged', () => {
    const d = doc(YpayDocType.TaxInvoice, 3534.12)
    expect(invoiceNetAmount(d, RATE)).toBe(3534.12)
    expect(invoiceGrossAmount(d, RATE)).toBeCloseTo(4170.26, 2)
    expect(invoiceVatAmount(d, RATE)).toBeCloseTo(636.14, 2)
  })

  it('TaxInvoiceReceipt (109): amount is gross — stripped down to net (the real #900003 case)', () => {
    const d = doc(YpayDocType.TaxInvoiceReceipt, 1321.6)
    expect(invoiceNetAmount(d, RATE)).toBeCloseTo(1120, 2)
    expect(invoiceGrossAmount(d, RATE)).toBe(1321.6) // already gross, unchanged
    expect(invoiceVatAmount(d, RATE)).toBeCloseTo(201.6, 2)
  })

  it('non-VAT-bearing doc types (e.g. exempt-dealer Receipt, 108) carry no VAT split', () => {
    const d = doc(YpayDocType.Receipt, 500)
    expect(invoiceNetAmount(d, RATE)).toBe(500)
    expect(invoiceVatAmount(d, RATE)).toBe(0)
  })

  it('defaults to VAT_RATE_AUTHORIZED_DEALER when no rate is passed', () => {
    const d = doc(YpayDocType.TaxInvoiceReceipt, 1321.6)
    expect(invoiceNetAmount(d)).toBeCloseTo(1120, 1)
  })
})
