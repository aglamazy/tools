/**
 * Backup and Restore Service
 * Each store exports and imports its own data
 */

import { db } from '@/app/db/financeDB'
import { subjectStore } from '@/app/stores/subjectStore'
import { historyStore } from '@/app/stores/historyStore'
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
    // localStorage data
    subjectStore: any
    historyStore: any
  }
}

/**
 * Export all data from all stores
 */
export async function exportAllStores(): Promise<BackupData> {
  try {
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
    ] = await Promise.all([
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
    ])

    // Let stores export their own data
    const [subjectStoreData, historyStoreData] = await Promise.all([
      subjectStore.export(),
      historyStore.export(),
    ])

    return {
      version: '1.0',
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
        subjectStore: subjectStoreData,
        historyStore: historyStoreData,
      },
    }
  } catch (error) {
    console.error('Error exporting data:', error)
    throw error
  }
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
    }
    console.log('[BackupRestore] importing backup', counts)

    if (counts.transactions === 0 || counts.importedFiles === 0) {
      throw new Error('Backup missing core data (transactions/importedFiles)')
    }

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

    // Let stores import their own data
    await Promise.all([
      stores.subjectStore ? subjectStore.import(stores.subjectStore) : Promise.resolve(),
      stores.historyStore ? historyStore.import(stores.historyStore) : Promise.resolve(),
    ])

    // Ensure new settings keys exist even if backup predates them
    await initializeAppSettings()

    console.log('✅ All data restored successfully')
  } catch (error) {
    console.error('Error importing data:', error)
    throw error
  }
}
