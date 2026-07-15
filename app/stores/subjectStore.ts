// Subject Store - Manages categories/subjects from settings
//
// Dexie-backed (db.subjectCategories / db.subjectClassifications) as of #253
// phase 1 — every method here is now ASYNC. This is intentional: the store is
// the single, isolated place this phase touches; callers move to the async
// API file-by-file in phase 2. readLegacyLocalStorage() is the one exception —
// a read-only escape hatch for the one-time migration (see
// app/services/migrations/migrateLegacyStoresToDexie.ts) to reach the old
// localStorage blob; every other method here is Dexie-only.

import { db } from '@/app/db/financeDB'
import type { Category, Classification } from '@/app/types/category'

const STORAGE_KEY = 'finance-categories'

function stripRowId<T extends { id?: unknown }>(row: T): Omit<T, 'id'> {
  const { id: _id, ...rest } = row
  return rest
}

export const subjectStore = {
  // Read-only escape hatch for the one-time legacy migration — the only
  // place in this store that still touches localStorage.
  readLegacyLocalStorage: (): { categories?: Category[]; classifications?: Classification[] } | null => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return stored ? JSON.parse(stored) : null
    } catch (err) {
      console.error('Error reading legacy subjectStore localStorage:', err)
      return null
    }
  },

  // Get all categories
  getAll: async (): Promise<Category[]> => {
    try {
      return await db.subjectCategories.toArray()
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
    try {
      return await db.subjectCategories.get(id)
    } catch (err) {
      console.error('Error loading category by id:', err)
      return undefined
    }
  },

  // Get category by name
  getByName: async (name: string): Promise<Category | undefined> => {
    try {
      return await db.subjectCategories.where('name').equals(name).first()
    } catch (err) {
      console.error('Error loading category by name:', err)
      return undefined
    }
  },

  // Get all classifications
  getClassifications: async (): Promise<Classification[]> => {
    try {
      const rows = await db.subjectClassifications.toArray()
      return rows.map(stripRowId)
    } catch (err) {
      console.error('Error loading classifications:', err)
      return []
    }
  },

  // Save a classification. Invariant (unchanged from the localStorage version):
  // at most one classification per transactionId — enforced here by deleting
  // any existing row for the transaction before adding the new one, and at the
  // schema level by subjectClassifications' unique `transactionId` index.
  saveClassification: async (classification: Classification): Promise<void> => {
    try {
      await db.transaction('rw', db.subjectClassifications, async () => {
        await db.subjectClassifications.where('transactionId').equals(classification.transactionId).delete()
        await db.subjectClassifications.add(classification)
      })
    } catch (err) {
      console.error('Error saving classification:', err)
    }
  },

  // Remove a classification
  removeClassification: async (transactionId: string): Promise<void> => {
    try {
      await db.subjectClassifications.where('transactionId').equals(transactionId).delete()
    } catch (err) {
      console.error('Error removing classification:', err)
    }
  },

  // Save all categories — full replace, matching the old blob-overwrite
  // semantics: any existing row not present in `categories` is deleted.
  saveAll: async (categories: Category[]): Promise<void> => {
    try {
      await db.transaction('rw', db.subjectCategories, async () => {
        const existingIds = await db.subjectCategories.toCollection().primaryKeys()
        const newIds = new Set(categories.map((c) => c.id))
        const toDelete = existingIds.filter((id) => !newIds.has(id as string))
        if (toDelete.length) await db.subjectCategories.bulkDelete(toDelete)
        if (categories.length) await db.subjectCategories.bulkPut(categories)
      })
    } catch (err) {
      console.error('Error saving categories:', err)
    }
  },

  // Get raw stored data (categories + classifications)
  getRaw: async (): Promise<{ categories: Category[]; classifications: Classification[] }> => {
    try {
      const [categories, classifications] = await Promise.all([
        db.subjectCategories.toArray(),
        subjectStore.getClassifications(),
      ])
      return { categories, classifications }
    } catch (err) {
      console.error('Error loading raw data:', err)
      return { categories: [], classifications: [] }
    }
  },

  // Export store data for backup
  export: async (): Promise<{ categories: Category[]; classifications: Classification[] } | null> => {
    try {
      const raw = await subjectStore.getRaw()
      if (raw.categories.length === 0 && raw.classifications.length === 0) return null
      return raw
    } catch (err) {
      console.error('Error exporting subject store:', err)
      return null
    }
  },

  // Import store data from backup.
  //
  // Two modes:
  //  - full restore (default): overwrite — the user explicitly chose to replace
  //    local state with a backup file, so honor that.
  //  - sync merge (`{ merge: true }`): UNION by id/key so a local-only subject
  //    is NEVER dropped. A blind overwrite here let a thinner remote clobber a
  //    richer local set and wiped every business-scoped subject (data-loss
  //    incident 2026-07-11). Every other synced store merges per-record; this
  //    brings subjectStore in line. Note: without a per-subject deletion ledger
  //    a merge can resurrect a subject deleted on another device — acceptable
  //    for a low-churn store, and far safer than a wipe. A real tombstone
  //    ledger for subjects is the follow-up (generic-store convergence).
  import: async (
    data: { categories?: Category[]; classifications?: Classification[]; version?: string } | null,
    opts?: { merge?: boolean },
  ): Promise<void> => {
    try {
      if (!data) return

      if (!opts?.merge) {
        await db.transaction('rw', db.subjectCategories, db.subjectClassifications, async () => {
          await db.subjectCategories.clear()
          await db.subjectClassifications.clear()
          if (data.categories?.length) await db.subjectCategories.bulkPut(data.categories)
          if (data.classifications?.length) await db.subjectClassifications.bulkPut(data.classifications)
        })
        return
      }

      await db.transaction('rw', db.subjectCategories, db.subjectClassifications, async () => {
        // Union categories by id — a local-only id is always kept. On a shared
        // id, keep whichever side has the later `updatedAt` (incoming wins on a
        // tie/missing timestamp, preserving the old default for pre-fix
        // records) — a blind "incoming always wins" let a stale cloud snapshot
        // silently revert a local edit made moments earlier (e.g. a category
        // checkbox toggled locally, then clobbered by the next sync cycle
        // pulling a cloud copy that predated the edit).
        const localCats = await db.subjectCategories.toArray()
        const catById = new Map<string, Category>()
        for (const c of localCats) catById.set(c.id, c)
        for (const c of (data.categories || [])) {
          const prev = catById.get(c.id)
          if (!prev || (c.updatedAt || '') >= (prev.updatedAt || '')) {
            catById.set(c.id, c)
          }
        }
        await db.subjectCategories.bulkPut(Array.from(catById.values()))

        // Union classifications by transactionId (the table's own unique key —
        // matches saveClassification()'s "one classification per transaction"
        // invariant) — newest `classifiedAt` wins.
        const localClass = await subjectStore.getClassifications()
        const classByTxn = new Map<string, Classification>()
        for (const x of localClass) classByTxn.set(x.transactionId, x)
        for (const x of (data.classifications || [])) {
          const prev = classByTxn.get(x.transactionId)
          if (!prev || new Date(x.classifiedAt || 0) >= new Date(prev.classifiedAt || 0)) {
            classByTxn.set(x.transactionId, x)
          }
        }
        await db.subjectClassifications.clear()
        await db.subjectClassifications.bulkPut(Array.from(classByTxn.values()))
      })
    } catch (err) {
      console.error('Error importing subject store:', err)
    }
  },

  // --- Scope helpers (household | business) ---

  /** Categories with no business scope. */
  getHousehold: async (): Promise<Category[]> =>
    (await subjectStore.getAll()).filter((c) => !c.businessId),

  /** Categories scoped to a specific business. */
  getForBusiness: async (businessId: number): Promise<Category[]> =>
    (await subjectStore.getAll()).filter((c) => c.businessId === businessId),

  /** Wipe — call on logout so the next user can't read stale categories. */
  clear: async (): Promise<void> => {
    try {
      localStorage.removeItem(STORAGE_KEY)
      await Promise.all([db.subjectCategories.clear(), db.subjectClassifications.clear()])
    } catch (err) {
      console.error('Error clearing subject store:', err)
    }
  },
}
