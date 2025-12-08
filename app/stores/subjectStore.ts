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
}
