import { db } from '@/app/db/financeDB'
import type { ScoutResult, ScoutResultStatus } from '@/app/types/scoutResult'

export const scoutResultStore = {
  getByBusinessId: async (businessId: number): Promise<ScoutResult[]> => {
    try {
      return await db.scoutResults.where('businessId').equals(businessId).toArray()
    } catch (error) {
      console.error('Error getting scoutResults by business id:', error)
      return []
    }
  },

  getByStatus: async (businessId: number, status: ScoutResultStatus): Promise<ScoutResult[]> => {
    try {
      return await db.scoutResults.where('[businessId+status]').equals([businessId, status]).toArray()
    } catch (error) {
      console.error('Error getting scoutResults by status:', error)
      return []
    }
  },

  getNew: async (businessId: number): Promise<ScoutResult[]> => {
    try {
      return await db.scoutResults.where('[businessId+status]').equals([businessId, 'new']).toArray()
    } catch (error) {
      console.error('Error getting new scoutResults:', error)
      return []
    }
  },

  add: async (result: Omit<ScoutResult, 'id' | 'createdAt' | 'updatedAt'>): Promise<number | null> => {
    try {
      const now = new Date().toISOString()
      const id = await db.scoutResults.add({
        ...result,
        createdAt: now,
        updatedAt: now,
      })
      return id
    } catch (error) {
      console.error('Error adding scoutResult:', error)
      return null
    }
  },

  update: async (id: number, updates: Partial<Omit<ScoutResult, 'id' | 'createdAt'>>): Promise<boolean> => {
    try {
      await db.scoutResults.update(id, {
        ...updates,
        updatedAt: new Date().toISOString(),
      })
      return true
    } catch (error) {
      console.error('Error updating scoutResult:', error)
      return false
    }
  },

  updateStatus: async (id: number, status: ScoutResultStatus): Promise<boolean> => {
    try {
      await db.scoutResults.update(id, {
        status,
        updatedAt: new Date().toISOString(),
      })
      return true
    } catch (error) {
      console.error('Error updating scoutResult status:', error)
      return false
    }
  },

  delete: async (id: number): Promise<boolean> => {
    try {
      await db.scoutResults.delete(id)
      return true
    } catch (error) {
      console.error('Error deleting scoutResult:', error)
      return false
    }
  },

  export: async (): Promise<ScoutResult[]> => {
    try {
      return await db.scoutResults.toArray()
    } catch (error) {
      console.error('Error exporting scoutResults:', error)
      return []
    }
  },

  import: async (results: ScoutResult[]): Promise<boolean> => {
    try {
      await db.scoutResults.clear()
      await db.scoutResults.bulkAdd(results.map(r => ({
        ...r,
        id: undefined,
      })))
      return true
    } catch (error) {
      console.error('Error importing scoutResults:', error)
      return false
    }
  },
}
