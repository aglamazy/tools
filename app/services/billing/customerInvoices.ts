import type { Student } from '@/app/types/student'
import type { Business } from '@/app/db/financeDB'
import { ypayService } from '@/app/services/ypayService'
import type { ScanLesson, StudentLessons } from './monthScan'
import { buildStudentYpayContact, studentInvoiceBlocker } from './studentBillingContact'

/**
 * Calendar billing, slice 5 (aglamazo#432): a student's EMAIL is the paying
 * customer. Siblings share one email, so the month's matched students are
 * grouped by normalized email into customers, and each customer gets ONE
 * invoice with ONE LINE PER STUDENT: lesson count × the student's lessonRate.
 * A student with no email cannot be billed and is listed as blocked instead.
 */

/** One student's line on a customer's invoice. `lessons` are every matched lesson; `included` the ones still ticked. */
export type CustomerStudentLine = {
  student: Student
  lessons: ScanLesson[]
  included: ScanLesson[]
  count: number
  rate: number
  amount: number
}

export type Customer = {
  /** Normalized email (trimmed, lower-cased) — the customer's identity and the grouping key. */
  email: string
  students: CustomerStudentLine[]
  lessonCount: number
  total: number
}

export type BlockedStudent = { student: Student; lessons: ScanLesson[]; reason: string }

export type CustomerGrouping = { customers: Customer[]; blocked: BlockedStudent[] }

export type CustomerInvoiceItem = { description: string; quantity: number; price: number }

// Invisible Unicode directional characters — same set as studentBillingContact.ts / monthScan.ts
const DIRECTION_MARKS = /[‎‏‪-‮⁦-⁩]/g

/** The customer key of an email: direction marks stripped, trimmed, lower-cased. */
export function normalizeEmail(email?: string): string {
  return (email ?? '').replace(DIRECTION_MARKS, '').trim().toLowerCase()
}

/** Stable key of one lesson — used to untick a lesson that did not happen. */
export function lessonKey(lesson: Pick<ScanLesson, 'eventId' | 'date'>): string {
  return `${lesson.eventId}|${lesson.date}`
}

/**
 * Group the month's matched students into customers by normalized email, in
 * first-lesson order. `excluded` holds lessonKey()s the teacher unticked —
 * they drop out of the count and amount but stay listed (so they can be re-ticked).
 */
export function groupCustomers(matched: StudentLessons[], excluded: ReadonlySet<string> = new Set()): CustomerGrouping {
  const byEmail = new Map<string, Customer>()
  const blocked: BlockedStudent[] = []

  for (const { student, lessons } of matched) {
    const reason = studentInvoiceBlocker(student)
    if (reason) {
      blocked.push({ student, lessons, reason })
      continue
    }
    const email = normalizeEmail(student.email)
    const included = lessons.filter(l => !excluded.has(lessonKey(l)))
    const line: CustomerStudentLine = {
      student,
      lessons,
      included,
      count: included.length,
      rate: student.lessonRate,
      amount: included.length * student.lessonRate,
    }
    let customer = byEmail.get(email)
    if (!customer) {
      customer = { email, students: [], lessonCount: 0, total: 0 }
      byEmail.set(email, customer)
    }
    customer.students.push(line)
    customer.lessonCount += line.count
    customer.total += line.amount
  }

  return { customers: [...byEmail.values()], blocked }
}

/** The invoice line description for one student: "<name> - N שיעורים × rate ₪". */
export function studentLineDescription(line: Pick<CustomerStudentLine, 'student' | 'count' | 'rate'>): string {
  return `${line.student.name} - ${line.count} שיעורים × ${line.rate} ₪`
}

/**
 * The YPAY items of a customer's invoice: one line per student, in the same
 * shape the hourly project invoice uses (count × rate spelled out in the
 * description, quantity 1, price = the line amount). A student whose lessons
 * were all unticked has nothing to bill and gets no line.
 */
export function buildCustomerInvoiceItems(customer: Customer): CustomerInvoiceItem[] {
  return customer.students
    .filter(line => line.count > 0)
    .map(line => ({ description: studentLineDescription(line), quantity: 1, price: line.amount }))
}

/** YYYY-MM of a billing month (month is 1-based). */
export function billingMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

/**
 * Issue ONE invoice for a customer for a month, through the existing item-based
 * YPAY flow (doc type from the dealer VAT status: exempt → חשבונית עסקה,
 * authorized → חשבונית מס). The contact is built by buildStudentYpayContact —
 * the email-required gate — from the customer's first student; siblings share
 * the email, which is what YPAY matches the customer on. The issued document
 * is recorded with the customer email + billing month so a later slice can
 * tell this customer+month was already billed.
 */
export async function issueCustomerInvoice(business: Business, customer: Customer, params: {
  year: number
  month: number // 1-based
  date: string // YYYY-MM-DD issue date
  vatType?: 'exempt' | 'authorized'
}): Promise<{ url: string; serialNumber: string }> {
  const items = buildCustomerInvoiceItems(customer)
  if (items.length === 0) throw new Error('אין שיעורים לחיוב עבור לקוח זה')
  const contact = buildStudentYpayContact(customer.students[0].student)
  return ypayService.createItemBasedInvoice(business, {
    items,
    date: params.date,
    vatType: params.vatType,
    contact,
    studentBilling: {
      customerEmail: customer.email,
      billingMonth: billingMonthKey(params.year, params.month),
      businessId: business.syncId,
      studentSyncIds: customer.students.filter(l => l.count > 0).map(l => l.student.syncId).filter((id): id is string => !!id),
    },
  })
}
