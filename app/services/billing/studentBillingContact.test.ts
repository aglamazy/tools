import { describe, it, expect } from 'vitest'
import { buildStudentYpayContact, studentInvoiceBlocker, STUDENT_EMAIL_REQUIRED_MESSAGE } from './studentBillingContact'

describe('studentInvoiceBlocker', () => {
  it('blocks a student with no email', () => {
    expect(studentInvoiceBlocker({})).toBe(STUDENT_EMAIL_REQUIRED_MESSAGE)
  })
  it('blocks a whitespace / direction-mark-only email', () => {
    expect(studentInvoiceBlocker({ email: '  ‏ ' })).toBe(STUDENT_EMAIL_REQUIRED_MESSAGE)
  })
  it('allows a student with an email', () => {
    expect(studentInvoiceBlocker({ email: 'parent@example.com' })).toBeNull()
  })
})

describe('buildStudentYpayContact', () => {
  it('throws the Hebrew prompt when email is missing', () => {
    expect(() => buildStudentYpayContact({ name: 'משה' })).toThrow(STUDENT_EMAIL_REQUIRED_MESSAGE)
  })
  it('passes ח.פ and phone through, cleaned', () => {
    expect(buildStudentYpayContact({
      name: 'משה',
      email: ' parent@example.com‎',
      contactBusinessID: ' 123456789 ',
      contactPhone: '050-1234567',
    })).toEqual({ email: 'parent@example.com', name: 'משה', businessID: '123456789', phone: '050-1234567' })
  })
  it('omits empty ח.פ / phone keys instead of sending blanks', () => {
    const c = buildStudentYpayContact({ name: 'משה', email: 'p@example.com', contactBusinessID: '', contactPhone: '  ' })
    expect(c).toEqual({ email: 'p@example.com', name: 'משה' })
    expect('businessID' in c).toBe(false)
    expect('phone' in c).toBe(false)
  })
})
