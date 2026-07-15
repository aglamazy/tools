// Shared conversion logic for the old localStorage subjectStore blob
// (`{ categories: Category[], classifications: Classification[] }`) into rows
// for the new Dexie `subjects` / `subjectClassifications` tables. Used by both
// the one-time boot migration (migrateLegacyLocalStorageStores.ts) and
// backupService's restore-an-old-backup-file compatibility path — a Drive
// backup taken before this migration shipped still has the old shape.
import type { Subject, SubjectClassification } from '@/app/db/financeDB'

export function convertLegacySubjectStoreBlob(
  blob: { categories?: any[]; classifications?: any[] } | null | undefined,
): { subjects: Subject[]; subjectClassifications: SubjectClassification[] } {
  if (!blob) return { subjects: [], subjectClassifications: [] }

  const subjects: Subject[] = (blob.categories || []).map((c: any) => ({ ...c }))

  // Old classifications carried transactionId as whatever the caller passed
  // (in practice always a number, despite the old string type annotation —
  // see app/types/category.ts). Drop any row that can't resolve to a number;
  // it can't be looked up against transactions.id anyway. The new table
  // enforces &transactionId as unique — dedupe defensively (keep the last
  // entry, matching saveClassification's own "replace existing" semantics)
  // so a pre-existing duplicate in old data can't abort the whole bulkPut.
  const byTransactionId = new Map<number, any>()
  for (const c of blob.classifications || []) {
    const transactionId = Number(c.transactionId)
    if (!Number.isFinite(transactionId)) continue
    byTransactionId.set(transactionId, { ...c, transactionId })
  }
  const subjectClassifications: SubjectClassification[] = Array.from(byTransactionId.values())

  return { subjects, subjectClassifications }
}
