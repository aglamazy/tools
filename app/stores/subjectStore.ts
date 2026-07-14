// Subject Store - Manages categories/subjects from settings

import type { Category, Classification } from '@/app/types/category'

const STORAGE_KEY = 'finance-categories'

export const subjectStore = {
  // Get all categories from settings
  getAll: (): Category[] => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const data = JSON.parse(stored)
        return data.categories || []
      }
      return []
    } catch (err) {
      console.error('Error loading categories:', err)
      return []
    }
  },

  // Get only expense categories
  getExpenseCategories: (): Category[] => {
    return subjectStore.getAll().filter((cat) => cat.type === 'expense')
  },

  // Get only income categories
  getIncomeCategories: (): Category[] => {
    return subjectStore.getAll().filter((cat) => cat.type === 'income')
  },

  // Get category by id
  getById: (id: string): Category | undefined => {
    return subjectStore.getAll().find((cat) => cat.id === id)
  },

  // Get category by name
  getByName: (name: string): Category | undefined => {
    return subjectStore.getAll().find((cat) => cat.name === name)
  },

  // Get all classifications
  getClassifications: (): Classification[] => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const data = JSON.parse(stored)
        return data.classifications || []
      }
      return []
    } catch (err) {
      console.error('Error loading classifications:', err)
      return []
    }
  },

  // Save a classification
  saveClassification: (classification: Classification) => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      const data = stored ? JSON.parse(stored) : { categories: [], classifications: [] }

      // Remove existing classification for this transaction
      const filtered = (data.classifications || []).filter(
        (c: Classification) => c.transactionId !== classification.transactionId
      )

      // Add new classification
      filtered.push(classification)
      data.classifications = filtered

      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch (err) {
      console.error('Error saving classification:', err)
    }
  },

  // Remove a classification
  removeClassification: (transactionId: string) => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (!stored) return

      const data = JSON.parse(stored)
      data.classifications = (data.classifications || []).filter(
        (c: Classification) => c.transactionId !== transactionId
      )

      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch (err) {
      console.error('Error removing classification:', err)
    }
  },

  // Save all categories
  saveAll: (categories: Category[]): void => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      const data = stored ? JSON.parse(stored) : { categories: [], classifications: [] }
      data.categories = categories
      data.lastUpdated = new Date().toISOString()
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch (err) {
      console.error('Error saving categories:', err)
    }
  },

  // Get raw stored data
  getRaw: (): { categories: Category[]; classifications: Classification[]; lastUpdated?: string } | null => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        return JSON.parse(stored)
      }
      return null
    } catch (err) {
      console.error('Error loading raw data:', err)
      return null
    }
  },

  // Export store data for backup
  export: async (): Promise<any> => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        return JSON.parse(stored)
      }
      return null
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
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
        return
      }

      const stored = localStorage.getItem(STORAGE_KEY)
      const local = stored ? JSON.parse(stored) : {}

      // Union categories by id — a local-only id is always kept. On a shared
      // id, keep whichever side has the later `updatedAt` (incoming wins on a
      // tie/missing timestamp, preserving the old default for pre-fix
      // records) — a blind "incoming always wins" let a stale cloud snapshot
      // silently revert a local edit made moments earlier (e.g. a category
      // checkbox toggled locally, then clobbered by the next sync cycle
      // pulling a cloud copy that predated the edit).
      const catById = new Map<string | number, Category>()
      for (const c of (local.categories || [])) catById.set(c.id, c)
      for (const c of (data.categories || [])) {
        const prev = catById.get(c.id)
        if (!prev || (c.updatedAt || '') >= (prev.updatedAt || '')) {
          catById.set(c.id, c)
        }
      }

      // Union classifications by (transactionId, monthYear) — newest wins.
      const classKey = (x: Classification) => `${x.transactionId}|${x.monthYear}`
      const classByKey = new Map<string, Classification>()
      for (const x of (local.classifications || [])) classByKey.set(classKey(x), x)
      for (const x of (data.classifications || [])) {
        const prev = classByKey.get(classKey(x))
        if (!prev || new Date(x.classifiedAt || 0) >= new Date(prev.classifiedAt || 0)) {
          classByKey.set(classKey(x), x)
        }
      }

      const merged = {
        version: data.version || local.version || '1.0',
        categories: Array.from(catById.values()),
        classifications: Array.from(classByKey.values()),
        lastUpdated: new Date().toISOString(),
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
    } catch (err) {
      console.error('Error importing subject store:', err)
    }
  },

  // --- Scope helpers (household | business) ---

  /** Categories with no business scope. */
  getHousehold: (): Category[] =>
    subjectStore.getAll().filter((c) => !c.businessId),

  /** Categories scoped to a specific business. */
  getForBusiness: (businessId: number): Category[] =>
    subjectStore.getAll().filter((c) => c.businessId === businessId),

  /** Wipe — call on logout so the next user can't read stale categories. */
  clear: (): void => {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch (err) {
      console.error('Error clearing subject store:', err)
    }
  },
}
