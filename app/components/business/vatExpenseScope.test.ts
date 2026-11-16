import { describe, it, expect } from 'vitest'
import { vatDeductibleCategoryNames } from './vatExpenseScope'

// aglamazo#487: Yaakov's tab must not list Suzi's business (Tishrey)
// expenses; a household deductible category stays.
describe('vatDeductibleCategoryNames', () => {
  const expCategoryMap = new Map<string, string[]>([
    ['biz-yaakov', ['עסק יעקב', 'ארנונה']],
    ['biz-tishrey', ['עסק סוזי', 'דלק וחניה', 'ארנונה']],
  ])

  it('excludes a transaction category of another member\'s business', () => {
    const names = vatDeductibleCategoryNames(expCategoryMap, ['biz-yaakov'])
    const otherMemberTx = { id: 2212, category: 'עסק סוזי', amount: -656.55 }
    expect(names.has(otherMemberTx.category)).toBe(false)
    expect(names.has('דלק וחניה')).toBe(false)
  })

  it('keeps the person\'s own business and household deductible categories', () => {
    const names = vatDeductibleCategoryNames(expCategoryMap, ['biz-yaakov'])
    expect([...names].sort()).toEqual(['ארנונה', 'עסק יעקב'].sort())
  })

  it('the other member\'s tab gets their own categories', () => {
    const names = vatDeductibleCategoryNames(expCategoryMap, ['biz-tishrey', undefined])
    expect(names.has('עסק סוזי')).toBe(true)
    expect(names.has('עסק יעקב')).toBe(false)
  })
})
