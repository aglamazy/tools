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

import { db, withRawAccess } from '@/app/db/financeDB'
import { subjectStore } from '@/app/stores/subjectStore'
import { timerStore } from '@/app/stores/timerStore'
import { initializeAppSettings } from '@/app/services/appSettingsService'

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
    ypayDocuments: any[]
    capitalEntries: any[]
    financialInstitutions: any[]
    vacations: any[]
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
    // Use rawAccess so soft-deleted records are included in backup
    const [
      transactions,
      importedFiles,
      categories,
      businessCategories,
      tasks,
      appSettings,
      businesses,
      projects,
      harvestTasks,
      timeEntries,
      ypayDocuments,
      capitalEntries,
      financialInstitutions,
      vacations,
    ] = await withRawAccess(() => Promise.all([
      db.transactions.toArray(),
      db.importedFiles.toArray(),
      db.categories.toArray(),
      db.businessCategories.toArray(),
      db.tasks.toArray(),
      db.appSettings.toArray(),
      db.businesses.toArray(),
      db.projects.toArray(),
      db.harvestTasks.toArray(),
      db.timeEntries.toArray(),
      db.ypayDocuments.toArray(),
      db.capitalEntries.toArray(),
      db.financialInstitutions.toArray(),
      db.vacations.toArray(),
    ]))

    // Let stores export their own data
    const [subjectStoreData, timerStoreData] = await Promise.all([
      subjectStore.export(),
      Promise.resolve(timerStore.export()),
    ])

    return {
      version: '2.0',
      timestamp: new Date().toISOString(),
      stores: {
        transactions,
        importedFiles,
        categories,
        businessCategories,
        tasks,
        appSettings,
        businesses,
        projects,
        harvestTasks,
        timeEntries,
        ypayDocuments,
        capitalEntries,
        financialInstitutions,
        vacations,
        subjectStore: subjectStoreData,
        timerStore: timerStoreData,
      },
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

    const counts = {
      transactions: stores.transactions?.length ?? 0,
      importedFiles: stores.importedFiles?.length ?? 0,
      categories: stores.categories?.length ?? 0,
      businessCategories: stores.businessCategories?.length ?? 0,
      tasks: stores.tasks?.length ?? 0,
      appSettings: stores.appSettings?.length ?? 0,
      businesses: stores.businesses?.length ?? 0,
      projects: stores.projects?.length ?? 0,
      harvestTasks: stores.harvestTasks?.length ?? 0,
      timeEntries: stores.timeEntries?.length ?? 0,
      ypayDocuments: stores.ypayDocuments?.length ?? 0,
      capitalEntries: stores.capitalEntries?.length ?? 0,
      financialInstitutions: stores.financialInstitutions?.length ?? 0,
      vacations: stores.vacations?.length ?? 0,
    }
    console.log('[BackupRestore] importing backup', counts)

    if (counts.transactions === 0 || counts.importedFiles === 0) {
      throw new Error('Backup missing core data (transactions/importedFiles)')
    }

    // Use rawAccess so clear() is a real delete and bulkAdd doesn't double-inject syncIds
    await withRawAccess(async () => {
      // Clear and import IndexedDB tables - only clear if backup has data for that table
      // This preserves local data for stores that don't exist in older backups
      if (stores.transactions?.length > 0) {
        await db.transactions.clear()
        await db.transactions.bulkAdd(stores.transactions)
      }
      if (stores.importedFiles?.length > 0) {
        await db.importedFiles.clear()
        await db.importedFiles.bulkAdd(stores.importedFiles)
      }
      if (stores.categories?.length > 0) {
        await db.categories.clear()
        await db.categories.bulkAdd(stores.categories)
      }
      if (stores.businessCategories?.length > 0) {
        await db.businessCategories.clear()
        await db.businessCategories.bulkAdd(stores.businessCategories)
      }
      if (stores.tasks?.length > 0) {
        await db.tasks.clear()
        await db.tasks.bulkAdd(stores.tasks)
      }
      if (stores.appSettings?.length > 0) {
        await db.appSettings.clear()
        await db.appSettings.bulkAdd(stores.appSettings)
      }
      if (stores.businesses?.length > 0) {
        await db.businesses.clear()
        await db.businesses.bulkAdd(stores.businesses)
      }
      if (stores.projects?.length > 0) {
        await db.projects.clear()
        await db.projects.bulkAdd(stores.projects)
      }
      if (stores.harvestTasks?.length > 0) {
        await db.harvestTasks.clear()
        await db.harvestTasks.bulkAdd(stores.harvestTasks)
      }
      if (stores.timeEntries?.length > 0) {
        await db.timeEntries.clear()
        await db.timeEntries.bulkAdd(stores.timeEntries)
      }
      if (stores.ypayDocuments?.length > 0) {
        await db.ypayDocuments.clear()
        await db.ypayDocuments.bulkAdd(stores.ypayDocuments)
      }
      if (stores.capitalEntries?.length > 0) {
        await db.capitalEntries.clear()
        await db.capitalEntries.bulkAdd(stores.capitalEntries)
      }
      if (stores.financialInstitutions?.length > 0) {
        await db.financialInstitutions.clear()
        await db.financialInstitutions.bulkAdd(stores.financialInstitutions)
      }
      if (stores.vacations?.length > 0) {
        await db.vacations.clear()
        await db.vacations.bulkAdd(stores.vacations)
      }
    })

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
