import { describe, it, expect } from 'vitest'
import { isBusinessInvoice, resolveVatIncomeOwner } from './businessInvoice'
import type { Business, Project } from '@/app/db/financeDB'

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

describe('resolveVatIncomeOwner (aglamazo#493)', () => {
  const mine = { syncId: BIZ, ypayClientId: '78597' } as Business
  const other = { syncId: 'biz-2', ypayClientId: '44444' } as Business
  const allProjects = [{ businessId: 'biz-2', name: 'זר', archived: false, createdAt: '' } as Project]

  it('uses the issuing YPAY account before an unmatched customer/project name', () => {
    expect(resolveVatIncomeOwner({ url: 'https://ypay.co.il/doc/78597/700010', projectName: 'נועם כהן' }, [mine], allProjects)).toBe(BIZ)
  })

  it('does not count another member account, a known other project, or an unassigned document as ours', () => {
    expect(resolveVatIncomeOwner({ url: 'https://ypay.co.il/doc/44444/700011' }, [mine], allProjects)).toBeUndefined()
    expect(resolveVatIncomeOwner({ url: '', projectName: 'זר' }, [mine], allProjects)).toBeNull()
    expect(resolveVatIncomeOwner({ url: '', projectName: 'לא ידוע' }, [mine], allProjects)).toBeUndefined()
  })
})
