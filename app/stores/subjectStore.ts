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

  // Import store data from backup
  import: async (data: any): Promise<void> => {
    try {
      if (data) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
      }
    } catch (err) {
      console.error('Error importing subject store:', err)
    }
  },

  // --- Scope helpers (household | business | person) ---

  /** Categories with no business or person scope. */
  getHousehold: (): Category[] =>
    subjectStore.getAll().filter((c) => !c.businessId && !c.userId),

  /** Categories scoped to a specific business. */
  getForBusiness: (businessId: number): Category[] =>
    subjectStore.getAll().filter((c) => c.businessId === businessId),

  /** Categories scoped to a specific household member (person). */
  getForUser: (uid: string): Category[] =>
    subjectStore.getAll().filter((c) => c.userId === uid),

  /**
   * Idempotently seed the per-person tax system categories for a member.
   * Safe to call every time the member's tab is opened.
   */
  seedSystemCategoriesForUser: (uid: string): void => {
    const seeds: Array<{ name: string; color: string }> = [
      { name: 'ביטוח לאומי', color: '#60a5fa' },
      { name: 'מקדמות מס הכנסה', color: '#fbbf24' },
    ]
    const all = subjectStore.getAll()
    const existing = new Set(
      all.filter((c) => c.userId === uid && c.system).map((c) => c.name),
    )
    const missing = seeds.filter((s) => !existing.has(s.name))
    if (missing.length === 0) return

    const now = new Date().toISOString()
    const additions: Category[] = missing.map((s) => ({
      id: `system-${uid}-${s.name}`,
      name: s.name,
      type: 'expense',
      color: s.color,
      createdAt: now,
      userId: uid,
      system: true,
    }))
    subjectStore.saveAll([...all, ...additions])
  },
}
