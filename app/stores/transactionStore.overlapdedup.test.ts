import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db } from '@/app/db/financeDB'
import { transactionStore } from './transactionStore'

// aglamazo#375, Sheli 2026-09-14 (Agla: "Good morning, please handle 375"):
// two overlapping bank-statement PDF exports printed the same ₪756.16 קיזוז
// reversal on different days (08-05 vs 08-06) -- the exact-date heuristic
// dedup missed it entirely, landing phantom classified income in the books.

describe('saveBankTransactions overlapping-file near-duplicate (aglamazo#375)', () => {
  beforeEach(async () => {
    await db.transactions.clear()
  })
  afterEach(async () => {
    await db.transactions.clear()
  })

  it('skips the real live קיזוז pair when the second overlapping export disagrees by a day', async () => {
    // First import: Jul1-Aug16 export, includes the reversal on 08-06.
    await transactionStore.saveBankTransactions(
      '08/2026',
      [
        { date: '2026-07-01', amount: 10, description: 'other row A', isFixed: false },
        { date: '2026-08-06', amount: 756.16, description: 'החזרת חיוב עפ הרשאה מסיבות טכניות הום סימיקארד', isFixed: false },
        { date: '2026-08-16', amount: 20, description: 'other row B', isFixed: false },
      ],
      'acc-1',
      'file-jul1-aug16',
    )

    // Second import: overlapping Aug1-Sep7 export, same reversal but dated 08-05.
    const ok = await transactionStore.saveBankTransactions(
      '08/2026',
      [
        { date: '2026-08-01', amount: 30, description: 'other row C', isFixed: false },
        { date: '2026-08-05', amount: 756.16, description: 'החזרת חיוב עפ הרשאה מסיבות טכניות הום סימיקארד', isFixed: false },
        { date: '2026-09-07', amount: 40, description: 'other row D', isFixed: false },
      ],
      'acc-1',
      'file-aug1-sep7',
    )

    expect(ok).toBe(true)
    const reversalRows = await db.transactions.where('type').equals('bank').and((t) => t.amount === 756.16).toArray()
    expect(reversalRows).toHaveLength(1)
    // The other 3 genuinely-unique rows from the second file must still land.
    const allRows = await db.transactions.where('type').equals('bank').toArray()
    expect(allRows).toHaveLength(5)
  })

  it('does NOT merge genuinely separate same-amount/description charges from non-overlapping files (the פנגו case)', async () => {
    await transactionStore.saveBankTransactions(
      '09/2025',
      [{ date: '2025-09-05', amount: -25, description: 'פנגו-חניונים', isFixed: false }],
      'acc-1',
      'file-sep-early',
    )

    const ok = await transactionStore.saveBankTransactions(
      '09/2025',
      [{ date: '2025-09-25', amount: -25, description: 'פנגו-חניונים', isFixed: false }],
      'acc-1',
      'file-sep-late',
    )

    expect(ok).toBe(true)
    const rows = await db.transactions.where('type').equals('bank').toArray()
    expect(rows).toHaveLength(2)
  })
})
