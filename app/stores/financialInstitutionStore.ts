// Financial Institution Store - Uses IndexedDB via Dexie

import { db, FinancialInstitution } from '@/app/db/financeDB'

export const financialInstitutionStore = {
  /**
   * Get all financial institutions
   */
  getAll: async (): Promise<FinancialInstitution[]> => {
    try {
      return await db.financialInstitutions.toArray()
    } catch (error) {
      console.error('Error getting financial institutions:', error)
      return []
    }
  },

  /**
   * Get financial institution by id
   */
  getById: async (id: number): Promise<FinancialInstitution | undefined> => {
    try {
      return await db.financialInstitutions.get(id)
    } catch (error) {
      console.error('Error getting financial institution by id:', error)
      return undefined
    }
  },

  /**
   * Get financial institutions by type
   */
  getByType: async (type: FinancialInstitution['type']): Promise<FinancialInstitution[]> => {
    try {
      return await db.financialInstitutions.where('type').equals(type).toArray()
    } catch (error) {
      console.error('Error getting financial institutions by type:', error)
      return []
    }
  },

  /**
   * Get financial institution by name
   */
  getByName: async (name: string): Promise<FinancialInstitution | undefined> => {
    try {
      const institutions = await db.financialInstitutions.toArray()
      return institutions.find((i) => i.name === name)
    } catch (error) {
      console.error('Error getting financial institution by name:', error)
      return undefined
    }
  },

  /**
   * Add a new financial institution
   */
  add: async (institution: Omit<FinancialInstitution, 'id' | 'createdAt' | 'updatedAt'>): Promise<number | null> => {
    try {
      const now = new Date().toISOString()
      const id = await db.financialInstitutions.add({
        ...institution,
        createdAt: now,
        updatedAt: now,
      })
      return id
    } catch (error) {
      console.error('Error adding financial institution:', error)
      return null
    }
  },

  /**
   * Update an existing financial institution
   */
  update: async (
    id: number,
    updates: Partial<Omit<FinancialInstitution, 'id' | 'createdAt'>>
  ): Promise<boolean> => {
    try {
      await db.financialInstitutions.update(id, {
        ...updates,
        updatedAt: new Date().toISOString(),
      })
      return true
    } catch (error) {
      console.error('Error updating financial institution:', error)
      return false
    }
  },

  /**
   * Delete a financial institution
   */
  delete: async (id: number): Promise<boolean> => {
    try {
      await db.financialInstitutions.delete(id)
      return true
    } catch (error) {
      console.error('Error deleting financial institution:', error)
      return false
    }
  },

  /**
   * Bulk import financial institutions (e.g., from הר הכסף)
   */
  bulkImport: async (institutions: Omit<FinancialInstitution, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<boolean> => {
    try {
      const now = new Date().toISOString()
      const institutionsToAdd = institutions.map((i) => ({
        ...i,
        createdAt: now,
        updatedAt: now,
      }))

      await db.financialInstitutions.bulkAdd(institutionsToAdd)
      console.log(`✅ Imported ${institutionsToAdd.length} financial institutions`)
      return true
    } catch (error) {
      console.error('Error bulk importing financial institutions:', error)
      return false
    }
  },

  /**
   * Export all financial institutions for backup
   */
  export: async (): Promise<FinancialInstitution[]> => {
    try {
      return await db.financialInstitutions.toArray()
    } catch (error) {
      console.error('Error exporting financial institutions:', error)
      return []
    }
  },

  /**
   * Import financial institutions from backup (clears existing data)
   */
  import: async (institutions: FinancialInstitution[]): Promise<boolean> => {
    try {
      await db.financialInstitutions.clear()
      await db.financialInstitutions.bulkAdd(
        institutions.map((i) => ({
          ...i,
          id: undefined,
        }))
      )
      return true
    } catch (error) {
      console.error('Error importing financial institutions:', error)
      return false
    }
  },

  /**
   * Clear all financial institutions
   */
  clearAll: async (): Promise<boolean> => {
    try {
      await db.financialInstitutions.clear()
      console.log('✅ All financial institutions cleared')
      return true
    } catch (error) {
      console.error('Error clearing financial institutions:', error)
      return false
    }
  },
}
