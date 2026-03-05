import { db } from '@/app/db/financeDB'
import type { ScoutConfig } from '@/app/types/scoutConfig'

export const scoutConfigStore = {
  getByBusinessId: async (businessId: number): Promise<ScoutConfig | undefined> => {
    try {
      return await db.scoutConfigs.where('businessId').equals(businessId).first()
    } catch (error) {
      console.error('Error getting scoutConfig by business id:', error)
      return undefined
    }
  },

  save: async (businessId: number, searchPrompt: string, conversationHistory: ScoutConfig['conversationHistory']): Promise<number | null> => {
    try {
      const existing = await db.scoutConfigs.where('businessId').equals(businessId).first()
      const now = new Date().toISOString()
      if (existing?.id) {
        await db.scoutConfigs.update(existing.id, {
          searchPrompt,
          conversationHistory,
          updatedAt: now,
        })
        return existing.id
      } else {
        return await db.scoutConfigs.add({
          businessId,
          searchPrompt,
          conversationHistory,
          createdAt: now,
          updatedAt: now,
        })
      }
    } catch (error) {
      console.error('Error saving scoutConfig:', error)
      return null
    }
  },

  delete: async (businessId: number): Promise<boolean> => {
    try {
      await db.scoutConfigs.where('businessId').equals(businessId).delete()
      return true
    } catch (error) {
      console.error('Error deleting scoutConfig:', error)
      return false
    }
  },
}
