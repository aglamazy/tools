import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db, type ImportedFile } from '@/app/db/financeDB'
import { applyCloudBackup } from '@/app/services/applyMergedBackupService'
import type { BackupData } from '@/app/services/backupService'
import { deleteImportedFileRows } from './importedFileDeletion'

// aglamazo#463: the import page's file delete used clear()+bulkAdd, which
// was believed to skip Dexie's 'deleting' hook; in fact its id-less list never
// reached that path — either way no importedFiles tombstone was ever written (Agla's ledger: 0 importedFiles entries) and a cloud merge
// could bring the deleted file back.

function file(n: number): ImportedFile {
  return {
    syncId: `if-463-${n}`,
    fileName: `file-${n}.xlsx`,
    fileKey: `key-${n}`,
    fileType: 'bank',
    processingMonth: '10/2026',
    accountNumber: '123',
    transactionCount: 5,
    importedAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
  }
}

function backupWith(importedFiles: ImportedFile[]): BackupData {
  return {
    version: 'test',
    timestamp: new Date().toISOString(),
    stores: {
      transactions: [], importedFiles, categories: [], businessCategories: [], tasks: [],
      appSettings: [], businesses: [], projects: [], harvestTasks: [], timeEntries: [],
      capitalEntries: [], financialInstitutions: [], ypayDocuments: [],
    },
  }
}

const settle = () => new Promise(resolve => setTimeout(resolve, 50))

async function ledgerFor(table: string): Promise<string[]> {
  const s = await db.appSettings.where('key').equals('deletedRecords').first()
  const entries = ((s?.value as Record<string, unknown[]>) || {})[table] || []
  return entries.map(e => (typeof e === 'string' ? e : (e as { syncId: string }).syncId))
}

describe('aglamazo#463: file delete tombstones its importedFiles row', () => {
  beforeEach(async () => {
    await db.importedFiles.clear()
    await db.appSettings.clear()
  })
  afterEach(async () => {
    await settle()
    await db.importedFiles.clear()
    await db.appSettings.clear()
  })

  it('deleting one file of three (by fileKey) leaves 2 rows and tombstones exactly its syncId', async () => {
    await db.importedFiles.bulkAdd([file(1), file(2), file(3)])
    const n = await deleteImportedFileRows({ fileKey: 'key-2' })
    await settle()

    expect(n).toBe(1)
    const rest = await db.importedFiles.toArray()
    expect(rest.map(r => r.syncId).sort()).toEqual(['if-463-1', 'if-463-3'])
    expect(await ledgerFor('importedFiles')).toEqual(['if-463-2'])
  })

  it('deleting by id also tombstones exactly that syncId', async () => {
    await db.importedFiles.bulkAdd([file(1), file(2), file(3)])
    const target = await db.importedFiles.where('syncId').equals('if-463-3').first()
    await deleteImportedFileRows({ id: target!.id })
    await settle()

    expect(await db.importedFiles.count()).toBe(2)
    expect(await ledgerFor('importedFiles')).toEqual(['if-463-3'])
  })

  it('a cloud merge still holding the deleted file does not restore it', async () => {
    await db.importedFiles.bulkAdd([file(1), file(2), file(3)])
    await deleteImportedFileRows({ fileKey: 'key-2' })
    await settle()

    await applyCloudBackup(backupWith([file(1), file(2), file(3)]))

    const rows = await db.importedFiles.toArray()
    expect(rows.map(r => r.syncId).sort()).toEqual(['if-463-1', 'if-463-3'])
  })

  it('an id-less file as the page lists it (from getImportedFiles) still removes and tombstones its row', async () => {
    // The page's list is built from transactions and carries no id, so the old
    // handleDeleteFile took its "inferred file" branch and never touched
    // importedFiles at all — the measured cause of 0 importedFiles tombstones.
    // (Dexie 4.2.1 does fire 'deleting' on clear(); that path was never reached.)
    await db.importedFiles.bulkAdd([file(1), { ...file(2), fileKey: undefined, fileName: 'tx-file-2' }, file(3)])
    await deleteImportedFileRows({ fileKey: 'tx-file-2' })
    await settle()

    expect(await db.importedFiles.count()).toBe(2)
    expect(await ledgerFor('importedFiles')).toEqual(['if-463-2'])
  })
})
