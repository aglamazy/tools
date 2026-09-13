import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db } from '@/app/db/financeDB'
import {
  mergeDuplicateSuppliers,
  mergeSupplierEmptyEmailDuplicates,
  deleteCategoryById,
  deleteTransactionById,
  deleteConfirmedDuplicateTransaction,
} from './duplicateCleanupService'

// aglamazo#364/#365, authorized by Agla (oct_message #44942 "go") after
// Sheli's live audit found 1,176 excess Supplier rows from the 2026-07-13/14
// seed race, one non-deductible תשתיות category duplicate, and one stray
// re-import (tx id 2081) created as a side effect of aglamazo#362's false
// import-gap bug.

describe('mergeDuplicateSuppliers', () => {
  beforeEach(async () => {
    await db.suppliers.clear()
  })
  afterEach(async () => {
    await db.suppliers.clear()
  })

  it('collapses exact-duplicate rows, keeping the earliest createdAt', async () => {
    await db.suppliers.bulkAdd([
      { name: 'Vercel', bankCardAliases: ['VERCEL INC.'], emailSenders: [], createdAt: '2026-07-13T10:00:00Z' },
      { name: 'Vercel', bankCardAliases: ['VERCEL INC.'], emailSenders: [], createdAt: '2026-07-13T10:05:00Z' },
      { name: 'Vercel', bankCardAliases: ['VERCEL INC.'], emailSenders: [], createdAt: '2026-07-14T09:00:00Z' },
    ])
    const result = await mergeDuplicateSuppliers()
    expect(result.groupsMerged).toBe(1)
    expect(result.rowsDeleted).toBe(2)
    const remaining = await db.suppliers.toArray()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].createdAt).toBe('2026-07-13T10:00:00Z')
  })

  it('leaves genuinely distinct suppliers untouched', async () => {
    await db.suppliers.bulkAdd([
      { name: 'Vercel', bankCardAliases: ['VERCEL INC.'], emailSenders: [], createdAt: '2026-07-13T10:00:00Z' },
      { name: 'DigitalOcean', bankCardAliases: ['DIGITALOCEAN.COM'], emailSenders: [], createdAt: '2026-07-13T10:00:00Z' },
    ])
    const result = await mergeDuplicateSuppliers()
    expect(result.groupsMerged).toBe(0)
    expect(result.rowsDeleted).toBe(0)
    expect(await db.suppliers.count()).toBe(2)
  })

  it('skips (does not merge) same name+aliases rows that differ in another field', async () => {
    await db.suppliers.bulkAdd([
      { name: 'Vercel', bankCardAliases: ['VERCEL INC.'], emailSenders: [], categoryId: 'custom-1', createdAt: '2026-07-13T10:00:00Z' },
      { name: 'Vercel', bankCardAliases: ['VERCEL INC.'], emailSenders: [], categoryId: 'custom-2', createdAt: '2026-07-13T10:05:00Z' },
    ])
    const result = await mergeDuplicateSuppliers()
    expect(result.groupsMerged).toBe(0)
    expect(result.skippedNonIdentical).toHaveLength(1)
    expect(result.skippedNonIdentical[0].name).toBe('Vercel')
    expect(result.skippedNonIdentical[0].variants).toHaveLength(2)
    expect(result.skippedNonIdentical[0].variants.map((v) => v.categoryId).sort()).toEqual(['custom-1', 'custom-2'])
    expect(await db.suppliers.count()).toBe(2)
  })

  it('ignores bankCardAliases array order when grouping', async () => {
    await db.suppliers.bulkAdd([
      { name: 'X', bankCardAliases: ['A', 'B'], emailSenders: [], createdAt: '2026-07-13T10:00:00Z' },
      { name: 'X', bankCardAliases: ['B', 'A'], emailSenders: [], createdAt: '2026-07-13T10:05:00Z' },
    ])
    const result = await mergeDuplicateSuppliers()
    expect(result.groupsMerged).toBe(1)
    expect(result.rowsDeleted).toBe(1)
  })
})

describe('mergeSupplierEmptyEmailDuplicates', () => {
  beforeEach(async () => {
    await db.suppliers.clear()
  })
  afterEach(async () => {
    await db.suppliers.clear()
  })

  it('keeps the populated-emailSenders copy, drops the empty ones (the ANTHROPIC case)', async () => {
    await db.suppliers.bulkAdd([
      { name: 'ANTHROPIC', bankCardAliases: ['ANTHROPIC'], emailSenders: [], createdAt: '2026-07-13T10:00:00Z' },
      { name: 'ANTHROPIC', bankCardAliases: ['ANTHROPIC'], emailSenders: ['invoice+stat@anthropic.com'], createdAt: '2026-07-13T10:05:00Z' },
      { name: 'ANTHROPIC', bankCardAliases: ['ANTHROPIC'], emailSenders: [], createdAt: '2026-07-14T09:00:00Z' },
    ])
    const result = await mergeSupplierEmptyEmailDuplicates()
    expect(result.groupsMerged).toBe(1)
    expect(result.rowsDeleted).toBe(2)
    const remaining = await db.suppliers.toArray()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].emailSenders).toEqual(['invoice+stat@anthropic.com'])
  })

  it('skips and reports a group where two populated copies genuinely differ', async () => {
    await db.suppliers.bulkAdd([
      { name: 'X', bankCardAliases: ['X'], emailSenders: ['a@x.com'], createdAt: '2026-07-13T10:00:00Z' },
      { name: 'X', bankCardAliases: ['X'], emailSenders: ['b@x.com'], createdAt: '2026-07-13T10:05:00Z' },
      { name: 'X', bankCardAliases: ['X'], emailSenders: [], createdAt: '2026-07-14T09:00:00Z' },
    ])
    const result = await mergeSupplierEmptyEmailDuplicates()
    expect(result.groupsMerged).toBe(0)
    expect(result.skippedAmbiguous).toHaveLength(1)
    expect(await db.suppliers.count()).toBe(3)
  })

  it('leaves a group untouched if categoryId differs (not this rule\'s concern)', async () => {
    await db.suppliers.bulkAdd([
      { name: 'Y', bankCardAliases: ['Y'], emailSenders: [], categoryId: 'custom-1', createdAt: '2026-07-13T10:00:00Z' },
      { name: 'Y', bankCardAliases: ['Y'], emailSenders: ['a@y.com'], categoryId: 'custom-2', createdAt: '2026-07-13T10:05:00Z' },
    ])
    const result = await mergeSupplierEmptyEmailDuplicates()
    expect(result.groupsMerged).toBe(0)
    expect(result.skippedAmbiguous).toHaveLength(0)
    expect(await db.suppliers.count()).toBe(2)
  })

  it('leaves a group with no empty copies alone (already handled by the primary merge)', async () => {
    await db.suppliers.bulkAdd([
      { name: 'Z', bankCardAliases: ['Z'], emailSenders: ['a@z.com'], createdAt: '2026-07-13T10:00:00Z' },
      { name: 'Z', bankCardAliases: ['Z'], emailSenders: ['a@z.com'], createdAt: '2026-07-13T10:05:00Z' },
    ])
    const result = await mergeSupplierEmptyEmailDuplicates()
    expect(result.groupsMerged).toBe(0)
    expect(result.rowsDeleted).toBe(0)
    expect(await db.suppliers.count()).toBe(2)
  })
})

describe('deleteCategoryById', () => {
  beforeEach(async () => {
    await db.subjects.clear()
  })
  afterEach(async () => {
    await db.subjects.clear()
  })

  it('deletes the targeted subject row and returns true', async () => {
    await db.subjects.add({ id: 'custom-1783667477656', name: 'תשתיות', type: 'expense' })
    const ok = await deleteCategoryById('custom-1783667477656')
    expect(ok).toBe(true)
    expect(await db.subjects.get('custom-1783667477656')).toBeUndefined()
  })

  it('returns false for a non-existent id without throwing', async () => {
    const ok = await deleteCategoryById('custom-does-not-exist')
    expect(ok).toBe(false)
  })

  it('leaves an untargeted same-name row alone', async () => {
    await db.subjects.bulkAdd([
      { id: 'custom-1783667477656', name: 'תשתיות', type: 'expense', isDeductible: false } as any,
      { id: 'custom-1783794975843', name: 'תשתיות', type: 'expense', isDeductible: true } as any,
    ])
    await deleteCategoryById('custom-1783667477656')
    const remaining = await db.subjects.get('custom-1783794975843')
    expect(remaining).toBeDefined()
    expect((remaining as any).isDeductible).toBe(true)
  })
})

describe('deleteTransactionById', () => {
  beforeEach(async () => {
    await db.transactions.clear()
  })
  afterEach(async () => {
    await db.transactions.clear()
  })

  it('deletes the targeted transaction and returns true', async () => {
    const id = await db.transactions.add({
      type: 'credit',
      date: '2026-07-13',
      amount: -16.22,
      description: 'DIGITALOCEAN.COM',
      merchant: 'DIGITALOCEAN.COM',
      isFixed: false,
      month: '07/2026',
    } as any)
    const ok = await deleteTransactionById(id as number)
    expect(ok).toBe(true)
    expect(await db.transactions.get(id as number)).toBeUndefined()
  })

  it('returns false for a non-existent id without throwing', async () => {
    const ok = await deleteTransactionById(999999)
    expect(ok).toBe(false)
  })
})

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
