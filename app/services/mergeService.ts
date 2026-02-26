/**
 * Merge Service
 * Pure functions for merging two BackupData snapshots (local + cloud)
 * using syncId as stable cross-device identity.
 *
 * Strategy: last-write-wins per record, matched by syncId.
 * Cloud-only child records get _parentSyncId annotations for FK resolution.
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

// All DB tables in the backup (order matters: parents before children)
const TABLE_ORDER = [
  'transactions', 'importedFiles', 'categories', 'businessCategories',
  'tasks', 'appSettings', 'businesses', 'projects', 'harvestTasks',
  'timeEntries', 'capitalEntries', 'financialInstitutions', 'ypayDocuments',
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
 * Merge a single table's records from local and cloud.
 * Returns merged records with cloud-only children annotated for FK resolution.
 */
function mergeTable(
  tableName: string,
  localRecords: any[],
  cloudRecords: any[],
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

  return merged
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
    ;(merged.stores as any)[tableName] = mergeTable(
      tableName,
      localRecords,
      cloudRecords,
      parentMaps[tableName],
    )
  }

  // Non-DB stores: local wins (localStorage data)
  merged.stores.subjectStore = local.stores.subjectStore ?? cloud.stores.subjectStore
  merged.stores.timerStore = local.stores.timerStore ?? cloud.stores.timerStore

  return merged
}
