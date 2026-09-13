import { describe, it, expect } from 'vitest'
import type { Category } from '@/app/types/category'
import type { Business, Transaction } from '@/app/db/financeDB'
import {
  resolveBusinessExpenseCategories,
  expenseScaleFraction,
  resolveHouseholdExpenseCategories,
  householdExpenseNetAmount,
  resolveTopLevelCategoryName,
} from './expenseScale'

// aglamazo#369, Agla 2026-09-13, live with Sheli: "The household items should
// apear in taxes, but not iside BL." Household-deductible categories (no
// businessId) must no longer show up in a business's own Expense tab or
// supplier pivot -- resolveBusinessExpenseCategories is their only caller,
// and it's now direct-assignment-only. /app/taxes's TaxSelfEmployedSummaryTable
// calls expenseScaleFraction directly, never this function -- that
// proportional-split behavior is a separate, untouched concern (covered
// below to prove the fix didn't reach it).

function makeBusiness(overrides: Partial<Business> = {}): Business {
  return {
    syncId: 'biz-1',
    name: 'Test Biz',
    type: 'main',
    userId: 'user-1',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...overrides,
  } as Business
}

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 'cat-1',
    name: 'Test Category',
    type: 'expense',
    color: '#000',
    createdAt: '2026-01-01',
    ...overrides,
  }
}

describe('resolveBusinessExpenseCategories', () => {
  it('includes a category directly assigned to the business', () => {
    const business = makeBusiness()
    const cat = makeCategory({ businessId: 'biz-1' })
    expect(resolveBusinessExpenseCategories([cat], business)).toEqual([cat])
  })

  it('excludes a directly-assigned category flagged excludeFromBusinessTotals', () => {
    const business = makeBusiness()
    const cat = makeCategory({ businessId: 'biz-1', excludeFromBusinessTotals: true })
    expect(resolveBusinessExpenseCategories([cat], business)).toEqual([])
  })

  it('excludes a category assigned to a different business', () => {
    const business = makeBusiness()
    const cat = makeCategory({ businessId: 'biz-2' })
    expect(resolveBusinessExpenseCategories([cat], business)).toEqual([])
  })

  it('excludes a household-deductible category even for a wholly-owned business (aglamazo#369)', () => {
    const business = makeBusiness() // no ownerSharePercent = wholly owned
    const household = makeCategory({ isDeductible: true, deductibleByMember: { 'user-1': 16 } })
    expect(resolveBusinessExpenseCategories([household], business)).toEqual([])
  })

  it('excludes income-type categories', () => {
    const business = makeBusiness()
    const cat = makeCategory({ businessId: 'biz-1', type: 'income' })
    expect(resolveBusinessExpenseCategories([cat], business)).toEqual([])
  })
})

describe('expenseScaleFraction (unchanged — still drives /app/taxes)', () => {
  it('still returns the proportional household share, untouched by #369', () => {
    const business = makeBusiness()
    const household = makeCategory({ isDeductible: true, deductibleByMember: { 'user-1': 16 } })
    const categoryByName = new Map([[household.name, household]])
    const tx = { category: household.name, amount: -100 } as any
    expect(expenseScaleFraction(tx, business, categoryByName)).toBeCloseTo(0.16)
  })

  it('still returns 0 for a household category on a partnership', () => {
    const business = makeBusiness({ ownerSharePercent: 50 })
    const household = makeCategory({ isDeductible: true, deductibleByMember: { 'user-1': 16 } })
    const categoryByName = new Map([[household.name, household]])
    const tx = { category: household.name, amount: -100 } as any
    expect(expenseScaleFraction(tx, business, categoryByName)).toBe(0)
  })
})

// aglamazo#373: no page showed the household equivalent of a business's
// year×vendor expense pivot. resolveHouseholdExpenseCategories is that
// page's category source — every category with no businessId, regardless
// of isDeductible (groceries/culture/health are real household spend even
// though they're never tax-deductible).
describe('resolveHouseholdExpenseCategories', () => {
  it('includes a category with no businessId, deductible or not', () => {
    const groceries = makeCategory({ name: 'מזון' })
    const electricity = makeCategory({ name: 'חשמל', isDeductible: true, deductibleByMember: { u1: 16 } })
    expect(resolveHouseholdExpenseCategories([groceries, electricity])).toEqual([groceries, electricity])
  })

  it('excludes a category assigned to any business', () => {
    const cat = makeCategory({ businessId: 'biz-1' })
    expect(resolveHouseholdExpenseCategories([cat])).toEqual([])
  })

  it('excludes income-type categories', () => {
    const cat = makeCategory({ type: 'income' })
    expect(resolveHouseholdExpenseCategories([cat])).toEqual([])
  })
})

describe('householdExpenseNetAmount', () => {
  it('returns the full bank amount when there is no matched VAT', () => {
    const tx = { amount: -100 } as Transaction
    expect(householdExpenseNetAmount(tx, undefined)).toBe(100)
  })

  it('subtracts the matched document VAT, never scaling by any fraction', () => {
    const tx = { amount: -100 } as Transaction
    expect(householdExpenseNetAmount(tx, 17)).toBe(83)
  })

  it('never goes negative when VAT exceeds the amount', () => {
    const tx = { amount: -10 } as Transaction
    expect(householdExpenseNetAmount(tx, 17)).toBe(0)
  })
})

describe('resolveTopLevelCategoryName', () => {
  it('returns the category\'s own name when it has no parent', () => {
    const cat = makeCategory({ id: 'c1', name: 'מזון' })
    const byName = new Map([[cat.name, cat]])
    const byId = new Map([[cat.id, cat]])
    expect(resolveTopLevelCategoryName('מזון', byName, byId)).toBe('מזון')
  })

  it('rolls a sub-category up to its parent\'s name', () => {
    const parent = makeCategory({ id: 'parent', name: 'רכב ונסיעות' })
    const child = makeCategory({ id: 'child', name: 'דלק', parentId: 'parent' })
    const byName = new Map([[parent.name, parent], [child.name, child]])
    const byId = new Map([[parent.id, parent], [child.id, child]])
    expect(resolveTopLevelCategoryName('דלק', byName, byId)).toBe('רכב ונסיעות')
  })

  it('falls back to the sub-category\'s own name if the parent no longer exists', () => {
    const child = makeCategory({ id: 'child', name: 'דלק', parentId: 'deleted-parent' })
    const byName = new Map([[child.name, child]])
    const byId = new Map<string, Category>()
    expect(resolveTopLevelCategoryName('דלק', byName, byId)).toBe('דלק')
  })

  it('returns the input string unchanged for an unknown category name', () => {
    expect(resolveTopLevelCategoryName('לא קיים', new Map(), new Map())).toBe('לא קיים')
  })
})
