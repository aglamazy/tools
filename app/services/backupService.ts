/**
 * Backup and Restore Service
 * Each store exports and imports its own data
 */

import { db } from '@/app/db/financeDB'
import { subjectStore } from '@/app/stores/subjectStore'
import { historyStore } from '@/app/stores/historyStore'

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
    ] = await Promise.all([
      db.transactions.toArray(),
      db.importedFiles.toArray(),
      db.categories.toArray(),
      db.businessCategories.toArray(),
      db.tasks.toArray(),
      db.appSettings.toArray(),
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

    // Clear all IndexedDB tables
    await Promise.all([
      db.transactions.clear(),
      db.importedFiles.clear(),
      db.categories.clear(),
      db.businessCategories.clear(),
      db.tasks.clear(),
      db.appSettings.clear(),
    ])

    // Import IndexedDB data
    if (stores.transactions?.length > 0) {
      await db.transactions.bulkAdd(stores.transactions)
    }
    if (stores.importedFiles?.length > 0) {
      await db.importedFiles.bulkAdd(stores.importedFiles)
    }
    if (stores.categories?.length > 0) {
      await db.categories.bulkAdd(stores.categories)
    }
    if (stores.businessCategories?.length > 0) {
      await db.businessCategories.bulkAdd(stores.businessCategories)
    }
    if (stores.tasks?.length > 0) {
      await db.tasks.bulkAdd(stores.tasks)
    }
    if (stores.appSettings?.length > 0) {
      await db.appSettings.bulkAdd(stores.appSettings)
    }

    // Let stores import their own data
    await Promise.all([
      stores.subjectStore ? subjectStore.import(stores.subjectStore) : Promise.resolve(),
      stores.historyStore ? historyStore.import(stores.historyStore) : Promise.resolve(),
    ])

    console.log('✅ All data restored successfully')
  } catch (error) {
    console.error('Error importing data:', error)
    throw error
  }
}
