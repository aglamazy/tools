// Business Store - Uses IndexedDB via Dexie

import { db, Business } from '@/app/db/financeDB'
import { appSettingsStore } from './appSettingsStore'
import type { BusinessUI } from '@/app/types/business'
import { generateUniqueSlug } from '@/app/utils/businessSlug'

/** Extract saveable fields from BusinessUI (strips id, createdAt, updatedAt) */
function toSavePayload(biz: BusinessUI): Omit<Business, 'id' | 'createdAt' | 'updatedAt'> {
  const { id: _id, ...rest } = biz
  return rest
}

/**
 * Resolve a slug that doesn't collide with any other business.
 *
 * This is the app-layer replacement for the `&slug` unique index dropped in
 * schema v35 — the DB can no longer reject a duplicate, because doing so
 * inside a cloud-merge transaction aborted the whole merge for what is only
 * a URL convenience field.
 *
 * @param desired  slug to use if free (falls back to deriving from `name`)
 * @param name     source for deriving a base slug when `desired` is empty
 * @param excludeId  business row to ignore when checking (its own current slug)
 */
async function resolveUniqueSlug(desired: string | undefined, name: string, excludeId?: number): Promise<string> {
  const all = await db.businesses.toArray()
  const taken = new Set(
    all.filter((b) => b.id !== excludeId).map((b) => b.slug).filter(Boolean) as string[],
  )
  if (desired && !taken.has(desired)) return desired
  return generateUniqueSlug(desired || name, taken)
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
   * Get business by syncId
   */
  getBySyncId: async (syncId: string): Promise<Business | undefined> => {
    try {
      return await db.businesses.where('syncId').equals(syncId).first()
    } catch (error) {
      console.error('Error getting business by syncId:', error)
      return undefined
    }
  },

  /**
   * Get business by slug
   */
  getBySlug: async (slug: string): Promise<Business | undefined> => {
    try {
      return await db.businesses.where('slug').equals(slug).first()
    } catch (error) {
      console.error('Error getting business by slug:', error)
      return undefined
    }
  },

  /**
   * Add a new business
   */
  add: async (business: Omit<Business, 'id' | 'createdAt' | 'updatedAt'>): Promise<number | null> => {
    try {
      const now = new Date().toISOString()
      // Slug uniqueness is enforced HERE, not by the DB: v35 dropped the
      // unique index because a ConstraintError inside a cloud-merge
      // transaction aborts the entire merge (see schemaVersions.ts v35).
      // Suffix on collision — an explicitly-passed slug gets checked too.
      const slug = await resolveUniqueSlug(business.slug, business.name)
      const id = await db.businesses.add({
        ...business,
        slug,
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
      // Same app-layer uniqueness rule as add() — a manually-edited slug can
      // no longer be rejected by the DB, so resolve it here (excluding this
      // row, so re-saving an unchanged slug is a no-op).
      const patch = { ...updates }
      if (patch.slug) {
        patch.slug = await resolveUniqueSlug(patch.slug, patch.slug, id)
      }
      await db.businesses.update(id, {
        ...patch,
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
