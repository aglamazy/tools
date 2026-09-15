import { describe, it, expect } from 'vitest'
import type { Category } from '@/app/types/category'
import type { Business, ExpenseDocument, Transaction } from '@/app/db/financeDB'
import {
  resolveBusinessExpenseCategories,
  expenseScaleFraction,
  resolveHouseholdExpenseCategories,
  householdExpenseNetAmount,
  resolveTopLevelCategoryName,
  resolveExpenseLine,
  groupExpenseDocsByTransaction,
  resolveLinkedExpenseDoc,
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

// aglamazo#394 (Sheli): the month drill-down needs אחוז/חלק מוכר per line,
// which requires knowing WHICH of a person's several self-employed
// businesses a given expense's category actually resolves against —
// SelfEmployedIncomeTaxSection aggregates across all of them at once.
describe('resolveExpenseLine', () => {
  it('a directly-assigned category is 100% recognized regardless of candidate order', () => {
    const biz = makeBusiness({ syncId: 'biz-1' })
    const other = makeBusiness({ syncId: 'biz-2' })
    const cat = makeCategory({ businessId: 'biz-1' })
    const categoryByName = new Map([[cat.name, cat]])
    const tx = { id: 1, category: cat.name, amount: -500 } as Transaction
    const line = resolveExpenseLine(tx, [other, biz], categoryByName)
    expect(line.fraction).toBe(1)
    expect(line.recognizedAmount).toBe(500)
  })

  it('a household-folded category recognizes only the owning member\'s share (real aglamazo#369 case)', () => {
    const biz = makeBusiness({ syncId: 'biz-1', userId: 'user-1' })
    const household = makeCategory({ isDeductible: true, deductibleByMember: { 'user-1': 16 } })
    const categoryByName = new Map([[household.name, household]])
    const tx = { id: 2, category: household.name, amount: -1000 } as Transaction
    const line = resolveExpenseLine(tx, [biz], categoryByName)
    expect(line.fraction).toBeCloseTo(0.16)
    expect(line.recognizedAmount).toBeCloseTo(160)
  })

  it('tries every candidate business and recognizes 0 when none match', () => {
    const biz1 = makeBusiness({ syncId: 'biz-1' })
    const biz2 = makeBusiness({ syncId: 'biz-2' })
    const cat = makeCategory({ businessId: 'biz-3' }) // a third, unrelated business
    const categoryByName = new Map([[cat.name, cat]])
    const tx = { id: 3, category: cat.name, amount: -300 } as Transaction
    const line = resolveExpenseLine(tx, [biz1, biz2], categoryByName)
    expect(line.fraction).toBe(0)
    expect(line.recognizedAmount).toBe(0)
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

// aglamazo#402, Sheli 2026-09-15: transaction 1489 had 4 ExpenseDocuments —
// one correctly pinned to the closed period's payment, three unpinned — and
// still failed to render in that closed period. A plain Map keyed by
// transactionId only ever kept whichever doc happened to be last in the
// array, silently discarding the correctly pinned one.
describe('groupExpenseDocsByTransaction + resolveLinkedExpenseDoc (aglamazo#402)', () => {
  const makeDoc = (over: Partial<ExpenseDocument>): ExpenseDocument => ({
    id: 1, transactionId: 'tx-1', vendor: 'v', amount: undefined, vatAmount: undefined,
    driveFileId: '', createdAt: '2026-01-01', ...over,
  } as ExpenseDocument)

  it('keeps every doc for a transaction instead of overwriting', () => {
    const docs = [makeDoc({ id: 1 }), makeDoc({ id: 2 }), makeDoc({ id: 3 })]
    const byTx = groupExpenseDocsByTransaction(docs)
    expect(byTx.get('tx-1')?.map(d => d.id)).toEqual([1, 2, 3])
  })

  it('closed period: finds the doc actually pinned to this payment, even if it is not the last one', () => {
    const docs = [
      makeDoc({ id: 60, vatPaymentId: undefined }),
      makeDoc({ id: 58, vatPaymentId: 'pay-A' }),
      makeDoc({ id: 61, vatPaymentId: undefined }),
      makeDoc({ id: 62, vatPaymentId: undefined }),
    ]
    const linked = resolveLinkedExpenseDoc(docs, { isPeriodClosed: true, paymentSyncId: 'pay-A' })
    expect(linked?.id).toBe(58)
  })

  it('closed period: returns undefined when no doc is pinned to this specific payment', () => {
    const docs = [makeDoc({ id: 1, vatPaymentId: 'pay-B' })]
    expect(resolveLinkedExpenseDoc(docs, { isPeriodClosed: true, paymentSyncId: 'pay-A' })).toBeUndefined()
  })

  it('open period: prefers an unpinned doc that actually carries extracted data', () => {
    const docs = [
      makeDoc({ id: 1, vatPaymentId: undefined, amount: undefined, vatAmount: undefined }),
      makeDoc({ id: 2, vatPaymentId: undefined, amount: 100, vatAmount: 18 }),
    ]
    const linked = resolveLinkedExpenseDoc(docs, { isPeriodClosed: false })
    expect(linked?.id).toBe(2)
  })

  it('open period: ignores a doc pinned to a different payment', () => {
    const docs = [makeDoc({ id: 1, vatPaymentId: 'pay-A' })]
    expect(resolveLinkedExpenseDoc(docs, { isPeriodClosed: false })).toBeUndefined()
  })
})
