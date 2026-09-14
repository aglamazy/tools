import { describe, it, expect } from 'vitest'
import { turnoverExVat } from './TaxSelfEmployedSections'
import type { Transaction } from '@/app/db/financeDB'
import type { TaxProfile } from '@/app/components/TaxProfileSection'

// aglamazo#381, Agla's ruling to Sheli 2026-09-14: "the downpayment is on
// the incomes, not regarding the expense" — a מקדמת מס הכנסה is a
// percentage of turnover (מחזור), never net income, and for an עוסק מורשה
// the turnover excludes VAT collected on the state's behalf. Agla converted
// exempt->authorized on 2026-04-14, so periods straddling that date must
// resolve VAT status PER TRANSACTION (vatTypeForDate), not per month.

const tx = (date: string, amount: number): Transaction =>
  ({ date, amount, type: 'income', description: '', isFixed: false, month: date.slice(5, 7) + '/' + date.slice(0, 4) }) as Transaction

describe('turnoverExVat', () => {
  it('uses the full gross amount for an exempt dealer (no VAT to strip)', () => {
    const profile: TaxProfile = { vatType: 'exempt' }
    const total = turnoverExVat([tx('2026-01-15', 10000), tx('2026-01-20', 5000)], profile)
    expect(total).toBe(15000)
  })

  it('strips VAT for an authorized dealer — turnover is amount / (1 + rate)', () => {
    const profile: TaxProfile = { vatType: 'authorized' }
    // 2026 rate is 18% (VAT_RATE_HISTORY: 2025-01-01 onward)
    const total = turnoverExVat([tx('2026-06-15', 11800)], profile)
    expect(total).toBeCloseTo(10000, 2)
  })

  it('resolves per-transaction across a mid-period exempt->authorized conversion (the real 2026-04-14 case)', () => {
    const profile: TaxProfile = {
      vatType: 'authorized',
      vatConversion: { from: 'exempt', to: 'authorized', effectiveDate: '2026-04-14', recordedAt: '2026-04-14T00:00:00.000Z' },
    }
    // A Mar-Apr bi-monthly period: the March row predates the conversion
    // (exempt, full amount is turnover); the April row is after it
    // (authorized, VAT must be stripped).
    const marRow = tx('2026-03-10', 3000) // exempt -> turnover 3000
    const aprRow = tx('2026-04-20', 3540) // authorized, 18% VAT -> turnover 3000
    const total = turnoverExVat([marRow, aprRow], profile)
    expect(total).toBeCloseTo(6000, 2)
  })

  it('treats an undefined vatType (no profile) as full amount — matches prior no-VAT-info behavior', () => {
    const total = turnoverExVat([tx('2026-01-15', 5000)], undefined)
    expect(total).toBe(5000)
  })

  it('sums to zero for an empty month', () => {
    expect(turnoverExVat([], { vatType: 'authorized' })).toBe(0)
  })
})
