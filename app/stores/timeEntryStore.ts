// Time Entry Store - Uses IndexedDB via Dexie

import { db, TimeEntry } from '@/app/db/financeDB'

export const timeEntryStore = {
  /**
   * Get all time entries
   */
  getAll: async (): Promise<TimeEntry[]> => {
    try {
      return await db.timeEntries.toArray()
    } catch (error) {
      console.error('Error getting time entries:', error)
      return []
    }
  },

  /**
   * Get time entries by task id
   */
  getByTaskId: async (taskId: number): Promise<TimeEntry[]> => {
    try {
      return await db.timeEntries.where('taskId').equals(taskId).toArray()
    } catch (error) {
      console.error('Error getting time entries by task id:', error)
      return []
    }
  },

  /**
   * Get time entries by date
   */
  getByDate: async (date: string): Promise<TimeEntry[]> => {
    try {
      return await db.timeEntries.where('date').equals(date).toArray()
    } catch (error) {
      console.error('Error getting time entries by date:', error)
      return []
    }
  },

  /**
   * Get time entries by date range
   */
  getByDateRange: async (startDate: string, endDate: string): Promise<TimeEntry[]> => {
    try {
      return await db.timeEntries
        .where('date')
        .between(startDate, endDate, true, true)
        .toArray()
    } catch (error) {
      console.error('Error getting time entries by date range:', error)
      return []
    }
  },

  /**
   * Get time entry by id
   */
  getById: async (id: number): Promise<TimeEntry | undefined> => {
    try {
      return await db.timeEntries.get(id)
    } catch (error) {
      console.error('Error getting time entry by id:', error)
      return undefined
    }
  },

  /**
   * Add a new time entry
   */
  add: async (entry: Omit<TimeEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<number | null> => {
    try {
      const now = new Date().toISOString()
      const id = await db.timeEntries.add({
        ...entry,
        createdAt: now,
        updatedAt: now,
      })
      return id
    } catch (error) {
      console.error('Error adding time entry:', error)
      return null
    }
  },

  /**
   * Update an existing time entry
   */
  update: async (id: number, updates: Partial<Omit<TimeEntry, 'id' | 'createdAt'>>): Promise<boolean> => {
    try {
      await db.timeEntries.update(id, {
        ...updates,
        updatedAt: new Date().toISOString(),
      })
      return true
    } catch (error) {
      console.error('Error updating time entry:', error)
      return false
    }
  },

  /**
   * Delete a time entry
   */
  delete: async (id: number): Promise<boolean> => {
    try {
      await db.timeEntries.delete(id)
      return true
    } catch (error) {
      console.error('Error deleting time entry:', error)
      return false
    }
  },

  /**
   * Get total hours by task id
   */
  getTotalHoursByTaskId: async (taskId: number): Promise<number> => {
    try {
      const entries = await db.timeEntries.where('taskId').equals(taskId).toArray()
      return entries.reduce((sum, e) => sum + e.hours, 0)
    } catch (error) {
      console.error('Error getting total hours by task:', error)
      return 0
    }
  },

  /**
   * Get total hours by date range for specific task ids
   */
  getTotalHoursByDateRange: async (startDate: string, endDate: string, taskIds?: number[]): Promise<number> => {
    try {
      let entries = await db.timeEntries
        .where('date')
        .between(startDate, endDate, true, true)
        .toArray()

      if (taskIds && taskIds.length > 0) {
        entries = entries.filter(e => taskIds.includes(e.taskId))
      }

      return entries.reduce((sum, e) => sum + e.hours, 0)
    } catch (error) {
      console.error('Error getting total hours by date range:', error)
      return 0
    }
  },

  /**
   * Export all time entries for backup
   */
  export: async (): Promise<TimeEntry[]> => {
    try {
      return await db.timeEntries.toArray()
    } catch (error) {
      console.error('Error exporting time entries:', error)
      return []
    }
  },

  /**
   * Import time entries from backup
   */
  import: async (entries: TimeEntry[]): Promise<boolean> => {
    try {
      await db.timeEntries.clear()
      await db.timeEntries.bulkAdd(entries.map(e => ({
        ...e,
        id: undefined,
      })))
      return true
    } catch (error) {
      console.error('Error importing time entries:', error)
      return false
    }
  },
}
