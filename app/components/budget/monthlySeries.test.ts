import { describe, it, expect } from 'vitest'
import { subjectMonthlyTotals, yAxisDomain, expenseSubject } from './monthlySeries'
import type { BudgetTransaction } from '@/app/types/transactions'
import type { Category } from '@/app/types/category'

const cat = (id: string, name: string, extra: Partial<Category> = {}): Category =>
  ({ id, name, color: '#000', type: 'expense', ...extra } as Category)
const categories: Category[] = [
  cat('p', 'הלוואה/מימון'),
  cat('s', 'משכנתא', { parentId: 'p' }),
  cat('o', 'מזון'),
  cat('c', 'חיסכון', { isCapital: true }),
]
let n = 0
const tx = (category: string, amount: number, extra: Partial<BudgetTransaction> = {}): BudgetTransaction =>
  ({ id: String(n++), date: '01/01/2026', business: 'b', category, amount, isFixed: false, paymentMethod: 'bank', ...extra })

describe('subjectMonthlyTotals (aglamazo#465)', () => {
  const byMonth = {
    3: [tx('הלוואה/מימון', -1000), tx('משכנתא', -500.5), tx('מזון', -70)],
    10: [tx('הלוואה/מימון', -10000), tx('מזון', -1)],
    5: [tx('מזון', -20)],
  }

  it('parent includes its sub-subject, in the right month slot', () => {
    const v = subjectMonthlyTotals(byMonth, 'הלוואה/מימון', categories)
    expect(v).toHaveLength(12)
    expect(v[2]).toBe(1500.5)
    expect(v[9]).toBe(10000)
    expect(v[4]).toBe(0) // month has data, none in this subject -> real zero
    expect(v[0]).toBeNull() // no data -> gap
    expect(v[11]).toBeNull()
  })

  it('a sub-subject alone counts only its own rows', () => {
    expect(subjectMonthlyTotals(byMonth, 'משכנתא', categories)[2]).toBe(500.5)
  })

  it('excludes capital rows, credit-card charges and incomes', () => {
    const v = subjectMonthlyTotals({
      1: [
        tx('חיסכון', -300),
        tx('הלוואה/מימון', -40, { isCreditCardCharge: true }),
        tx('הלוואה/מימון', 900),
        tx('הלוואה/מימון', -7),
      ],
    }, 'הלוואה/מימון', categories)
    expect(v[0]).toBe(7)
    expect(subjectMonthlyTotals({ 1: [tx('חיסכון', -300)] }, 'חיסכון', categories)[0]).toBe(0)
    expect(expenseSubject(tx('חיסכון', -300), categories)).toBeNull()
  })
})

describe('yAxisDomain (aglamazo#465)', () => {
  it('scales to this series: top >= its max', () => {
    const [lo, hi] = yAxisDomain([0, 950, 10000])
    expect(lo).toBe(0)
    expect(hi).toBeGreaterThanOrEqual(10000)
    expect(yAxisDomain([0, 950])[1]).toBe(1000)
  })
  it('all zeros / no data -> [0, 1]; nulls ignored', () => {
    expect(yAxisDomain([0, 0])).toEqual([0, 1])
    expect(yAxisDomain([null, null])).toEqual([0, 1])
    expect(yAxisDomain([null, 120])).toEqual([0, 200])
  })
})
