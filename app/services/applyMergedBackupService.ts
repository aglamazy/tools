/**
 * Apply Cloud Backup Service
 * Reads incoming cloud records and updates the local DB directly.
 * No intermediate "merged" DB. No clearing tables.
 *
 * For each table:
 * - Cloud record with syncId not in local → insert
 * - Cloud record with syncId in local + newer timestamp → update
 * - Local record with syncId in deletion ledger → delete
 * - Everything else → keep as-is
 *
 * Also handles content-based dedup and FK resolution for cloud-only children.
 */

import { db } from '@/app/db/financeDB'
import { subjectStore } from '@/app/stores/subjectStore'
import { initializeAppSettings } from '@/app/services/appSettingsService'
import type { BackupData } from './backupService'
import { SYNCED_DB_TABLES, getSyncedDexieTables } from './syncedTables'

// Tables that have unique constraints (besides id/syncId)
const UNIQUE_KEY_TABLES: Record<string, string> = {
  businesses: 'name',
  appSettings: 'key',
  businessCategories: 'business',
  ypayDocuments: 'transactionId',
}

// Content-based dedup keys (detect same record imported on two devices with different syncIds)
const CONTENT_KEY_FNS: Record<string, (r: any) => string> = {
  transactions: (r) => `${r.type}|${r.date}|${r.amount}|${r.description}|${r.accountNumber ?? ''}|${r.cardNumber ?? ''}|${r.month}|${r.chargingDate ?? ''}|${r.balance ?? ''}`,
  importedFiles: (r) => `${r.fileName}|${r.fileType}|${r.processingMonth}|${r.accountNumber ?? ''}|${r.cardNumber ?? ''}`,
  capitalEntries: (r) => `${r.date}|${r.institution}|${r.accountNumber}|${r.description}|${r.assetType}`,
  categories: (r) => `${r.name}|${r.type}`,
  tasks: (r) => `${r.title}|${r.createdAt}`,
  taxDocuments: (r) => `${r.businessId}|${r.month}|${r.fileName}`,
}

// Parent→child FK relationships for cloud-only children
const FK_RELATIONS: Record<string, { fkField: string; parentTable: string }> = {
  projects: { fkField: 'businessId', parentTable: 'businesses' },
  harvestTasks: { fkField: 'projectId', parentTable: 'projects' },
  timeEntries: { fkField: 'taskId', parentTable: 'harvestTasks' },
}

function getTimestamp(record: any): string {
  return record.updatedAt || record.importedAt || record.lastUpdated || record.createdAt || ''
}

/**
 * Extract deletion ledger from appSettings array.
 */
function extractDeletionLedger(appSettings: any[]): Record<string, Set<string>> {
  const entry = appSettings.find((s: any) => s.key === 'deletedRecords')
  const ledger: Record<string, Set<string>> = {}
  if (entry?.value) {
    for (const [table, syncIds] of Object.entries(entry.value as Record<string, string[]>)) {
      ledger[table] = new Set(syncIds)
    }
  }
  return ledger
}

/**
 * Apply cloud backup to local DB — incremental, no clearing.
 */
export async function applyCloudBackup(cloud: BackupData): Promise<void> {
  // Combine deletion ledgers from both local and cloud appSettings
  const localAppSettings: any[] = await db.appSettings.toArray()
  const localDeletions = extractDeletionLedger(localAppSettings)
  const cloudDeletions = extractDeletionLedger(cloud.stores.appSettings || [])

  // Union of both ledgers
  const allDeletions: Record<string, Set<string>> = {}
  const allTables = new Set([...Object.keys(localDeletions), ...Object.keys(cloudDeletions)])
  for (const table of allTables) {
    allDeletions[table] = new Set([...(localDeletions[table] || []), ...(cloudDeletions[table] || [])])
  }

  // Track syncId → localId for FK resolution of cloud-only children
  const syncIdToLocalId: Record<string, Map<string, number>> = {}

  // Pre-build cloud id→syncId maps for parent tables (for FK resolution)
  const cloudIdToSyncId: Record<string, Map<number, string>> = {}
  for (const parentTable of Object.values(FK_RELATIONS).map(f => f.parentTable)) {
    const map = new Map<number, string>()
    for (const rec of ((cloud.stores as any)[parentTable] || [])) {
      if (rec.id !== undefined && rec.syncId) map.set(rec.id, rec.syncId)
    }
    cloudIdToSyncId[parentTable] = map
  }

  await db.transaction('rw',
    getSyncedDexieTables(),
    async () => {
      for (const tableName of SYNCED_DB_TABLES) {
        const table = (db as any)[tableName]
        const cloudRecords: any[] = (cloud.stores as any)[tableName] || []
        const deletedSyncIds = allDeletions[tableName] || new Set<string>()

        // Read local state
        const localRecords: any[] = await table.toArray()
        const localBySyncId = new Map<string, any>()
        for (const rec of localRecords) {
          if (rec.syncId) localBySyncId.set(rec.syncId, rec)
        }

        // Build content key map for dedup
        const contentKeyFn = CONTENT_KEY_FNS[tableName]
        const localByContentKey = new Map<string, any>()
        if (contentKeyFn) {
          for (const rec of localRecords) {
            localByContentKey.set(contentKeyFn(rec), rec)
          }
        }

        // Build unique key map for dedup
        const uniqueKeyField = UNIQUE_KEY_TABLES[tableName]
        const localByUniqueKey = new Map<string, any>()
        if (uniqueKeyField) {
          for (const rec of localRecords) {
            const key = rec[uniqueKeyField]
            if (key !== undefined && key !== null) localByUniqueKey.set(String(key), rec)
          }
        }

        // FK resolution map for this table
        const tableIdMap = new Map<string, number>()

        // Register existing local records in FK map
        for (const rec of localRecords) {
          if (rec.syncId && rec.id) tableIdMap.set(rec.syncId, rec.id)
        }

        // 1. Delete local records that are in the deletion ledger
        for (const local of localRecords) {
          if (local.syncId && deletedSyncIds.has(local.syncId)) {
            await table.delete(local.id)
            localBySyncId.delete(local.syncId)
          }
        }

        // 2. Process cloud records: insert new, update if newer
        let inserted = 0, updated = 0, skipped = 0
        for (const cloudRec of cloudRecords) {
          if (!cloudRec.syncId) continue

          // Skip if in deletion ledger
          if (deletedSyncIds.has(cloudRec.syncId)) continue

          // Resolve FK: cloud record's parent ID → local parent ID via syncId
          const fkInfo = FK_RELATIONS[tableName]
          if (fkInfo && cloudRec[fkInfo.fkField] !== undefined) {
            const parentTable = fkInfo.parentTable
            const parentMap = syncIdToLocalId[parentTable]
            const cloudParentMap = cloudIdToSyncId[parentTable]
            if (parentMap && cloudParentMap) {
              const parentSyncId = cloudParentMap.get(cloudRec[fkInfo.fkField])
              if (parentSyncId) {
                const localParentId = parentMap.get(parentSyncId)
                if (localParentId !== undefined) {
                  cloudRec[fkInfo.fkField] = localParentId
                } else {
                  // Parent not found locally — skip this orphan
                  console.warn(`[ApplyCloud] Orphan ${tableName}: parent syncId ${parentSyncId} not in local`)
                  continue
                }
              }
            }
          }

          const existingLocal = localBySyncId.get(cloudRec.syncId)

          if (existingLocal) {
            // Record exists locally — update if cloud is newer
            const cloudTime = getTimestamp(cloudRec)
            const localTime = getTimestamp(existingLocal)
            if (cloudTime > localTime) {
              const { id: _dropId, syncId: _dropSyncId, ...updates } = cloudRec
              await table.update(existingLocal.id, updates)
              updated++
            } else {
              skipped++
            }
            tableIdMap.set(cloudRec.syncId, existingLocal.id)
          } else {
            // Check content dedup — same data, different syncId
            if (contentKeyFn) {
              const contentKey = contentKeyFn(cloudRec)
              const localMatch = localByContentKey.get(contentKey)
              if (localMatch) {
                // Already have this content locally — skip
                if (localMatch.syncId) tableIdMap.set(cloudRec.syncId, localMatch.id)
                skipped++
                continue
              }
            }

            // Check unique key dedup
            if (uniqueKeyField) {
              const keyValue = cloudRec[uniqueKeyField]
              if (keyValue !== undefined && keyValue !== null) {
                const localMatch = localByUniqueKey.get(String(keyValue))
                if (localMatch) {
                  // Same unique key — update if newer, don't duplicate
                  const cloudTime = getTimestamp(cloudRec)
                  const localTime = getTimestamp(localMatch)
                  if (cloudTime > localTime) {
                    const { id: _dropId, syncId: _dropSyncId, ...updates } = cloudRec
                    await table.update(localMatch.id, updates)
                    updated++
                  } else {
                    skipped++
                  }
                  tableIdMap.set(cloudRec.syncId, localMatch.id)
                  continue
                }
              }
            }

            // New record — for auto-increment tables, drop id and let Dexie
            // assign a new one; for string-PK tables (e.g. chats, chatMessages)
            // the id IS the sync key, so preserve it via put().
            if (typeof cloudRec.id === 'string') {
              await table.put(cloudRec)
              tableIdMap.set(cloudRec.syncId, cloudRec.id as unknown as number)
            } else {
              const { id: _dropId, ...withoutId } = cloudRec
              const newId = await table.add(withoutId)
              tableIdMap.set(cloudRec.syncId, newId as number)
            }
            inserted++
          }
        }

        if (inserted > 0 || updated > 0) {
          console.log(`[ApplyCloud] ${tableName}: +${inserted} inserted, ~${updated} updated, =${skipped} skipped`)
        }

        syncIdToLocalId[tableName] = tableIdMap
      }

      // Persist the combined deletion ledger so local-only deletions survive into the next export
      const combinedLedgerValue: Record<string, string[]> = {}
      for (const [table, syncIds] of Object.entries(allDeletions)) {
        if (syncIds.size > 0) {
          combinedLedgerValue[table] = Array.from(syncIds)
        }
      }
      if (Object.keys(combinedLedgerValue).length > 0) {
        const existing = await db.appSettings.where('key').equals('deletedRecords').first()
        if (existing) {
          await db.appSettings.update(existing.id!, { value: combinedLedgerValue, updatedAt: new Date().toISOString() })
        } else {
          await db.appSettings.add({ key: 'deletedRecords', value: combinedLedgerValue, updatedAt: new Date().toISOString() })
        }
      }
    },
  )

  // Import non-DB stores — only if cloud is newer than local
  if (cloud.stores.subjectStore) {
    const cloudUpdated = cloud.stores.subjectStore.lastUpdated
    const local = subjectStore.getRaw()
    const localUpdated = local?.lastUpdated
    if (!localUpdated || !cloudUpdated || new Date(cloudUpdated) > new Date(localUpdated)) {
      await subjectStore.import(cloud.stores.subjectStore)
    }
  }
  // Local timer always wins — don't restore cloud timer (user may have stopped it locally)
  // timerStore is only imported during full restore (importAllStores), not incremental sync

  await initializeAppSettings()
}
