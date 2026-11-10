// aglamazo#463: delete one file's importedFiles row(s) through a HOOKED Dexie
// delete, so each row's syncId lands in the deletion ledger (deletedRecords).
// The old page path only reached saveImportedFiles (clear() + bulkAdd) for a
// file with an id, but the page's list (getImportedFiles, built from
// transactions) never has one, so the row was left untouched: no tombstone,
// and a cloud merge kept it alive. Match by fileKey, falling back to fileName.
import { db, type ImportedFile } from '@/app/db/financeDB'

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
