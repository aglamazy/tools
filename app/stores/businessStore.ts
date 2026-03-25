// Business Store - Uses IndexedDB via Dexie

import { db, Business } from '@/app/db/financeDB'
import { appSettingsStore } from './appSettingsStore'
import type { BusinessUI } from '@/app/types/business'

/** Extract saveable fields from BusinessUI (strips id, createdAt, updatedAt) */
function toSavePayload(biz: BusinessUI): Omit<Business, 'id' | 'createdAt' | 'updatedAt'> {
  const { id: _id, ...rest } = biz
  return rest
}

export const businessStore = {
  /**
   * Get all businesses
   */
  getAll: async (): Promise<Business[]> => {
    try {
      return await db.businesses.toArray()
    } catch (error) {
      console.error('Error getting businesses:', error)
      return []
    }
  },

  /**
   * Get business by id
   */
  getById: async (id: number): Promise<Business | undefined> => {
    try {
      return await db.businesses.get(id)
    } catch (error) {
      console.error('Error getting business by id:', error)
      return undefined
    }
  },

  /**
   * Get business by name
   */
  getByName: async (name: string): Promise<Business | undefined> => {
    try {
      return await db.businesses.where('name').equals(name).first()
    } catch (error) {
      console.error('Error getting business by name:', error)
      return undefined
    }
  },

  /**
   * Add a new business
   */
  add: async (business: Omit<Business, 'id' | 'createdAt' | 'updatedAt'>): Promise<number | null> => {
    try {
      const now = new Date().toISOString()
      const id = await db.businesses.add({
        ...business,
        createdAt: now,
        updatedAt: now,
      })
      return id
    } catch (error) {
      console.error('Error adding business:', error)
      return null
    }
  },

  /**
   * Update an existing business
   */
  update: async (id: number, updates: Partial<Omit<Business, 'id' | 'createdAt'>>): Promise<boolean> => {
    try {
      await db.businesses.update(id, {
        ...updates,
        updatedAt: new Date().toISOString(),
      })
      return true
    } catch (error) {
      console.error('Error updating business:', error)
      return false
    }
  },

  /** Save a BusinessUI — add if new, update if existing */
  saveUI: async (biz: BusinessUI, isNew: boolean): Promise<number | null> => {
    const payload = toSavePayload(biz)
    if (isNew) {
      return businessStore.add({ ...payload, pinnedToSidebar: true })
    } else {
      const ok = await businessStore.update(biz.id, payload)
      return ok ? biz.id : null
    }
  },

  /**
   * Delete a business
   */
  delete: async (id: number): Promise<boolean> => {
    try {
      await db.businesses.delete(id)
      return true
    } catch (error) {
      console.error('Error deleting business:', error)
      return false
    }
  },

  /**
   * Export all businesses for backup
   */
  export: async (): Promise<Business[]> => {
    try {
      return await db.businesses.toArray()
    } catch (error) {
      console.error('Error exporting businesses:', error)
      return []
    }
  },

  /**
   * Import businesses from backup
   */
  import: async (businesses: Business[]): Promise<boolean> => {
    try {
      await db.businesses.clear()
      await db.businesses.bulkAdd(businesses.map(b => ({
        ...b,
        id: undefined, // Let Dexie auto-generate IDs
      })))
      return true
    } catch (error) {
      console.error('Error importing businesses:', error)
      return false
    }
  },
}
