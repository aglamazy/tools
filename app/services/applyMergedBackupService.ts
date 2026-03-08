/**
 * Apply Merged Backup Service
 * Takes a merged BackupData (from mergeService) and writes it to the local DB.
 * Handles FK resolution: records with _parentSyncId annotations get their
 * FK fields remapped to the correct local IDs.
 */

import { db } from '@/app/db/financeDB'
import { subjectStore } from '@/app/stores/subjectStore'
import { timerStore } from '@/app/stores/timerStore'
import { initializeAppSettings } from '@/app/services/appSettingsService'
import { type BackupData, readLocalOnlySettings } from './backupService'

// FK annotations → { annotationField, fkField }
const FK_ANNOTATIONS: Record<string, { annotationField: string; fkField: string; parentTable: string }> = {
  projects: { annotationField: '_businessSyncId', fkField: 'businessId', parentTable: 'businesses' },
  harvestTasks: { annotationField: '_projectSyncId', fkField: 'projectId', parentTable: 'projects' },
  timeEntries: { annotationField: '_harvestTaskSyncId', fkField: 'taskId', parentTable: 'harvestTasks' },
}

// Insert order: parents before children
const INSERT_ORDER = [
  'businesses', 'categories', 'appSettings', 'businessCategories',
  'importedFiles', 'transactions', 'tasks', 'financialInstitutions',
  'capitalEntries', 'ypayDocuments',
  'projects', 'harvestTasks', 'timeEntries',
]

/**
 * Apply a merged backup to the local database.
 * Clears all tables, inserts records in FK-safe order,
 * and resolves _parentSyncId annotations to local IDs.
 */
export async function applyMergedBackup(merged: BackupData): Promise<void> {
  // Preserve local-only appSettings (API keys, tokens) before clearing tables
  const preservedLocalOnly = await readLocalOnlySettings()

  // syncId → local id maps, built as we insert parent tables
  const syncIdToLocalId: Record<string, Map<string, number>> = {}

  await db.transaction('rw',
    [db.transactions, db.importedFiles, db.categories, db.businessCategories,
     db.tasks, db.appSettings, db.businesses, db.projects, db.harvestTasks,
     db.timeEntries, db.capitalEntries, db.financialInstitutions, db.ypayDocuments],
    async () => {
      // Clear all tables
      for (const tableName of INSERT_ORDER) {
        await (db as any)[tableName].clear()
      }

      // Insert in order
      for (const tableName of INSERT_ORDER) {
        const records: any[] = (merged.stores as any)[tableName] || []
        if (records.length === 0) continue

        const table = (db as any)[tableName]
        const tableIdMap = new Map<string, number>()

        // Separate: records with id (local) vs without (cloud-only)
        const withId: any[] = []
        const withoutId: any[] = []

        for (const rec of records) {
          // Resolve FK annotations
          const fkInfo = FK_ANNOTATIONS[tableName]
          if (fkInfo && rec[fkInfo.annotationField]) {
            const parentSyncId = rec[fkInfo.annotationField]
            const parentMap = syncIdToLocalId[fkInfo.parentTable]
            const parentLocalId = parentMap?.get(parentSyncId)
            if (parentLocalId !== undefined) {
              rec[fkInfo.fkField] = parentLocalId
            } else {
              // Parent not found — skip this orphan
              console.warn(`[ApplyMerged] Orphan ${tableName} record: parent syncId ${parentSyncId} not found`)
              continue
            }
            delete rec[fkInfo.annotationField]
          }

          if (rec.id !== undefined && rec.id !== null) {
            withId.push(rec)
          } else {
            withoutId.push(rec)
          }
        }

        // Bulk-insert records that have IDs (preserves local IDs)
        if (withId.length > 0) {
          await table.bulkAdd(withId)
          for (const rec of withId) {
            if (rec.syncId) tableIdMap.set(rec.syncId, rec.id)
          }
        }

        // Insert records without IDs one by one (get auto-increment IDs)
        for (const rec of withoutId) {
          const newId = await table.add(rec)
          if (rec.syncId) tableIdMap.set(rec.syncId, newId as number)
        }

        syncIdToLocalId[tableName] = tableIdMap
      }

      // Restore local-only appSettings INSIDE the transaction so it's atomic
      // with the clear+insert — if the transaction fails, everything rolls back.
      for (const setting of preservedLocalOnly) {
        const exists = await db.appSettings.where('key').equals(setting.key).count()
        if (exists === 0) {
          const { id, ...withoutId } = setting
          await db.appSettings.add(withoutId)
          console.log(`[ApplyMerged] Restored local-only key: ${setting.key}`)
        }
      }
    },
  )

  // Import non-DB stores
  if (merged.stores.subjectStore) {
    await subjectStore.import(merged.stores.subjectStore)
  }
  timerStore.import(merged.stores.timerStore ?? null)

  await initializeAppSettings()
  console.log('[ApplyMerged] Merged backup applied successfully')
}
