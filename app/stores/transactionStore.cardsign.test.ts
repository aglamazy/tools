import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db } from '@/app/db/financeDB'
import { transactionStore } from './transactionStore'
import { llmCardTransactionToPayment } from '@/app/services/fileImportService'

// aglamazo#452: every card row was stored -Math.abs(amount), so a statement
// credit (refund, זיכוי) landed as an expense. Contract: payments follow the
// statement sign (positive = charge, negative = credit); stored = -amount.

const PAYMENTS = [
  { transactionDate: '2026-10-01', merchant: 'SHOP A', amount: 100, currentStep: 1, totalSteps: 1 },
  { transactionDate: '2026-10-02', merchant: 'SHOP B', amount: 50, currentStep: 1, totalSteps: 1 },
  { transactionDate: '2026-10-03', merchant: 'חבר הצגות', amount: -278, currentStep: 1, totalSteps: 1 },
]

async function cardRows() {
  return db.transactions.where('type').equals('credit').and((t) => t.cardNumber === '1473').toArray()
}

describe('card refund sign (aglamazo#452)', () => {
  beforeEach(async () => {
    await db.transactions.clear()
  })
  afterEach(async () => {
    await db.transactions.clear()
  })

  it('stores a charge negative and a credit positive', async () => {
    const ok = await transactionStore.saveCreditCardData('1473', PAYMENTS, '2026-10-10', '10/2026', 'f1')
    expect(ok).toBe(true)
    const rows = await cardRows()
    const byMerchant = Object.fromEntries(rows.map((r) => [r.merchant, r.amount]))
    expect(byMerchant).toEqual({ 'SHOP A': -100, 'SHOP B': -50, 'חבר הצגות': 278 })
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(128)
  })

  it('dedups a re-import that contains a credit', async () => {
    await transactionStore.saveCreditCardData('1473', PAYMENTS, '2026-10-10', '10/2026', 'f1')
    await transactionStore.saveCreditCardData('1473', PAYMENTS, '2026-10-10', '10/2026', 'f2')
    expect(await cardRows()).toHaveLength(3)
  })

  it('card charge total in the cash-flow summary is the signed net', async () => {
    await transactionStore.saveCreditCardData('1473', PAYMENTS, '2026-10-10', '10/2026', 'f1')
    const { creditCharges } = await transactionStore.getCashFlowData('10/2026')
    const card = creditCharges.find((c) => c.cardNumber === '1473')
    expect(card?.totalAmount).toBe(100 + 50 - 278)
  })
})

describe('llmCardTransactionToPayment (aglamazo#452)', () => {
  it('maps an LLM charge (negative) to a positive payment', () => {
    const p = llmCardTransactionToPayment({ date: '2026-10-01', description: 'SHOP A', amount: -100 })
    expect(p.amount).toBe(100)
    expect(p.totalAmount).toBe(100)
  })

  it('maps an LLM credit (positive) to a negative payment', () => {
    const p = llmCardTransactionToPayment({ date: '2026-10-03', description: 'חבר הצגות', amount: 278 })
    expect(p.amount).toBe(-278)
    expect(p.totalAmount).toBe(-278)
  })
})
