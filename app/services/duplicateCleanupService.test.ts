import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db } from '@/app/db/financeDB'
import {
  repairConfirmedForeignCurrencyAmount,
  deleteConfirmedDuplicateTransaction,
} from './duplicateCleanupService'

describe('deleteConfirmedDuplicateTransaction', () => {
  beforeEach(async () => {
    await db.transactions.clear()
  })
  afterEach(async () => {
    await db.transactions.clear()
  })

  it('deletes when merchant (substring), amount and fileId all match (the aglamazo#370 case)', async () => {
    const id = await db.transactions.add({
      type: 'bank',
      date: '2026-06-10',
      amount: -517.69,
      description: 'ANTHROPIC* CLAUDE SU',
      merchant: 'ANTHROPIC* CLAUDE SU',
      fileId: '1783794855524-FibiSave1783794113095.xls',
      isFixed: false,
      month: '06/2026',
    } as any)
    const result = await deleteConfirmedDuplicateTransaction(id as number, {
      merchantContains: 'ANTHROPIC* CLAUDE SU',
      amount: -517.69,
      fileId: '1783794855524-FibiSave1783794113095.xls',
    })
    expect(result.deleted).toBe(true)
    expect(await db.transactions.get(id as number)).toBeUndefined()
  })

  it('falls back to description when merchant is empty — the real shape of a bank row (aglamazo#371)', async () => {
    // saveBankTransactions never sets `merchant` on an inserted row — only
    // `description`. Checking `merchant` alone would silently refuse to
    // delete every genuine bank-side duplicate.
    const id = await db.transactions.add({
      type: 'bank',
      date: '2026-03-20',
      amount: -158.40,
      description: 'CP*MACSBAGS -תיקוןSU',
      accountNumber: 'acc-1',
      isFixed: false,
      month: '03/2026',
    } as any)
    const result = await deleteConfirmedDuplicateTransaction(id as number, {
      merchantContains: 'CP*MACSBAGS',
      amount: -158.40,
      date: '2026-03-20',
    })
    expect(result.deleted).toBe(true)
    expect(await db.transactions.get(id as number)).toBeUndefined()
  })

  it('throws if neither date nor fileId is provided', async () => {
    await expect(
      deleteConfirmedDuplicateTransaction(1, { merchantContains: 'x', amount: -1 } as any)
    ).rejects.toThrow(/requires at least one/)
  })

  it('refuses and explains when the amount no longer matches', async () => {
    const id = await db.transactions.add({
      type: 'bank',
      date: '2026-06-10',
      amount: -999,
      description: 'ANTHROPIC* CLAUDE SU',
      merchant: 'ANTHROPIC* CLAUDE SU',
      fileId: 'file-a',
      isFixed: false,
      month: '06/2026',
    } as any)
    const result = await deleteConfirmedDuplicateTransaction(id as number, {
      merchantContains: 'ANTHROPIC* CLAUDE SU',
      amount: -517.69,
      fileId: 'file-a',
    })
    expect(result.deleted).toBe(false)
    expect(result.reason).toContain('amount')
    expect(await db.transactions.get(id as number)).toBeDefined()
  })

  it('refuses when the fileId no longer matches', async () => {
    const id = await db.transactions.add({
      type: 'bank',
      date: '2026-06-10',
      amount: -517.69,
      description: 'ANTHROPIC* CLAUDE SU',
      merchant: 'ANTHROPIC* CLAUDE SU',
      fileId: 'a-different-file.xls',
      isFixed: false,
      month: '06/2026',
    } as any)
    const result = await deleteConfirmedDuplicateTransaction(id as number, {
      merchantContains: 'ANTHROPIC* CLAUDE SU',
      amount: -517.69,
      fileId: 'file-a',
    })
    expect(result.deleted).toBe(false)
    expect(result.reason).toContain('fileId')
  })

  it('returns not-found for a non-existent id without throwing', async () => {
    const result = await deleteConfirmedDuplicateTransaction(999999, {
      merchantContains: 'x',
      amount: -1,
      fileId: 'x',
    })
    expect(result.deleted).toBe(false)
    expect(result.reason).toContain('not found')
  })
})

// aglamazo#372, Agla 2026-09-14: two ANTHROPIC CLAUDE SUB rows were imported
// at their USD amount (-200.00) instead of the real NIS billing amount —
// root cause fixed in pdfExtractionRows.ts/extract-pdf-statement/
// extract-xls-statement (see pdfExtractionRows.test.ts); this repairs the
// two rows that were already imported wrong before that fix.
describe('repairConfirmedForeignCurrencyAmount', () => {
  beforeEach(async () => {
    await db.transactions.clear()
  })
  afterEach(async () => {
    await db.transactions.clear()
  })

  it('repairs tx 1823 (07/2026 charge, confirmed real amount ₪607.21 from 1473_08_2026.xlsx row 79)', async () => {
    const id = await db.transactions.add({
      type: 'credit',
      date: '2026-07-09',
      amount: -200,
      description: 'ANTHROPIC* CLAUDE SUB',
      merchant: 'ANTHROPIC* CLAUDE SUB',
      chargingDate: '10/08/2026',
      isFixed: false,
      month: '08/2026',
    } as any)
    const result = await repairConfirmedForeignCurrencyAmount(
      id as number,
      { merchantContains: 'ANTHROPIC* CLAUDE SUB', currentAmount: -200, date: '2026-07-09' },
      -607.21,
    )
    expect(result.repaired).toBe(true)
    const stored = await db.transactions.get(id as number)
    expect(stored?.amount).toBe(-607.21)
  })

  it('refuses and explains when the amount no longer matches (row already fixed or changed)', async () => {
    const id = await db.transactions.add({
      type: 'credit',
      date: '2026-07-09',
      amount: -607.21,
      description: 'ANTHROPIC* CLAUDE SUB',
      merchant: 'ANTHROPIC* CLAUDE SUB',
      isFixed: false,
      month: '08/2026',
    } as any)
    const result = await repairConfirmedForeignCurrencyAmount(
      id as number,
      { merchantContains: 'ANTHROPIC* CLAUDE SUB', currentAmount: -200, date: '2026-07-09' },
      -607.21,
    )
    expect(result.repaired).toBe(false)
    expect(result.reason).toContain('amount')
    const stored = await db.transactions.get(id as number)
    expect(stored?.amount).toBe(-607.21) // untouched
  })

  it('returns not-found for a non-existent id without throwing', async () => {
    const result = await repairConfirmedForeignCurrencyAmount(
      999999,
      { merchantContains: 'x', currentAmount: -1, date: '2026-01-01' },
      -1,
    )
    expect(result.repaired).toBe(false)
    expect(result.reason).toContain('not found')
  })
})
