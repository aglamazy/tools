import { describe, it, expect } from 'vitest'
import { buildLinkedYpayDocumentStub } from './IncomeTab'
import { YpayDocType } from '@/app/services/ypayService'

// aglamazo#380, Sheli 2026-09-14: manually linking a serial number that had
// no existing local record wrote a stub with no `amount` at all and
// `createdAt` set to the link-click time instead of the document's real
// date -- understated a live 07-08/2026 declaration by ₪1,120 מחזור /
// ₪201.60 VAT (the true 900003 receipt: 10/08/2026, ₪1,120 net / ₪201.60
// VAT / ₪1,321.60 gross) before ypay's own screen caught it.

describe('buildLinkedYpayDocumentStub', () => {
  it('uses the linked transaction\'s amount and date instead of a blank stub (the real #900003 case)', () => {
    const transaction = { syncId: 'tx-sync-1', amount: 1321.60, date: '2026-08-10' }
    const stub = buildLinkedYpayDocumentStub(transaction, '900003', 'authorized')
    expect(stub.amount).toBe(1321.60)
    expect(stub.createdAt).toBe(new Date('2026-08-10').toISOString())
    expect(stub.createdAt).not.toContain(new Date().toISOString().slice(0, 10)) // not today's link-time
    expect(stub.docType).toBe(YpayDocType.TaxInvoiceReceipt)
    expect(stub.serialNumber).toBe('900003')
    expect(stub.transactionId).toBe('tx-sync-1')
  })

  it('uses Receipt (108) for an exempt dealer', () => {
    const transaction = { syncId: 'tx-sync-2', amount: 500, date: '2026-08-10' }
    const stub = buildLinkedYpayDocumentStub(transaction, '800001', 'exempt')
    expect(stub.docType).toBe(YpayDocType.Receipt)
  })

  it('always stores a positive amount even for a negative-signed transaction', () => {
    const transaction = { syncId: 'tx-sync-3', amount: -250, date: '2026-08-10' }
    const stub = buildLinkedYpayDocumentStub(transaction, '900004', 'authorized')
    expect(stub.amount).toBe(250)
  })

  it('carries through closesAllocations when provided', () => {
    const transaction = { syncId: 'tx-sync-4', amount: 100, date: '2026-08-10' }
    const allocations = [{ docId: 'inv-1', amount: 100 }]
    const stub = buildLinkedYpayDocumentStub(transaction, '900005', 'authorized', allocations)
    expect(stub.closesAllocations).toBe(allocations)
  })
})
