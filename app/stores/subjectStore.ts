// Subject Store - Manages categories/subjects from settings

import type { Category } from '@/app/types/category'

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
}
