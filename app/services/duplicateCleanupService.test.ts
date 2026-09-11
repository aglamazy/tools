import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db } from '@/app/db/financeDB'
import { mergeDuplicateSuppliers, deleteCategoryById, deleteTransactionById } from './duplicateCleanupService'

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
