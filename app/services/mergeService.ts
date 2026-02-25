/**
 * Merge Service
 * Merges two BackupData instances (local + cloud) into a single merged result.
 *
 * Per-record merge rules:
 * - Match records by syncId (UUID tables) or natural key (categories, etc.)
 * - If either side has deletedAt → keep the deleted version (deletion wins)
 * - If both exist (neither deleted) → keep the one with latest updatedAt
 * - If only one side has a record → include it
 *
 * FK chain (businesses → projects → harvestTasks → timeEntries):
 * Child records are annotated with their parent's syncId so the apply step
 * can remap FK values to correct local IDs.
 */

import type { BackupData } from './backupService'

/**
 * Merge two backups into one. Neither input is mutated.
 * FK chain child records are annotated with _parentSyncId fields.
 */
export function mergeBackups(local: BackupData, cloud: BackupData): BackupData {
  const merged: BackupData = {
    version: '2.0',
    timestamp: new Date().toISOString(),
    stores: {
      // syncId tables
      transactions: mergeBySyncId(local.stores.transactions, cloud.stores.transactions),
      importedFiles: mergeBySyncId(local.stores.importedFiles, cloud.stores.importedFiles),
      tasks: mergeBySyncId(local.stores.tasks, cloud.stores.tasks),
      businesses: mergeBySyncId(local.stores.businesses, cloud.stores.businesses),
      projects: mergeBySyncId(local.stores.projects, cloud.stores.projects),
      harvestTasks: mergeBySyncId(local.stores.harvestTasks, cloud.stores.harvestTasks),
      timeEntries: mergeBySyncId(local.stores.timeEntries, cloud.stores.timeEntries),
      capitalEntries: mergeBySyncId(local.stores.capitalEntries, cloud.stores.capitalEntries),
      financialInstitutions: mergeBySyncId(local.stores.financialInstitutions, cloud.stores.financialInstitutions),
      vacations: mergeBySyncId(local.stores.vacations, cloud.stores.vacations),

      // Natural-key tables
      categories: mergeByKey(local.stores.categories, cloud.stores.categories, 'name'),
      businessCategories: mergeByKey(local.stores.businessCategories, cloud.stores.businessCategories, 'business'),
      appSettings: mergeByKey(local.stores.appSettings, cloud.stores.appSettings, 'key'),
      ypayDocuments: mergeByKey(local.stores.ypayDocuments, cloud.stores.ypayDocuments, 'transactionId'),

      // localStorage stores
      subjectStore: mergeSubjectStore(local.stores.subjectStore, cloud.stores.subjectStore),
      timerStore: mergeTimerStore(local.stores.timerStore, cloud.stores.timerStore),
    },
  }

  // Annotate FK chain child records with parent syncIds
  annotateFKParentSyncIds(merged.stores, local.stores, cloud.stores)

  return merged
}

/**
 * Annotate FK chain child records with _parentSyncId so the apply step
 * can remap numeric FK values to correct local IDs.
 *
 * FK chain: businesses → projects → harvestTasks → timeEntries
 *
 * A merged record with `id` present came from local (local winner),
 * a merged record with `id` absent came from cloud (cloud winner / cloud-only).
 */
function annotateFKParentSyncIds(
  merged: BackupData['stores'],
  local: BackupData['stores'],
  cloud: BackupData['stores'],
) {
  // Build id→syncId maps from both sources
  const localBusinessMap = buildIdToSyncIdMap(local.businesses)
  const cloudBusinessMap = buildIdToSyncIdMap(cloud.businesses)
  const localProjectMap = buildIdToSyncIdMap(local.projects)
  const cloudProjectMap = buildIdToSyncIdMap(cloud.projects)
  const localTaskMap = buildIdToSyncIdMap(local.harvestTasks)
  const cloudTaskMap = buildIdToSyncIdMap(cloud.harvestTasks)

  // Annotate projects with business syncId
  for (const project of merged.projects ?? []) {
    const sourceMap = project.id != null ? localBusinessMap : cloudBusinessMap
    project._businessSyncId = sourceMap.get(project.businessId) ?? null
  }

  // Annotate harvestTasks with project syncId
  for (const task of merged.harvestTasks ?? []) {
    const sourceMap = task.id != null ? localProjectMap : cloudProjectMap
    task._projectSyncId = sourceMap.get(task.projectId) ?? null
  }

  // Annotate timeEntries with harvestTask syncId
  for (const entry of merged.timeEntries ?? []) {
    const sourceMap = entry.id != null ? localTaskMap : cloudTaskMap
    entry._taskSyncId = sourceMap.get(entry.taskId) ?? null
  }
}

/** Build a map from numeric id → syncId for an array of records */
function buildIdToSyncIdMap(arr: any[] | undefined): Map<number, string> {
  const map = new Map<number, string>()
  for (const r of arr ?? []) {
    if (r.id != null && r.syncId) {
      map.set(r.id, r.syncId)
    }
  }
  return map
}

/**
 * Merge two arrays of records matched by syncId.
 * Records without syncId are included as-is (legacy data).
 */
function mergeBySyncId(localArr: any[] | undefined, cloudArr: any[] | undefined): any[] {
  const local = localArr ?? []
  const cloud = cloudArr ?? []

  const localMap = new Map<string, any>()
  const noSyncId: any[] = []

  for (const r of local) {
    if (r.syncId) {
      localMap.set(r.syncId, r)
    } else {
      noSyncId.push(r)
    }
  }

  const cloudMap = new Map<string, any>()
  for (const r of cloud) {
    if (r.syncId) {
      cloudMap.set(r.syncId, r)
    }
  }

  const allSyncIds = new Set([...localMap.keys(), ...cloudMap.keys()])
  const merged: any[] = []

  for (const syncId of allSyncIds) {
    const l = localMap.get(syncId)
    const c = cloudMap.get(syncId)
    merged.push(pickWinner(l, c))
  }

  // Include local records that never got a syncId (pre-migration data)
  merged.push(...noSyncId)

  return merged
}

/**
 * Merge two arrays of records matched by a natural key field.
 */
function mergeByKey(localArr: any[] | undefined, cloudArr: any[] | undefined, keyField: string): any[] {
  const local = localArr ?? []
  const cloud = cloudArr ?? []

  const localMap = new Map<string, any>()
  for (const r of local) {
    const key = r[keyField]
    if (key != null) localMap.set(String(key), r)
  }

  const cloudMap = new Map<string, any>()
  for (const r of cloud) {
    const key = r[keyField]
    if (key != null) cloudMap.set(String(key), r)
  }

  const allKeys = new Set([...localMap.keys(), ...cloudMap.keys()])
  const merged: any[] = []

  for (const key of allKeys) {
    const l = localMap.get(key)
    const c = cloudMap.get(key)
    merged.push(pickWinner(l, c))
  }

  return merged
}

/**
 * Pick the winning record between local and cloud.
 * - If only one side exists → return it
 * - If either has deletedAt → deletion wins (propagate deletes)
 * - Otherwise → latest updatedAt wins
 */
function pickWinner(local: any | undefined, cloud: any | undefined): any {
  if (!local) return stripId(cloud)
  if (!cloud) return local

  // Deletion wins — propagate soft deletes across devices
  if (local.deletedAt && !cloud.deletedAt) return local
  if (cloud.deletedAt && !local.deletedAt) return stripId(cloud)
  if (local.deletedAt && cloud.deletedAt) {
    // Both deleted — keep the latest deletion timestamp
    return local.deletedAt >= cloud.deletedAt ? local : stripId(cloud)
  }

  // Neither deleted — latest updatedAt wins
  const localTime = local.updatedAt || local.lastUpdated || local.importedAt || local.createdAt || ''
  const cloudTime = cloud.updatedAt || cloud.lastUpdated || cloud.importedAt || cloud.createdAt || ''

  return cloudTime > localTime ? stripId(cloud) : local
}

/**
 * Strip the numeric `id` from a cloud record so it gets a new auto-increment
 * ID when inserted into the local DB. Preserves syncId.
 */
function stripId(record: any): any {
  if (!record) return record
  const { id, ...rest } = record
  return rest
}

/**
 * Merge subjectStore (localStorage-based categories/classifications).
 * The one with the latest lastUpdated wins entirely.
 */
function mergeSubjectStore(local: any, cloud: any): any {
  if (!local) return cloud
  if (!cloud) return local

  const localTime = local.lastUpdated || ''
  const cloudTime = cloud.lastUpdated || ''
  return cloudTime > localTime ? cloud : local
}

/**
 * Merge timerStore (active timer).
 * The one with the latest startedAt wins. If one is null, keep the other.
 */
function mergeTimerStore(local: any, cloud: any): any {
  if (!local) return cloud
  if (!cloud) return local

  const localTime = local.startedAt || ''
  const cloudTime = cloud.startedAt || ''
  return cloudTime > localTime ? cloud : local
}
