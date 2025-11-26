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

  // Get full history storage object
  getData: (): HistoryStorage => {
    if (typeof window === 'undefined') {
      return { version: '1.0', months: [], lastUpdated: new Date().toISOString() }
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) {
        return { version: '1.0', months: [], lastUpdated: new Date().toISOString() }
      }
      return JSON.parse(raw) as HistoryStorage
    } catch (err) {
      console.error('Error loading history:', err)
      return { version: '1.0', months: [], lastUpdated: new Date().toISOString() }
    }
  },

  // Save a month snapshot
  saveSnapshot: (snapshot: MonthSnapshot) => {
    if (typeof window === 'undefined') return

    const history = historyStore.getData()
    const existingIndex = history.months.findIndex((m) => m.monthYear === snapshot.monthYear)

    if (existingIndex >= 0) {
      history.months[existingIndex] = snapshot
    } else {
      history.months.push(snapshot)
    }

    history.lastUpdated = new Date().toISOString()
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history))
  },
}
