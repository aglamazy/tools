// Capital Store - Uses IndexedDB via Dexie

import { db, CapitalEntry } from '@/app/db/financeDB'
import type { PortfolioSnapshot, HoldingKey } from '@/app/types/capital'
import { compareDates } from '@/app/utils/formatters'

export const capitalStore = {
  /**
   * Get all capital entries
   */
  getAll: async (): Promise<CapitalEntry[]> => {
    try {
      return await db.capitalEntries.toArray()
    } catch (error) {
      console.error('Error getting capital entries:', error)
      return []
    }
  },

  /**
   * Get capital entry by id
   */
  getById: async (id: number): Promise<CapitalEntry | undefined> => {
    try {
      return await db.capitalEntries.get(id)
    } catch (error) {
      console.error('Error getting capital entry by id:', error)
      return undefined
    }
  },

  /**
   * Get entries by date range
   */
  getByDateRange: async (startDate: string, endDate: string): Promise<CapitalEntry[]> => {
    try {
      const allEntries = await db.capitalEntries.toArray()
      return allEntries.filter((entry) => {
        return entry.date >= startDate && entry.date <= endDate
      })
    } catch (error) {
      console.error('Error getting entries by date range:', error)
      return []
    }
  },

  /**
   * Get entries by asset type
   */
  getByAssetType: async (assetType: string): Promise<CapitalEntry[]> => {
    try {
      return await db.capitalEntries.where('assetType').equals(assetType).toArray()
    } catch (error) {
      console.error('Error getting entries by asset type:', error)
      return []
    }
  },

  /**
   * Get entries by institution
   */
  getByInstitution: async (institution: string): Promise<CapitalEntry[]> => {
    try {
      return await db.capitalEntries.where('institution').equals(institution).toArray()
    } catch (error) {
      console.error('Error getting entries by institution:', error)
      return []
    }
  },

  /**
   * Get portfolio snapshot as of a specific date
   * For each holding, returns the latest snapshot where date <= targetDate
   * Excludes holdings that were sold before or on targetDate
   */
  getAsOfDate: async (targetDate: string): Promise<PortfolioSnapshot> => {
    try {
      const allEntries = await db.capitalEntries.toArray()

      // Group entries by holding key
      const holdingsMap = new Map<string, CapitalEntry[]>()

      for (const entry of allEntries) {
        const key = getHoldingKeyString(entry.institution, entry.accountNumber || '', entry.description)

        if (!holdingsMap.has(key)) {
          holdingsMap.set(key, [])
        }
        holdingsMap.get(key)!.push(entry)
      }

      // For each holding, get the latest snapshot <= targetDate
      const holdings: CapitalEntry[] = []

      for (const [key, entries] of holdingsMap) {
        // Filter entries up to target date
        const validEntries = entries.filter((e) => compareDates(e.date, targetDate) <= 0)

        if (validEntries.length === 0) continue

        // Sort by date descending and take the latest
        validEntries.sort((a, b) => compareDates(b.date, a.date))
        const latest = validEntries[0]

        // Skip if sold before or on target date
        if (latest.soldDate && compareDates(latest.soldDate, targetDate) <= 0) {
          continue
        }

        holdings.push(latest)
      }

      // Calculate totals by currency
      const totalsByCurrency = {
        ILS: 0,
        USD: 0,
        EUR: 0,
      }

      holdings.forEach((h) => {
        totalsByCurrency[h.currency] += h.amount
      })

      return {
        asOfDate: targetDate,
        holdings,
        totalsByCurrency,
      }
    } catch (error) {
      console.error('Error getting portfolio as of date:', error)
      return {
        asOfDate: targetDate,
        holdings: [],
        totalsByCurrency: { ILS: 0, USD: 0, EUR: 0 },
      }
    }
  },

  /**
   * Get historical snapshots for a specific holding
   */
  getHoldingHistory: async (
    institution: string,
    accountNumber: string,
    description: string
  ): Promise<CapitalEntry[]> => {
    try {
      const allEntries = await db.capitalEntries.toArray()

      const filtered = allEntries.filter(
        (e) =>
          e.institution === institution &&
          (e.accountNumber || '') === accountNumber &&
          e.description === description
      )

      // Sort by date ascending
      filtered.sort((a, b) => compareDates(a.date, b.date))

      return filtered
    } catch (error) {
      console.error('Error getting holding history:', error)
      return []
    }
  },

  /**
   * Add a new capital entry
   */
  add: async (entry: Omit<CapitalEntry, 'id' | 'importedAt'>): Promise<number | null> => {
    try {
      const id = await db.capitalEntries.add({
        ...entry,
        importedAt: new Date().toISOString(),
      })
      return id
    } catch (error) {
      console.error('Error adding capital entry:', error)
      return null
    }
  },

  /**
   * Update an existing capital entry
   */
  update: async (id: number, updates: Partial<Omit<CapitalEntry, 'id' | 'importedAt'>>): Promise<boolean> => {
    try {
      await db.capitalEntries.update(id, updates)
      return true
    } catch (error) {
      console.error('Error updating capital entry:', error)
      return false
    }
  },

  /**
   * Delete a capital entry
   */
  delete: async (id: number): Promise<boolean> => {
    try {
      await db.capitalEntries.delete(id)
      return true
    } catch (error) {
      console.error('Error deleting capital entry:', error)
      return false
    }
  },

  /**
   * Bulk import capital entries (e.g., from Excel)
   */
  bulkImport: async (entries: Omit<CapitalEntry, 'id' | 'importedAt'>[], fileId?: string): Promise<boolean> => {
    try {
      const timestamp = new Date().toISOString()
      const entriesToAdd = entries.map((e) => ({
        ...e,
        importedAt: timestamp,
        fileId: fileId || `import-${timestamp}`,
      }))

      await db.capitalEntries.bulkAdd(entriesToAdd)
      console.log(`✅ Imported ${entriesToAdd.length} capital entries`)
      return true
    } catch (error) {
      console.error('Error bulk importing capital entries:', error)
      return false
    }
  },

  /**
   * Delete entries by fileId
   */
  deleteByFileId: async (fileId: string): Promise<boolean> => {
    try {
      await db.capitalEntries.where('fileId').equals(fileId).delete()
      return true
    } catch (error) {
      console.error('Error deleting entries by fileId:', error)
      return false
    }
  },

  /**
   * Get unique asset types
   */
  getAssetTypes: async (): Promise<string[]> => {
    try {
      const entries = await db.capitalEntries.toArray()
      const types = new Set(entries.map((e) => e.assetType))
      return Array.from(types).sort()
    } catch (error) {
      console.error('Error getting asset types:', error)
      return []
    }
  },

  /**
   * Get unique institutions
   */
  getInstitutions: async (): Promise<string[]> => {
    try {
      const entries = await db.capitalEntries.toArray()
      const institutions = new Set(entries.map((e) => e.institution))
      return Array.from(institutions).sort()
    } catch (error) {
      console.error('Error getting institutions:', error)
      return []
    }
  },

  /**
   * Export all capital entries for backup
   */
  export: async (): Promise<CapitalEntry[]> => {
    try {
      return await db.capitalEntries.toArray()
    } catch (error) {
      console.error('Error exporting capital entries:', error)
      return []
    }
  },

  /**
   * Import capital entries from backup (clears existing data)
   */
  import: async (entries: CapitalEntry[]): Promise<boolean> => {
    try {
      await db.capitalEntries.clear()
      await db.capitalEntries.bulkAdd(
        entries.map((e) => ({
          ...e,
          id: undefined,
        }))
      )
      return true
    } catch (error) {
      console.error('Error importing capital entries:', error)
      return false
    }
  },

  /**
   * Clear all capital entries
   */
  clearAll: async (): Promise<boolean> => {
    try {
      await db.capitalEntries.clear()
      console.log('✅ All capital entries cleared')
      return true
    } catch (error) {
      console.error('Error clearing capital entries:', error)
      return false
    }
  },
}

// Helper function - capital-specific

/**
 * Generate a unique string key for a holding
 */
function getHoldingKeyString(institution: string, accountNumber: string, description: string): string {
  return `${institution}|${accountNumber}|${description}`
}
