import type { Student } from '@/app/types/student'
import type { YpayContact } from '@/app/services/ypayService'

/**
 * A student's EMAIL is the paying customer (siblings share one email; one
 * invoice per customer per month). The YPAY contact is held on the student row
 * the way a freelancer Project holds it (contactBusinessID / contactPhone).
 */

export const STUDENT_EMAIL_REQUIRED_MESSAGE = 'יש להוסיף אימייל לתלמיד לפני הפקת חשבונית'

// Strip invisible Unicode directional characters (RTL/LTR marks) — same as the project path in IncomeTab
const strip = (s?: string) => s?.replace(/[‎‏‪-‮⁦-⁩]/g, '').trim() || ''

/** Returns the Hebrew reason an invoice cannot be issued for this student, or null when it can. */
export function studentInvoiceBlocker(student: Pick<Student, 'email'>): string | null {
  return strip(student.email) ? null : STUDENT_EMAIL_REQUIRED_MESSAGE
}

/**
 * Build the YPAY contact for a student invoice. Throws (with the Hebrew prompt)
 * when the student has no email — an invoice must never be issued without one.
 */
export function buildStudentYpayContact(student: Pick<Student, 'name' | 'email' | 'contactBusinessID' | 'contactPhone'>): YpayContact {
  const blocker = studentInvoiceBlocker(student)
  if (blocker) throw new Error(blocker)
  const businessID = strip(student.contactBusinessID)
  const phone = strip(student.contactPhone)
  return {
    email: strip(student.email),
    name: student.name,
    ...(businessID ? { businessID } : {}),
    ...(phone ? { phone } : {}),
  }
}
