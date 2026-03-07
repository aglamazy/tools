/**
 * Merge Service
 * Pure functions for merging two BackupData snapshots (local + cloud)
 * using syncId as stable cross-device identity.
 *
 * Strategy: last-write-wins per record, matched by syncId.
 * Cloud-only child records get _parentSyncId annotations for FK resolution.
 *
 * Additional protections:
 * - Deletion ledger: records explicitly deleted on either device are excluded
 * - Content-based dedup: records with same content but different syncIds are merged
 */

import type { BackupData } from './backupService'

// Tables that have unique constraints (besides id/syncId)
const UNIQUE_KEY_TABLES: Record<string, string> = {
  businesses: 'name',
  appSettings: 'key',
  businessCategories: 'business',
  ypayDocuments: 'transactionId',
}

// Parent→child FK relationships: child table → { fkField, parentTable, annotationField }
const FK_RELATIONS: Record<string, { fkField: string; parentTable: string; annotationField: string }> = {
  projects: { fkField: 'businessId', parentTable: 'businesses', annotationField: '_businessSyncId' },
  harvestTasks: { fkField: 'projectId', parentTable: 'projects', annotationField: '_projectSyncId' },
  timeEntries: { fkField: 'taskId', parentTable: 'harvestTasks', annotationField: '_harvestTaskSyncId' },
}

// Content-based dedup keys for tables without unique constraints.
// Used to detect records with same content but different syncIds (e.g. imported on two devices).
// Excludes id, syncId, fileId (all device-local auto-increment values).
const CONTENT_KEY_FNS: Record<string, (r: any) => string> = {
  transactions: (r) => `${r.type}|${r.date}|${r.amount}|${r.description}|${r.accountNumber ?? ''}|${r.cardNumber ?? ''}|${r.month}`,
  importedFiles: (r) => `${r.fileName}|${r.fileType}|${r.processingMonth}|${r.accountNumber ?? ''}|${r.cardNumber ?? ''}`,
  capitalEntries: (r) => `${r.date}|${r.institution}|${r.accountNumber}|${r.description}|${r.assetType}`,
  categories: (r) => `${r.name}|${r.type}`,
  tasks: (r) => `${r.title}|${r.createdAt}`,
  projects: (r) => `${r.businessId}|${r.name}`,
  harvestTasks: (r) => `${r.projectId}|${r.name}`,
  timeEntries: (r) => `${r.taskId}|${r.date}|${r.startTime}|${r.endTime}|${r.hours}`,
  taxDocuments: (r) => `${r.businessId}|${r.month}|${r.fileName}`,
}

// All DB tables in the backup (order matters: parents before children)
const TABLE_ORDER = [
  'transactions', 'importedFiles', 'categories', 'businessCategories',
  'tasks', 'appSettings', 'businesses', 'projects', 'harvestTasks',
  'timeEntries', 'capitalEntries', 'financialInstitutions', 'ypayDocuments',
  'taxDocuments',
]

function getTimestamp(record: any): string {
  return record.updatedAt || record.importedAt || record.lastUpdated || record.createdAt || ''
}

function pickWinner(local: any, cloud: any): any {
  const localTime = getTimestamp(local)
  const cloudTime = getTimestamp(cloud)
  if (cloudTime > localTime) {
    // Cloud wins: use cloud data but keep local's id and syncId
    return { ...cloud, id: local.id, syncId: local.syncId }
  }
  return local
}

/**
 * Build a syncId→record map from an array of records.
 * Records without syncId are indexed by a fallback key if available.
 */
function buildSyncIdMap(records: any[]): Map<string, any> {
  const map = new Map<string, any>()
  for (const rec of records) {
    if (rec.syncId) {
      map.set(rec.syncId, rec)
    }
  }
  return map
}

/**
 * Build a unique-key→record map for dedup fallback
 */
function buildUniqueKeyMap(records: any[], keyField: string): Map<string, any> {
  const map = new Map<string, any>()
  for (const rec of records) {
    const key = rec[keyField]
    if (key !== undefined && key !== null) {
      map.set(String(key), rec)
    }
  }
  return map
}

/**
 * Build id→syncId map for FK annotation of cloud-only children
 */
function buildIdToSyncIdMap(records: any[]): Map<number, string> {
  const map = new Map<number, string>()
  for (const rec of records) {
    if (rec.id !== undefined && rec.syncId) {
      map.set(rec.id, rec.syncId)
    }
  }
  return map
}

/**
 * Extract the deletion ledger from an appSettings array.
 * Returns a map of tableName → Set of deleted syncIds.
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
 * Combine two deletion ledgers (union of all deleted syncIds per table).
 */
function combineDeletionLedgers(
  a: Record<string, Set<string>>,
  b: Record<string, Set<string>>,
): Record<string, Set<string>> {
  const combined: Record<string, Set<string>> = {}
  const allTables = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const table of allTables) {
    combined[table] = new Set([...(a[table] || []), ...(b[table] || [])])
  }
  return combined
}

/**
 * Content-based dedup pass: removes records with same content but different syncIds.
 * Prefers records that have a local id (not undefined).
 */
function deduplicateByContent(tableName: string, records: any[]): any[] {
  const keyFn = CONTENT_KEY_FNS[tableName]
  if (!keyFn) return records // No content key defined for this table

  const seen = new Map<string, number>() // contentKey → index in result
  const result: any[] = []

  for (const rec of records) {
    const contentKey = keyFn(rec)
    const existingIdx = seen.get(contentKey)

    if (existingIdx === undefined) {
      seen.set(contentKey, result.length)
      result.push(rec)
    } else {
      // Duplicate content — keep the one with a local id
      const existing = result[existingIdx]
      if (existing.id === undefined && rec.id !== undefined) {
        result[existingIdx] = rec
      }
      // Otherwise keep the existing one (first seen / has local id)
    }
  }

  if (result.length < records.length) {
    console.log(`[Merge] Content dedup for ${tableName}: ${records.length} → ${result.length}`)
  }

  return result
}

/**
 * Merge a single table's records from local and cloud.
 * Returns merged records with cloud-only children annotated for FK resolution.
 */
function mergeTable(
  tableName: string,
  localRecords: any[],
  cloudRecords: any[],
  deletedSyncIds: Set<string>,
  cloudParentIdToSyncId?: Map<number, string>,
): any[] {
  const localBySyncId = buildSyncIdMap(localRecords)
  const cloudBySyncId = buildSyncIdMap(cloudRecords)

  // For unique constraint tables, also build unique-key maps
  const uniqueKeyField = UNIQUE_KEY_TABLES[tableName]
  const localByUniqueKey = uniqueKeyField ? buildUniqueKeyMap(localRecords, uniqueKeyField) : null
  const cloudByUniqueKey = uniqueKeyField ? buildUniqueKeyMap(cloudRecords, uniqueKeyField) : null

  const merged: any[] = []
  const processedCloudSyncIds = new Set<string>()
  const processedCloudUniqueKeys = new Set<string>()

  // Process all local records
  for (const local of localRecords) {
    if (!local.syncId) {
      // Old record without syncId — keep as-is
      merged.push(local)
      continue
    }

    // Skip records that were explicitly deleted
    if (deletedSyncIds.has(local.syncId)) continue

    const cloud = cloudBySyncId.get(local.syncId)
    if (cloud) {
      // Same syncId in both — pick winner
      merged.push(pickWinner(local, cloud))
      processedCloudSyncIds.add(local.syncId)
    } else {
      // Only in local — keep
      merged.push(local)
    }
  }

  // Process cloud-only records
  for (const cloud of cloudRecords) {
    if (!cloud.syncId) continue
    if (processedCloudSyncIds.has(cloud.syncId)) continue

    // Skip records that were explicitly deleted
    if (deletedSyncIds.has(cloud.syncId)) continue

    // Check unique constraint fallback: does a local record match by unique key?
    if (uniqueKeyField && localByUniqueKey) {
      const cloudKeyValue = cloud[uniqueKeyField]
      if (cloudKeyValue !== undefined && cloudKeyValue !== null) {
        const localMatch = localByUniqueKey.get(String(cloudKeyValue))
        if (localMatch) {
          // Matched by unique key — merge as same record (local id wins)
          processedCloudUniqueKeys.add(String(cloudKeyValue))
          // Already included via local processing; pick winner
          const idx = merged.findIndex(m => m.id === localMatch.id)
          if (idx >= 0) {
            merged[idx] = pickWinner(localMatch, cloud)
          }
          continue
        }
      }
    }

    // Cloud-only record — include with id stripped, annotate FK
    const newRecord: any = { ...cloud, id: undefined }
    const fkRelation = FK_RELATIONS[tableName]
    if (fkRelation && cloudParentIdToSyncId) {
      const parentLocalId = cloud[fkRelation.fkField]
      const parentSyncId = cloudParentIdToSyncId.get(parentLocalId)
      if (parentSyncId) {
        newRecord[fkRelation.annotationField] = parentSyncId
        newRecord[fkRelation.fkField] = -1 // Placeholder, resolved in apply step
      }
    }
    merged.push(newRecord)
  }

  // Content-based dedup: catch records with same data but different syncIds
  return deduplicateByContent(tableName, merged)
}

/**
 * Merge two backup snapshots.
 * Local records keep their IDs. Cloud-only records get id stripped.
 * Child records from cloud get _parentSyncId annotations.
 */
export function mergeBackups(local: BackupData, cloud: BackupData): BackupData {
  const merged: BackupData = {
    version: local.version || cloud.version || '1.0',
    timestamp: new Date().toISOString(),
    stores: {
      ...local.stores,
    },
  }

  // Extract and combine deletion ledgers from both sides' appSettings
  const localDeletions = extractDeletionLedger(local.stores.appSettings || [])
  const cloudDeletions = extractDeletionLedger(cloud.stores.appSettings || [])
  const allDeletions = combineDeletionLedgers(localDeletions, cloudDeletions)

  // Build cloud parent id→syncId maps for FK resolution
  const cloudBusinessIdToSyncId = buildIdToSyncIdMap(cloud.stores.businesses || [])
  const cloudProjectIdToSyncId = buildIdToSyncIdMap(cloud.stores.projects || [])
  const cloudHarvestTaskIdToSyncId = buildIdToSyncIdMap(cloud.stores.harvestTasks || [])

  const parentMaps: Record<string, Map<number, string>> = {
    projects: cloudBusinessIdToSyncId,
    harvestTasks: cloudProjectIdToSyncId,
    timeEntries: cloudHarvestTaskIdToSyncId,
  }

  // Merge each DB table
  for (const tableName of TABLE_ORDER) {
    const localRecords = (local.stores as any)[tableName] || []
    const cloudRecords = (cloud.stores as any)[tableName] || []
    const deletedSyncIds = allDeletions[tableName] || new Set<string>()
    ;(merged.stores as any)[tableName] = mergeTable(
      tableName,
      localRecords,
      cloudRecords,
      deletedSyncIds,
      parentMaps[tableName],
    )
  }

  // Inject the combined deletion ledger into merged appSettings
  const mergedAppSettings: any[] = (merged.stores as any).appSettings || []
  const existingLedgerIdx = mergedAppSettings.findIndex((s: any) => s.key === 'deletedRecords')
  const combinedLedgerValue: Record<string, string[]> = {}
  for (const [table, syncIds] of Object.entries(allDeletions)) {
    if (syncIds.size > 0) {
      combinedLedgerValue[table] = Array.from(syncIds)
    }
  }
  if (Object.keys(combinedLedgerValue).length > 0) {
    const ledgerRecord = {
      key: 'deletedRecords',
      value: combinedLedgerValue,
      updatedAt: new Date().toISOString(),
      ...(existingLedgerIdx >= 0 ? { id: mergedAppSettings[existingLedgerIdx].id, syncId: mergedAppSettings[existingLedgerIdx].syncId } : {}),
    }
    if (existingLedgerIdx >= 0) {
      mergedAppSettings[existingLedgerIdx] = ledgerRecord
    } else {
      mergedAppSettings.push(ledgerRecord)
    }
  }

  // Non-DB stores: local wins (localStorage data)
  merged.stores.subjectStore = local.stores.subjectStore ?? cloud.stores.subjectStore
  // Local timer always wins — if cleared locally (null), don't restore from cloud
  merged.stores.timerStore = local.stores.timerStore

  return merged
}
