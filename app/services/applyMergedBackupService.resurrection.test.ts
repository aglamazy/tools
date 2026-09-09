import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db, type Transaction } from '@/app/db/financeDB'
import { applyCloudBackup } from './applyMergedBackupService'
import type { BackupData } from './backupService'

// Regression test for aglamazo#347/#350, fixed 2026-09-09: a local delete
// only updates the ledger locally -- nothing pushes it to Firestore by
// itself. If a sync cycle (auto-triggered as soon as 3s after a reload)
// pulls the cloud's still-old copy before that push happens, the
// resurrection guard (built 2026-07-22 for a real cross-device data-loss
// incident) saw "cloud still has this record" and un-deleted it -- exactly
// what happened to two of Agla's real income transactions the night this
// was found. Confirmed live: tx 1043 (deleted) came back as 1750.
//
// The fix times each tombstone. A fresh one (this device, hasn't had time
// to push yet) is honored unconditionally; only a tombstone old enough to
// plausibly be a real cross-device conflict still gets overridden -- which
// is the July-22 case this guard exists for, and which this test also
// re-proves is still protected.

function emptyBackup(overrides: Partial<BackupData['stores']> = {}): BackupData {
  return {
    version: 'test',
    timestamp: new Date().toISOString(),
    stores: {
      transactions: [],
      importedFiles: [],
      categories: [],
      businessCategories: [],
      tasks: [],
      appSettings: [],
      businesses: [],
      projects: [],
      harvestTasks: [],
      timeEntries: [],
      capitalEntries: [],
      financialInstitutions: [],
      ypayDocuments: [],
      ...overrides,
    },
  }
}

function makeTx(syncId: string): Transaction {
  return {
    syncId,
    type: 'income',
    date: '2026-03-11',
    amount: 30513.02,
    description: 'זיכוי מיידי 5373920017',
    isFixed: false,
    month: '03/2026',
    importedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    fileId: 'test-file',
  }
}

describe('#347/#350 regression: deletion resurrection race', () => {
  beforeEach(async () => {
    await db.transactions.clear()
    await db.appSettings.clear()
  })

  afterEach(async () => {
    // Let any pending deletion-hook flush (see the note in the first test)
    // finish before clearing, so it can't land mid-clear or leak into the
    // next test's appSettings state.
    await new Promise(resolve => setTimeout(resolve, 50))
    await db.transactions.clear()
    await db.appSettings.clear()
  })

  it('a just-deleted transaction is NOT resurrected when the cloud still has the old copy (the exact bug)', async () => {
    const syncId = 'resurrection-fresh-1'
    const localId = await db.transactions.add(makeTx(syncId))
    // Real delete, through the real Dexie hook -- writes a timestamped tombstone.
    await db.transactions.delete(localId as number)
    // Ledger write is queued via setTimeout(0,...) inside financeDB.ts's
    // deletion hook (a module-level queue, not returned/awaited by
    // db.transactions.delete() itself) -- give it real margin to settle
    // before asserting, and before any other test's appSettings writes can
    // interleave with it (a too-short wait here caused a real, order-
    // dependent ConstraintError from a straggling flush landing mid-test).
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(await db.transactions.where('syncId').equals(syncId).count()).toBe(0)

    // Simulate the race: a sync cycle pulls a cloud snapshot still carrying
    // the record, seconds after the local delete (before any push landed).
    const cloudStillHasIt = emptyBackup({ transactions: [makeTx(syncId)] })
    await applyCloudBackup(cloudStillHasIt)

    const survivors = await db.transactions.where('syncId').equals(syncId).toArray()
    expect(survivors).toHaveLength(0) // must NOT resurrect
  })

  it('an old (pre-fix era / genuinely stale) tombstone still gets overridden by live cloud data (July-22 protection preserved)', async () => {
    const syncId = 'resurrection-stale-1'
    // Seed a legacy-shape (bare string, no timestamp) tombstone directly --
    // this is exactly what today's real ledger already contains for every
    // deletion recorded before this fix shipped.
    await db.appSettings.add({
      key: 'deletedRecords',
      value: { transactions: [syncId] },
      updatedAt: new Date().toISOString(),
    })

    const cloudHasLiveData = emptyBackup({ transactions: [makeTx(syncId)] })
    await applyCloudBackup(cloudHasLiveData)

    const survivors = await db.transactions.where('syncId').equals(syncId).toArray()
    expect(survivors).toHaveLength(1) // guard must still protect a genuinely stale tombstone
  })

  it('a tombstone older than the freshness window is treated as possibly-stale, not trusted forever', async () => {
    const syncId = 'resurrection-old-timestamp-1'
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
    await db.appSettings.add({
      key: 'deletedRecords',
      value: { transactions: [{ syncId, deletedAt: sixtyDaysAgo }] },
      updatedAt: new Date().toISOString(),
    })

    const cloudHasLiveData = emptyBackup({ transactions: [makeTx(syncId)] })
    await applyCloudBackup(cloudHasLiveData)

    const survivors = await db.transactions.where('syncId').equals(syncId).toArray()
    expect(survivors).toHaveLength(1)
  })
})
