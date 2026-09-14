import { describe, it, expect } from 'vitest'
import { turnoverExVat, btlPaymentMonthFor, resolveBtlPaidForMonth, computeBtlRunningBalance } from './TaxSelfEmployedSections'
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

// aglamazo#384, Sheli/Agla 2026-09-14: "בל״ל ששולם" showed the flat profile
// advance (₪6,013) for every one of 9 months, ignoring that real payments
// stopped after May and a ₪23,744 refund landed in July. Real numbers from
// the ticket: payments 15/02, 12/03, 20/04, 12/05 (₪6,013 each, cash-basis
// months Jan-Apr), 15/06 (₪6,033, for May) = ₪30,085 total; refund 27/07
// (₪23,744, category "החזר ביטוח לאומי").

const btlTx = (month: string, amount: number, category = 'ביטוח לאומי (Yaakov)'): Transaction =>
  ({ date: '', amount, description: '', isFixed: false, month, category }) as Transaction

describe('btlPaymentMonthFor', () => {
  it('a payment for calendar month i shows up the following month', () => {
    expect(btlPaymentMonthFor(0, 2026)).toBe('02/2026') // Jan -> paid Feb
    expect(btlPaymentMonthFor(4, 2026)).toBe('06/2026') // May -> paid Jun
  })

  it('December rolls over into January of the next year', () => {
    expect(btlPaymentMonthFor(11, 2026)).toBe('01/2027')
  })
})

describe('resolveBtlPaidForMonth', () => {
  const payments = [
    btlTx('02/2026', -6013), btlTx('03/2026', -6013), btlTx('04/2026', -6013), btlTx('05/2026', -6013),
    btlTx('06/2026', -6033),
  ]
  const refunds = [btlTx('07/2026', 23744, 'החזר ביטוח לאומי (Yaakov)')]

  it('uses the real payment for a month that has one (the real Jan/Feb-pay case)', () => {
    const result = resolveBtlPaidForMonth({
      payMonth: '02/2026', btlPaymentTx: payments, btlRefundTx: refunds,
      scheduledAmount: 6013, fallbackAmount: 6013,
    })
    expect(result.amount).toBe(6013)
    expect(result.isForecast).toBe(false)
  })

  it('nets a refund against the payMonth it lands in, clamped at zero (the real June case)', () => {
    // June has no BTL payment transaction of its own (per Sheli: "netted
    // against the credit before refunding") but July's payMonth carries the
    // ₪23,744 refund with no matching payment — nets to 0, not negative.
    const result = resolveBtlPaidForMonth({
      payMonth: '07/2026', btlPaymentTx: payments, btlRefundTx: refunds,
      scheduledAmount: 6013, fallbackAmount: 6013,
    })
    expect(result.amount).toBe(0)
    expect(result.isForecast).toBe(false) // a real (zero, refunded) month, not a forecast
  })

  it('falls back to the per-month notice schedule as a labeled forecast when nothing real has landed', () => {
    // Jul-Dec service months (per aglamazo#376's per-month schedule) have no
    // real payment/refund transaction of their own in their payMonth.
    const result = resolveBtlPaidForMonth({
      payMonth: '09/2026', btlPaymentTx: payments, btlRefundTx: refunds,
      scheduledAmount: 1091, fallbackAmount: 6013,
    })
    expect(result.amount).toBe(1091) // schedule rate, not the stale flat ₪6,013
    expect(result.isForecast).toBe(true)
  })

  it('falls back to the flat profile advance only when no schedule entry exists either', () => {
    const result = resolveBtlPaidForMonth({
      payMonth: '09/2026', btlPaymentTx: [], btlRefundTx: [],
      scheduledAmount: undefined, fallbackAmount: 6013,
    })
    expect(result.amount).toBe(6013)
    expect(result.isForecast).toBe(true)
  })

  it('returns zero, not a forecast, when there is nothing real and no forecast source at all', () => {
    const result = resolveBtlPaidForMonth({
      payMonth: '09/2026', btlPaymentTx: [], btlRefundTx: [],
      scheduledAmount: undefined, fallbackAmount: 0,
    })
    expect(result.amount).toBe(0)
    expect(result.isForecast).toBe(false)
  })
})

// aglamazo#391 (supersedes #386's charged-minus-paid-plus-refunded
// definition — Sheli, after #390 established that a month's "charged"
// figure can itself be unreliable/overridden, so it should never enter a
// figure meant to track real money movement): net of what Agla has
// actually put into BTL — payments minus refunds, cumulative, charges never
// enter it. Real 2026 total: ₪30,085 paid − ₪23,744 refunded = ₪6,341,
// matching the income-tax table's own #384 footnote exactly.
describe('computeBtlRunningBalance', () => {
  it('accumulates payments with no refund', () => {
    const balances = computeBtlRunningBalance([{ paid: 6013, refunded: 0 }, { paid: 6013, refunded: 0 }])
    expect(balances).toEqual([6013, 12026])
  })

  it('an unpaid, unrefunded month carries the previous line forward rather than accruing', () => {
    const balances = computeBtlRunningBalance([
      { paid: 6013, refunded: 0 },
      { paid: 0, refunded: 0 }, // nothing happened this month
    ])
    expect(balances).toEqual([6013, 6013])
  })

  it('a refund reduces the running net (the real July case)', () => {
    const balances = computeBtlRunningBalance([
      { paid: 6013, refunded: 0 }, // Jan
      { paid: 6013, refunded: 0 }, // Feb
      { paid: 6013, refunded: 0 }, // Mar
      { paid: 6013, refunded: 0 }, // Apr
      { paid: 6033, refunded: 0 }, // May
      { paid: 0, refunded: 23744 }, // Jun: the refund lands here
    ])
    expect(balances[4]).toBe(30085) // 6013*4 + 6033
    expect(balances[5]).toBe(30085 - 23744) // = 6341, the real annual net
  })

  it('sums to zero across an empty year', () => {
    expect(computeBtlRunningBalance([])).toEqual([])
  })
})
