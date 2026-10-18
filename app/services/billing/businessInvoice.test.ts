import { describe, it, expect } from 'vitest'
import { isBusinessInvoice } from './businessInvoice'

// aglamazo#437: the one filter InvoicesTab, IncomeTab and the partner sync use
// to decide a YPAY document belongs to a business.

const BIZ = 'biz-1'
const projects = new Set(['אתר', 'אפליקציה'])

describe('isBusinessInvoice', () => {
  it('a project invoice belongs to the business that has the project', () => {
    expect(isBusinessInvoice({ projectName: 'אתר' }, BIZ, projects)).toBe(true)
    expect(isBusinessInvoice({ projectName: 'אתר' }, 'biz-2', new Set(['אחר']))).toBe(false)
  })

  it('a student invoice (no project) belongs to its business by businessId, not to another business', () => {
    const student = { businessId: BIZ }
    expect(isBusinessInvoice(student, BIZ, projects)).toBe(true)
    expect(isBusinessInvoice(student, 'biz-2', projects)).toBe(false)
    expect(isBusinessInvoice(student, 'biz-2', new Set())).toBe(false)
  })

  it('a doc with neither link belongs to no business', () => {
    expect(isBusinessInvoice({}, BIZ, projects)).toBe(false)
    expect(isBusinessInvoice({ projectName: 'זר' }, BIZ, projects)).toBe(false)
  })

  it('an empty business id never matches a doc without businessId', () => {
    expect(isBusinessInvoice({}, '', projects)).toBe(false)
  })
})
