import { db, ProfileQA } from '@/app/db/financeDB'

export const profileQAStore = {
  getByBusinessId: async (businessId: string): Promise<ProfileQA[]> => {
    try {
      return await db.profileQAs.where('businessId').equals(businessId).toArray()
    } catch (error) {
      console.error('Error getting profileQAs by business id:', error)
      return []
    }
  },

  getByTag: async (businessId: string, tag: string): Promise<ProfileQA[]> => {
    try {
      const all = await db.profileQAs.where('businessId').equals(businessId).toArray()
      return all.filter(qa => qa.tags?.includes(tag))
    } catch (error) {
      console.error('Error getting profileQAs by tag:', error)
      return []
    }
  },

  getById: async (id: number): Promise<ProfileQA | undefined> => {
    try {
      return await db.profileQAs.get(id)
    } catch (error) {
      console.error('Error getting profileQA by id:', error)
      return undefined
    }
  },

  add: async (qa: Omit<ProfileQA, 'id' | 'createdAt' | 'updatedAt'>): Promise<number | null> => {
    try {
      const now = new Date().toISOString()
      const id = await db.profileQAs.add({
        ...qa,
        createdAt: now,
        updatedAt: now,
      })
      return id
    } catch (error) {
      console.error('Error adding profileQA:', error)
      return null
    }
  },

  update: async (id: number, updates: Partial<Omit<ProfileQA, 'id' | 'createdAt'>>): Promise<boolean> => {
    try {
      await db.profileQAs.update(id, {
        ...updates,
        updatedAt: new Date().toISOString(),
      })
      return true
    } catch (error) {
      console.error('Error updating profileQA:', error)
      return false
    }
  },

  delete: async (id: number): Promise<boolean> => {
    try {
      await db.profileQAs.delete(id)
      return true
    } catch (error) {
      console.error('Error deleting profileQA:', error)
      return false
    }
  },

  export: async (): Promise<ProfileQA[]> => {
    try {
      return await db.profileQAs.toArray()
    } catch (error) {
      console.error('Error exporting profileQAs:', error)
      return []
    }
  },

  import: async (qas: ProfileQA[]): Promise<boolean> => {
    try {
      await db.profileQAs.clear()
      await db.profileQAs.bulkAdd(qas.map(qa => ({
        ...qa,
        id: undefined,
      })))
      return true
    } catch (error) {
      console.error('Error importing profileQAs:', error)
      return false
    }
  },
}
