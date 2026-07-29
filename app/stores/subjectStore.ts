// Subject Store — categories/subjects from settings, and per-transaction
// classifications. Dexie-backed (db.subjects / db.subjectClassifications) —
// every method is async now. Was localStorage (key `finance-categories`)
// until the 2026-07-11 subject-wipe incident (whole-blob-overwrite sync
// clobbered a richer local set) forced the move to a real synced table with
// per-record merge + a deletion tombstone ledger. See financeDB.ts's
// Subject/SubjectClassification for the storage-layer rationale.

import { db } from '@/app/db/financeDB'
import type { Category, Classification } from '@/app/types/category'

export const subjectStore = {
  // Get all categories from settings
  getAll: async (): Promise<Category[]> => {
    try {
      const rows = await db.subjects.toArray()
      return rows as unknown as Category[]
    } catch (err) {
      console.error('Error loading categories:', err)
      return []
    }
  },

  // Get only expense categories
  getExpenseCategories: async (): Promise<Category[]> => {
    return (await subjectStore.getAll()).filter((cat) => cat.type === 'expense')
  },

  // Get only income categories
  getIncomeCategories: async (): Promise<Category[]> => {
    return (await subjectStore.getAll()).filter((cat) => cat.type === 'income')
  },

  // Get category by id
  getById: async (id: string): Promise<Category | undefined> => {
    const row = await db.subjects.get(id)
    return row as unknown as Category | undefined
  },

  // Get category by name
  getByName: async (name: string): Promise<Category | undefined> => {
    return (await subjectStore.getAll()).find((cat) => cat.name === name)
  },

  // Get all classifications
  getClassifications: async (): Promise<Classification[]> => {
    try {
      const rows = await db.subjectClassifications.toArray()
      return rows as unknown as Classification[]
    } catch (err) {
      console.error('Error loading classifications:', err)
      return []
    }
  },

  // Save a classification — upsert by transactionId (the &transactionId
  // unique index enforces at most one per transaction; put() overwrites the
  // existing row rather than throwing on the constraint).
  saveClassification: async (classification: Classification): Promise<void> => {
    try {
      const existing = await db.subjectClassifications.where('transactionId').equals(classification.transactionId).first()
      if (existing) {
        await db.subjectClassifications.put({ ...classification, id: existing.id })
      } else {
        await db.subjectClassifications.put(classification)
      }
    } catch (err) {
      console.error('Error saving classification:', err)
    }
  },

  // Remove a classification
  removeClassification: async (transactionId: number): Promise<void> => {
    try {
      const existing = await db.subjectClassifications.where('transactionId').equals(transactionId).first()
      if (existing?.id !== undefined) await db.subjectClassifications.delete(existing.id)
    } catch (err) {
      console.error('Error removing classification:', err)
    }
  },

  // Save all categories — full-set replace, matching the caller's own
  // semantics (CategoriesTab always passes the complete updated list). Diffs
  // against what's stored so a category removed from the incoming list is
  // actually deleted (and tombstoned via financeDB's deletion-ledger hook),
  // not just left behind — the old localStorage version never had this
  // deletion tracking at all, which is exactly why per-record sync was needed.
  saveAll: async (categories: Category[]): Promise<void> => {
    try {
      const existing = await db.subjects.toArray()
      const incomingIds = new Set(categories.map((c) => c.id))
      const toDelete = existing.filter((e) => !incomingIds.has(e.id))
      await db.transaction('rw', db.subjects, async () => {
        for (const cat of categories) {
          await db.subjects.put(cat as any)
        }
        for (const del of toDelete) {
          await db.subjects.delete(del.id)
        }
      })
    } catch (err) {
      console.error('Error saving categories:', err)
    }
  },

  // Get raw stored data (categories + classifications together) — used by
  // sharedBusinessSyncService for its own bespoke business-sharing merge.
  getRaw: async (): Promise<{ categories: Category[]; classifications: Classification[] } | null> => {
    try {
      const [categories, classifications] = await Promise.all([
        subjectStore.getAll(),
        subjectStore.getClassifications(),
      ])
      return { categories, classifications }
    } catch (err) {
      console.error('Error loading raw data:', err)
      return null
    }
  },

  // Export store data for backup
  export: async (): Promise<{ categories: Category[]; classifications: Classification[] } | null> => {
    return subjectStore.getRaw()
  },

  // Import store data from backup — retained for the legacy-backup-file
  // compat path in backupService.ts; live CloudSync no longer calls this
  // (subjects/subjectClassifications are handled generically now).
  import: async (
    data: { categories?: Category[]; classifications?: Classification[] } | null,
    opts?: { merge?: boolean },
  ): Promise<void> => {
    try {
      if (!data) return
      if (!opts?.merge) {
        await subjectStore.saveAll(data.categories || [])
        for (const c of data.classifications || []) {
          await subjectStore.saveClassification(c)
        }
        return
      }

      // Union categories by id — a local-only id is always kept. On a shared
      // id, keep whichever side has the later `updatedAt` (incoming wins on a
      // tie/missing timestamp).
      const localCategories = await subjectStore.getAll()
      const catById = new Map<string, Category>()
      for (const c of localCategories) catById.set(c.id, c)
      for (const c of (data.categories || [])) {
        const prev = catById.get(c.id)
        if (!prev || (c.updatedAt || '') >= (prev.updatedAt || '')) {
          catById.set(c.id, c)
        }
      }
      await subjectStore.saveAll(Array.from(catById.values()))

      // Union classifications by transactionId — newest wins.
      for (const x of (data.classifications || [])) {
        const existing = await db.subjectClassifications.where('transactionId').equals(x.transactionId).first()
        if (!existing || new Date(x.classifiedAt || 0) >= new Date(existing.classifiedAt || 0)) {
          await subjectStore.saveClassification(x)
        }
      }
    } catch (err) {
      console.error('Error importing subject store:', err)
    }
  },

  // --- Scope helpers (household | business) ---

  /** Categories with no business scope. */
  getHousehold: async (): Promise<Category[]> =>
    (await subjectStore.getAll()).filter((c) => !c.businessId),

  /** Categories scoped to a specific business. */
  getForBusiness: async (businessId: string): Promise<Category[]> =>
    (await subjectStore.getAll()).filter((c) => c.businessId === businessId),

  /** Wipe — call on logout so the next user can't read stale categories. */
  clear: async (): Promise<void> => {
    try {
      await db.subjects.clear()
      await db.subjectClassifications.clear()
    } catch (err) {
      console.error('Error clearing subject store:', err)
    }
  },
}
