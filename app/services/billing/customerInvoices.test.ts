import { describe, it, expect, vi, beforeEach } from 'vitest'

// The approve path must never reach YPAY from a test — the service is mocked.
const createItemBasedInvoice = vi.fn()
vi.mock('@/app/services/ypayService', () => ({ ypayService: { createItemBasedInvoice: (...a: unknown[]) => createItemBasedInvoice(...a) } }))

import type { Student } from '@/app/types/student'
import type { Business } from '@/app/db/financeDB'
import type { ScanLesson, StudentLessons } from './monthScan'
import {
  groupCustomers, buildCustomerInvoiceItems, issueCustomerInvoice, lessonKey, normalizeEmail, billingMonthKey,
} from './customerInvoices'
import { STUDENT_EMAIL_REQUIRED_MESSAGE } from './studentBillingContact'

const student = (syncId: string, name: string, email: string | undefined, lessonRate: number, extra: Partial<Student> = {}): Student => ({
  syncId, businessId: 'biz-1', name, ...(email !== undefined ? { email } : {}), lessonRate, archived: false,
  createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z', ...extra,
})

const lessons = (prefix: string, n: number): ScanLesson[] =>
  Array.from({ length: n }, (_, i) => ({ eventId: `${prefix}-${i}`, date: `2026-09-${String(i + 1).padStart(2, '0')}`, startTime: '16:00', title: prefix }))

const moshe = student('s-moshe', 'משה לוי', 'Parent@Example.com', 150, { contactPhone: '050-1234567' })
const dana = student('s-dana', 'דנה לוי', '  parent@example.COM ', 120) // sibling — same email, different case/spaces
const ron = student('s-ron', 'רון כהן', 'ron.family@example.com', 200)
const noEmail = student('s-yael', 'יעל', undefined, 100)

const matched: StudentLessons[] = [
  { student: moshe, lessons: lessons('moshe', 4) },
  { student: ron, lessons: lessons('ron', 2) },
  { student: dana, lessons: lessons('dana', 3) },
  { student: noEmail, lessons: lessons('yael', 5) },
]

const business = { id: 1, syncId: 'biz-1', name: 'מורה', userId: 'u1', vatType: 'exempt' } as unknown as Business

describe('normalizeEmail', () => {
  it('trims, lower-cases and strips direction marks', () => {
    expect(normalizeEmail(' ‏Parent@Example.COM ')).toBe('parent@example.com')
    expect(normalizeEmail(undefined)).toBe('')
  })
})

describe('groupCustomers (aglamazo#432)', () => {
  it('groups siblings sharing an email into one customer, regardless of case and spaces', () => {
    const { customers } = groupCustomers(matched)
    expect(customers.map(c => c.email)).toEqual(['parent@example.com', 'ron.family@example.com'])
    const levi = customers[0]
    expect(levi.students.map(l => l.student.name)).toEqual(['משה לוי', 'דנה לוי'])
    expect(levi.students.map(l => [l.count, l.rate, l.amount])).toEqual([[4, 150, 600], [3, 120, 360]])
    expect(levi.lessonCount).toBe(7)
    expect(levi.total).toBe(960)
    expect(customers[1].total).toBe(400)
  })

  it('puts a student with no email in the blocked list with the prompt, not in any customer', () => {
    const { customers, blocked } = groupCustomers(matched)
    expect(blocked).toHaveLength(1)
    expect(blocked[0].student.name).toBe('יעל')
    expect(blocked[0].reason).toBe(STUDENT_EMAIL_REQUIRED_MESSAGE)
    expect(blocked[0].lessons).toHaveLength(5)
    expect(customers.flatMap(c => c.students.map(l => l.student.syncId))).not.toContain('s-yael')
  })

  it('an unticked lesson drops out of the count and amount but stays listed', () => {
    const excluded = new Set([lessonKey(matched[0].lessons[1])])
    const levi = groupCustomers(matched, excluded).customers[0]
    const mosheLine = levi.students[0]
    expect(mosheLine.lessons).toHaveLength(4)
    expect(mosheLine.count).toBe(3)
    expect(mosheLine.amount).toBe(450)
    expect(levi.lessonCount).toBe(6)
    expect(levi.total).toBe(810)
  })
})

describe('buildCustomerInvoiceItems', () => {
  it('builds one line per student: "<name> - N שיעורים × rate", price = count × rate', () => {
    const levi = groupCustomers(matched).customers[0]
    expect(buildCustomerInvoiceItems(levi)).toEqual([
      { description: 'משה לוי - 4 שיעורים × 150 ₪', quantity: 1, price: 600 },
      { description: 'דנה לוי - 3 שיעורים × 120 ₪', quantity: 1, price: 360 },
    ])
  })

  it('recomputes the line after unticking a lesson', () => {
    const excluded = new Set([lessonKey(matched[2].lessons[0])])
    const levi = groupCustomers(matched, excluded).customers[0]
    expect(buildCustomerInvoiceItems(levi)[1]).toEqual({ description: 'דנה לוי - 2 שיעורים × 120 ₪', quantity: 1, price: 240 })
  })

  it('a student with every lesson unticked gets no line', () => {
    const excluded = new Set(matched[2].lessons.map(lessonKey))
    const levi = groupCustomers(matched, excluded).customers[0]
    expect(buildCustomerInvoiceItems(levi)).toHaveLength(1)
  })
})

describe('issueCustomerInvoice — approve path, ypayService mocked', () => {
  beforeEach(() => {
    createItemBasedInvoice.mockReset()
    createItemBasedInvoice.mockResolvedValue({ url: 'https://ypay.test/doc.pdf', serialNumber: '1001' })
  })

  it('issues exactly one invoice per customer, contact from buildStudentYpayContact, VAT type passed through', async () => {
    const { customers } = groupCustomers(matched)
    for (const c of customers) {
      await issueCustomerInvoice(business, c, { year: 2026, month: 9, date: '2026-10-01', vatType: 'authorized' })
    }
    expect(createItemBasedInvoice).toHaveBeenCalledTimes(2)

    const [biz, params] = createItemBasedInvoice.mock.calls[0]
    expect(biz).toBe(business)
    expect(params).toEqual({
      items: [
        { description: 'משה לוי - 4 שיעורים × 150 ₪', quantity: 1, price: 600 },
        { description: 'דנה לוי - 3 שיעורים × 120 ₪', quantity: 1, price: 360 },
      ],
      date: '2026-10-01',
      vatType: 'authorized',
      // buildStudentYpayContact(first student): cleaned email, name, phone
      contact: { email: 'Parent@Example.com', name: 'משה לוי', phone: '050-1234567' },
      studentBilling: {
        customerEmail: 'parent@example.com',
        billingMonth: '2026-09',
        businessId: 'biz-1',
        studentSyncIds: ['s-moshe', 's-dana'],
      },
    })
    expect(createItemBasedInvoice.mock.calls[1][1].contact.email).toBe('ron.family@example.com')
  })

  it('refuses a customer with nothing to bill, without calling YPAY', async () => {
    const excluded = new Set(matched[1].lessons.map(lessonKey))
    const ronCustomer = groupCustomers(matched, excluded).customers[1]
    await expect(issueCustomerInvoice(business, ronCustomer, { year: 2026, month: 9, date: '2026-10-01' })).rejects.toThrow()
    expect(createItemBasedInvoice).not.toHaveBeenCalled()
  })

  it('surfaces a YPAY failure to the caller (never swallowed)', async () => {
    createItemBasedInvoice.mockRejectedValueOnce(new Error('שגיאה ביצירת חשבונית'))
    const levi = groupCustomers(matched).customers[0]
    await expect(issueCustomerInvoice(business, levi, { year: 2026, month: 9, date: '2026-10-01' })).rejects.toThrow('שגיאה ביצירת חשבונית')
  })

  it('billingMonthKey pads the month', () => {
    expect(billingMonthKey(2026, 3)).toBe('2026-03')
  })
})
