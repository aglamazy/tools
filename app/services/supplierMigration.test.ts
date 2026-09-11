import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db } from '@/app/db/financeDB'
import { seedSuppliersFromTransactions } from './supplierMigration'

// aglamazo#364: the seed used to have a gap between reading the existing
// alias snapshot and writing new supplier rows, letting two overlapping
// runs (two tabs, or two reloads close together) each create the same new
// supplier. Wrapped in one Dexie transaction so the browser's own
// IndexedDB engine serializes overlapping runs.

describe('seedSuppliersFromTransactions', () => {
  beforeEach(async () => {
    await db.suppliers.clear()
    await db.transactions.clear()
  })

  afterEach(async () => {
    await db.suppliers.clear()
    await db.transactions.clear()
  })

  it('creates one supplier per distinct raw merchant/description', async () => {
    await db.transactions.bulkAdd([
      { type: 'credit', date: '2026-06-01', amount: -10, description: 'x', merchant: 'Vercel Inc.', isFixed: false, month: '06/2026' } as any,
      { type: 'bank', date: '2026-06-02', amount: -20, description: 'Electric Co', isFixed: false, month: '06/2026' } as any,
    ])
    const result = await seedSuppliersFromTransactions()
    expect(result.created).toBe(2)
    expect(await db.suppliers.count()).toBe(2)
  })

  it('running it twice in a row does not create duplicates', async () => {
    await db.transactions.bulkAdd([
      { type: 'credit', date: '2026-06-01', amount: -10, description: 'x', merchant: 'Vercel Inc.', isFixed: false, month: '06/2026' } as any,
    ])
    await seedSuppliersFromTransactions()
    const second = await seedSuppliersFromTransactions()
    expect(second.created).toBe(0)
    expect(second.skipped).toBe(1)
    expect(await db.suppliers.count()).toBe(1)
  })

})

// Note: the module-level `inFlight` lock already prevents two calls within
// this same test process from genuinely racing (the second just awaits the
// first's promise), so it can't exercise the cross-tab/cross-reload case
// the Dexie transaction wrap actually fixes -- that needs two separate
// browser tabs, which is out of reach for a unit test. The transaction wrap
// itself is a correct, well-understood IndexedDB guarantee (readwrite
// transactions on the same store serialize across tabs at the engine
// level); this file covers the seed's own correctness, not the race.
