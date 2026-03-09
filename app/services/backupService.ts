/**
 * Backup and Restore Service
 * Each store exports and imports its own data
 *
 * IMPORTANT: Sync is TIER-AGNOSTIC
 * ================================
 * All stores are always backed up and restored regardless of user's current tier.
 * Tier only controls UI visibility (which features user can access), NOT data storage.
 *
 * This ensures:
 * - No data loss when user is downgraded (temporarily or permanently)
 * - Data created at higher tier remains in backup, just hidden in UI
 * - Upgrading tier makes previously hidden data accessible again
 *
 * DO NOT add tier-based filtering to export/import functions.
 */

import { db } from '@/app/db/financeDB'
import { subjectStore } from '@/app/stores/subjectStore'
import { timerStore } from '@/app/stores/timerStore'
import { initializeAppSettings } from '@/app/services/appSettingsService'
import { SYNCED_DB_TABLES } from './syncedTables'


export interface BackupData {
  version: string
  timestamp: string
  stores: {
    // IndexedDB tables
    transactions: any[]
    importedFiles: any[]
    categories: any[]
    businessCategories: any[]
    tasks: any[]
    appSettings: any[]
    businesses: any[]
    projects: any[]
    harvestTasks: any[]
    timeEntries: any[]
    capitalEntries: any[]
    financialInstitutions: any[]
    ypayDocuments: any[]
    taxDocuments?: any[]
    // localStorage data
    subjectStore: any
    timerStore: any
  }
}

/**
 * Export all data from all stores
 */
export async function exportAllStores(): Promise<BackupData> {
  try {
    // Export all synced DB tables (single source of truth: syncedTables.ts)
    const tableArrays = await Promise.all(
      SYNCED_DB_TABLES.map((name) => (db as any)[name].toArray())
    )
    const stores: any = {}
    SYNCED_DB_TABLES.forEach((name, i) => { stores[name] = tableArrays[i] })

    // Let stores export their own data
    const [subjectStoreData, timerStoreData] = await Promise.all([
      subjectStore.export(),
      Promise.resolve(timerStore.export()),
    ])
    stores.subjectStore = subjectStoreData
    stores.timerStore = timerStoreData

    return {
      version: '1.0',
      timestamp: new Date().toISOString(),
      stores,
    }
  } catch (error) {
    console.error('Error exporting data:', error)
    throw error
  }
}

/**
 * Check if local data is empty (no transactions)
 */
export async function isLocalDataEmpty(): Promise<boolean> {
  const count = await db.transactions.count()
  return count === 0
}

/**
 * Import all data from backup
 */
export async function importAllStores(backup: BackupData): Promise<void> {
  try {
    const { stores } = backup

    // Log counts for all synced tables
    const counts: Record<string, number> = {}
    for (const name of SYNCED_DB_TABLES) {
      counts[name] = (stores as any)[name]?.length ?? 0
    }
    console.log('[BackupRestore] importing backup', counts)

    if (counts.transactions === 0 || counts.importedFiles === 0) {
      throw new Error('Backup missing core data (transactions/importedFiles)')
    }

    // Clear and import all synced IndexedDB tables
    // Only clear if backup has data for that table (preserves local data for older backups)
    for (const name of SYNCED_DB_TABLES) {
      const data = (stores as any)[name]
      if (data?.length > 0) {
        await (db as any)[name].clear()
        await (db as any)[name].bulkAdd(data)
      }
    }

    // Let stores import their own data
    await Promise.all([
      stores.subjectStore ? subjectStore.import(stores.subjectStore) : Promise.resolve(),
    ])

    // Import timer (sync, not async)
    timerStore.import(stores.timerStore ?? null)

    // Ensure new settings keys exist even if backup predates them
    await initializeAppSettings()

    console.log('✅ All data restored successfully')
  } catch (error) {
    console.error('Error importing data:', error)
    throw error
  }
}
