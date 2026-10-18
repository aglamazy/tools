import { describe, it, expect, beforeEach } from 'vitest'
import { db, type YpayDocument } from '@/app/db/financeDB'
import type { Student } from '@/app/types/student'
import type { StudentLessons } from './monthScan'
import { groupCustomers } from './customerInvoices'
import {
  findBilledCustomers, approvableCustomers, isCustomerBilled, markCustomerBilled, loadBilledCustomers,
} from './billedCustomers'

const BIZ = 'biz-sync-1'
const MONTH = 'ספטמבר 2026'

// The record createItemBasedInvoice writes for a student invoice (aglamazo#437):
// project-invoice shape + businessId.
const doc = (extra: Partial<YpayDocument> & { email?: string } = {}): YpayDocument => {
  const { email = 'parent@example.com', ...rest } = extra
  const monthName = rest.monthName ?? MONTH
  return {
    transactionId: `invoice:${email}:${monthName}`,
    url: 'https://ypay.example/doc/1001',
    serialNumber: '1001',
    docType: 104,
    amount: 600,
    monthName,
    businessId: BIZ,
    createdAt: '2026-10-01T10:00:00.000Z',
    ...rest,
  }
}

const student = (syncId: string, name: string, email: string, lessonRate: number): Student => ({
  syncId, businessId: BIZ, name, email, lessonRate, archived: false,
  createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
})

const lessons = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => ({ eventId: `${prefix}-${i}`, date: `2026-09-${String(i + 1).padStart(2, '0')}`, startTime: '16:00', title: prefix }))

const matched: StudentLessons[] = [
  { student: student('s-moshe', 'משה', 'Parent@Example.com', 150), lessons: lessons('moshe', 4) },
  { student: student('s-ron', 'רון', 'ron.family@example.com', 200), lessons: lessons('ron', 2) },
]

describe('findBilledCustomers', () => {
  it('detects a customer already billed for the business + month', () => {
    const billed = findBilledCustomers([doc()], BIZ, MONTH)
    expect([...billed.keys()]).toEqual(['parent@example.com'])
    expect(billed.get('parent@example.com')).toEqual([
      { serialNumber: '1001', url: 'https://ypay.example/doc/1001', docType: 104, createdAt: '2026-10-01T10:00:00.000Z' },
    ])
  })

  it('counts both invoice doc types (104 exempt, 106 authorized)', () => {
    const billed = findBilledCustomers([doc(), doc({ serialNumber: '1002', docType: 106 })], BIZ, MONTH)
    expect(billed.get('parent@example.com')?.map(d => d.serialNumber)).toEqual(['1001', '1002'])
  })

  it('does not detect a different month, a different business or a different email', () => {
    expect(findBilledCustomers([doc({ monthName: 'אוגוסט 2026' })], BIZ, MONTH).size).toBe(0)
    expect(findBilledCustomers([doc({ businessId: 'other-biz' })], BIZ, MONTH).size).toBe(0)
    const billed = findBilledCustomers([doc({ email: 'someone.else@example.com' })], BIZ, MONTH)
    expect(isCustomerBilled(billed, 'parent@example.com')).toBe(false)
  })

  it('does not detect a project invoice or an item invoice of the business (no businessId / other transactionId)', () => {
    const { businessId: _drop, ...noBiz } = doc({ projectName: 'אתר' })
    void _drop
    expect(findBilledCustomers([noBiz as YpayDocument], BIZ, MONTH).size).toBe(0)
    expect(findBilledCustomers([doc({ transactionId: 'invoice-items:1001' })], BIZ, MONTH).size).toBe(0)
  })

  it('ignores docs that are not a student invoice (no email, receipt / credit-note doc type)', () => {
    expect(findBilledCustomers([doc({ transactionId: `invoice::${MONTH}` })], BIZ, MONTH).size).toBe(0)
    expect(findBilledCustomers([doc({ docType: 108 })], BIZ, MONTH).size).toBe(0)
    expect(findBilledCustomers([doc({ docType: 107 })], BIZ, MONTH).size).toBe(0)
    expect(findBilledCustomers([doc({ docType: 109 })], BIZ, MONTH).size).toBe(0)
  })

  it('normalizes the queried email (case and whitespace)', () => {
    const billed = findBilledCustomers([doc()], BIZ, MONTH)
    expect(isCustomerBilled(billed, 'PARENT@example.COM ')).toBe(true)
    expect(isCustomerBilled(billed, ' Parent@Example.com')).toBe(true)
  })

  it('keys on the exact recorded form invoice:<normalizedEmail>:<monthName>', () => {
    expect(findBilledCustomers([doc({ email: 'PARENT@example.com' })], BIZ, MONTH).size).toBe(0)
  })

  it('returns nothing without a business or month', () => {
    expect(findBilledCustomers([doc()], '', MONTH).size).toBe(0)
    expect(findBilledCustomers([doc()], BIZ, '').size).toBe(0)
  })
})

describe('approvableCustomers', () => {
  it('leaves billed customers out of the approvable set', () => {
    const { customers } = groupCustomers(matched)
    const billed = findBilledCustomers([doc()], BIZ, MONTH)
    expect(approvableCustomers(customers, billed).map(c => c.email)).toEqual(['ron.family@example.com'])
    expect(approvableCustomers(customers, new Map()).map(c => c.email)).toEqual(['parent@example.com', 'ron.family@example.com'])
  })

  it('leaves out a customer with nothing to bill', () => {
    const { customers } = groupCustomers(matched, new Set(['ron-0|2026-09-01', 'ron-1|2026-09-02']))
    expect(approvableCustomers(customers, new Map()).map(c => c.email)).toEqual(['parent@example.com'])
  })

  it('after a successful issue, the same customer is no longer approvable', () => {
    const { customers } = groupCustomers(matched)
    const before = new Map()
    const after = markCustomerBilled(before, 'Parent@Example.com ', { serialNumber: '2001', url: 'https://ypay.example/doc/2001' })
    expect(before.size).toBe(0) // not mutated
    expect(after.get('parent@example.com')).toEqual([{ serialNumber: '2001', url: 'https://ypay.example/doc/2001' }])
    expect(approvableCustomers(customers, after).map(c => c.email)).toEqual(['ron.family@example.com'])
  })
})

describe('loadBilledCustomers (ypayDocuments scan)', () => {
  beforeEach(async () => {
    await db.ypayDocuments.clear()
  })

  it('reads the month\'s billed customers from the table, including a row just written by an issue', async () => {
    await db.ypayDocuments.bulkAdd([
      doc(),
      doc({ serialNumber: '1003', email: 'ron.family@example.com', monthName: 'אוגוסט 2026' }),
      { transactionId: 'tx-unrelated', url: 'u', serialNumber: '9', docType: 108, createdAt: '2026-09-02T00:00:00.000Z' },
    ])
    let billed = await loadBilledCustomers(BIZ, MONTH)
    expect([...billed.keys()]).toEqual(['parent@example.com'])

    // The row createItemBasedInvoice writes for a newly issued September invoice for ron.
    await db.ypayDocuments.add(doc({ serialNumber: '1004', email: 'ron.family@example.com' }))
    billed = await loadBilledCustomers(BIZ, MONTH)
    const { customers } = groupCustomers(matched)
    expect(approvableCustomers(customers, billed)).toEqual([])
  })
})
