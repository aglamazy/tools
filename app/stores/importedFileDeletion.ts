// aglamazo#463: delete one file's importedFiles row(s) through a HOOKED Dexie
// delete, so each row's syncId lands in the deletion ledger (deletedRecords).
// The old page path only reached saveImportedFiles (clear() + bulkAdd) for a
// file with an id, but the page's list (getImportedFiles, built from
// transactions) never has one, so the row was left untouched: no tombstone,
// and a cloud merge kept it alive. Match by fileKey, falling back to fileName.
import { db, type ImportedFile } from '@/app/db/financeDB'
import { transactionStore } from './transactionStore'

/** Removes the rows of this file only; returns how many were deleted. */
export async function deleteImportedFileRows(file: Pick<ImportedFile, 'id' | 'fileKey'>): Promise<number> {
  if (file.id != null) {
    const exists = await db.importedFiles.get(file.id)
    if (!exists) return 0
    await db.importedFiles.delete(file.id)
    return 1
  }
  const key = file.fileKey
  if (!key) return 0
  // No fileKey index on importedFiles: filter().delete() still fires the hook.
  return db.importedFiles.filter((f) => f.fileKey === key || f.fileName === key).delete()
}

/**
 * Remove one imported file entirely: its transactions, then its importedFiles
 * row(s) (tombstoned). Shared by the import page's delete and by replace=yes.
 */
export async function removeImportedFile(
  file: Pick<ImportedFile, 'id' | 'fileKey' | 'fileType' | 'processingMonth' | 'cardNumber' | 'fileName'>,
): Promise<void> {
  const ok = await transactionStore.deleteTransactionsForFile(
    file.fileType,
    file.processingMonth || '',
    file.cardNumber,
    file.fileKey,
    file.fileName,
  )
  if (!ok) throw new Error(`Could not delete the transactions of "${file.fileName}"`)
  await deleteImportedFileRows(file)
}

/**
 * Replace=yes on the import page (Agla 2026-11-04, msg 104808: "remove the
 * transaction and import from file"). The old file and every one of its
 * transactions go first, so the new file's rows are not deduped away against
 * them (aglamazo#503: the old 79-row file stayed and the new one got 4 rows).
 */
export async function replaceImportedFile<T>(
  existing: Parameters<typeof removeImportedFile>[0],
  importNew: () => Promise<T>,
): Promise<T> {
  await removeImportedFile(existing)
  return importNew()
}
