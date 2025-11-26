// History Store - Manages month snapshots and history data

import type { MonthSnapshot, HistoryStorage } from '@/app/types/history'

const STORAGE_KEY = 'finance-history'

export const historyStore = {
  // Get all month snapshots from history
  getAll: (): MonthSnapshot[] => {
    if (typeof window === 'undefined') return []
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw) as HistoryStorage
      return parsed.months || []
    } catch (err) {
      console.error('Error loading history:', err)
      return []
    }
  },
}
