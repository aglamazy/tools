import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db } from '@/app/db/financeDB'
import { transactionStore } from '@/app/stores/transactionStore'
import { runImportSerially, pendingImports } from './importQueue'

// aglamazo#451: parallel imports bypassed dedup — each read the existing
// rows before the other wrote its own. The queue makes them run one at a time.

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('runImportSerially (aglamazo#451)', () => {
  it('starts the second task only after the first resolved', async () => {
    const log: string[] = []
    const a = runImportSerially(async () => {
      log.push('a:start')
      await delay(20)
      log.push('a:end')
      return 'a'
    })
    const b = runImportSerially(async () => {
      log.push('b:start')
      await delay(1)
      log.push('b:end')
      return 'b'
    })
    expect(pendingImports()).toBe(2)
    expect(await Promise.all([a, b])).toEqual(['a', 'b'])
    expect(log).toEqual(['a:start', 'a:end', 'b:start', 'b:end'])
    await delay(0)
    expect(pendingImports()).toBe(0)
  })

  it('a rejected task does not block the next; the rejection reaches only its caller', async () => {
    const log: string[] = []
    const a = runImportSerially(async () => {
      log.push('a:start')
      await delay(5)
      throw new Error('boom')
    })
    const b = runImportSerially(async () => {
      log.push('b:start')
      return 'b'
    })
    await expect(a).rejects.toThrow('boom')
    await expect(b).resolves.toBe('b')
    expect(log).toEqual(['a:start', 'b:start'])
  })
})

describe('overlapping card imports started together (aglamazo#451)', () => {
  beforeEach(async () => {
    await db.transactions.clear()
  })
  afterEach(async () => {
    await db.transactions.clear()
  })

  it('stores the shared row once: total = A + B - 1', async () => {
    const shared = { transactionDate: '2026-09-07', merchant: 'ועד מקומי בת חפר-חוג', amount: 195 }
    const fileA = [
      { transactionDate: '2026-09-01', merchant: 'SHOP A', amount: 100 },
      shared,
      { transactionDate: '2026-09-10', merchant: 'SHOP B', amount: 50 },
    ]
    const fileB = [
      { ...shared },
      { transactionDate: '2026-10-02', merchant: 'SHOP C', amount: 70 },
    ]

    const results = await Promise.all([
      runImportSerially(() => transactionStore.saveCreditCardData('2075', fileA, '2026-09-15', '09/2026', 'file-a')),
      runImportSerially(() => transactionStore.saveCreditCardData('2075', fileB, '2026-10-15', '10/2026', 'file-b')),
    ])
    expect(results).toEqual([true, true])

    const rows = await db.transactions.where('type').equals('credit').toArray()
    expect(rows).toHaveLength(fileA.length + fileB.length - 1)
    expect(rows.filter((r) => r.date === '2026-09-07' && r.amount === -195)).toHaveLength(1)
  })
})
