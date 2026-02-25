/**
 * Apply Merged Backup Service
 * Applies a merged BackupData to the local IndexedDB in-place.
 *
 * Instead of clear-and-reimport, this:
 * - Updates existing records if merged version is newer
 * - Inserts new records (from the other device)
 * - Propagates soft deletes
 * - Remaps FK chain IDs (businesses → projects → harvestTasks → timeEntries)
 *
 * Uses rawAccess to bypass the middleware (we handle syncId/deletedAt ourselves).
 */

import { db, withRawAccess } from '@/app/db/financeDB'
import { subjectStore } from '@/app/stores/subjectStore'
import { timerStore } from '@/app/stores/timerStore'
import type { BackupData } from './backupService'

/**
 * Apply merged backup to local DB in-place.
 * Records are matched by syncId (or natural key) and updated/inserted as needed.
 */
export async function applyMergedBackup(merged: BackupData): Promise<void> {
  await withRawAccess(async () => {
    // --- Non-FK tables: simple syncId/natural-key matching ---
    await applySyncIdTable(db.transactions, merged.stores.transactions)
    await applySyncIdTable(db.importedFiles, merged.stores.importedFiles)
    await applySyncIdTable(db.tasks, merged.stores.tasks)
    await applySyncIdTable(db.capitalEntries, merged.stores.capitalEntries)
    await applySyncIdTable(db.financialInstitutions, merged.stores.financialInstitutions)
    await applySyncIdTable(db.vacations, merged.stores.vacations)

    await applyNaturalKeyTable(db.categories, merged.stores.categories, 'name')
    await applyNaturalKeyTable(db.businessCategories, merged.stores.businessCategories, 'business')
    await applyNaturalKeyTable(db.appSettings, merged.stores.appSettings, 'key')
    await applyNaturalKeyTable(db.ypayDocuments, merged.stores.ypayDocuments, 'transactionId')

    // --- FK chain tables: process in dependency order ---
    // 1. Businesses (parent — no FK dependencies, has unique 'name' index)
    const businessSyncIdToLocalId = await applyFKParentTable(db.businesses, merged.stores.businesses, 'name')

    // 2. Projects (FK: businessId → businesses)
    const projectSyncIdToLocalId = await applyFKChildTable(
      db.projects,
      merged.stores.projects,
      '_businessSyncId',
      'businessId',
      businessSyncIdToLocalId,
    )

    // 3. HarvestTasks (FK: projectId → projects)
    const taskSyncIdToLocalId = await applyFKChildTable(
      db.harvestTasks,
      merged.stores.harvestTasks,
      '_projectSyncId',
      'projectId',
      projectSyncIdToLocalId,
    )

    // 4. TimeEntries (FK: taskId → harvestTasks)
    await applyFKChildTable(
      db.timeEntries,
      merged.stores.timeEntries,
      '_taskSyncId',
      'taskId',
      taskSyncIdToLocalId,
    )
  })

  // --- localStorage stores ---
  if (merged.stores.subjectStore) {
    await subjectStore.import(merged.stores.subjectStore)
  }
  timerStore.import(merged.stores.timerStore ?? null)

  console.log('[ApplyMergedBackup] Applied successfully')
}

/**
 * Apply a syncId-based table: match by syncId, update or insert.
 */
async function applySyncIdTable(table: any, mergedRecords: any[] | undefined): Promise<void> {
  if (!mergedRecords?.length) return

  // Build local syncId → record map
  const localRecords = await table.toArray()
  const localBySyncId = new Map<string, any>()
  for (const r of localRecords) {
    if (r.syncId) localBySyncId.set(r.syncId, r)
  }

  for (const merged of mergedRecords) {
    if (!merged.syncId) continue

    const local = localBySyncId.get(merged.syncId)
    if (local) {
      // Exists locally — update if merged is newer or has deletedAt that local doesn't
      if (shouldUpdate(local, merged)) {
        const { id: _id, ...updates } = merged
        await table.update(local.id, updates)
      }
    } else {
      // New record — insert (strip id so auto-increment assigns one)
      const { id: _id, ...record } = merged
      await table.add(record)
    }
  }
}

/**
 * Apply a natural-key table: match by the key field, update or insert.
 */
async function applyNaturalKeyTable(table: any, mergedRecords: any[] | undefined, keyField: string): Promise<void> {
  if (!mergedRecords?.length) return

  const localRecords = await table.toArray()
  const localByKey = new Map<string, any>()
  for (const r of localRecords) {
    const key = r[keyField]
    if (key != null) localByKey.set(String(key), r)
  }

  for (const merged of mergedRecords) {
    const key = merged[keyField]
    if (key == null) continue

    const local = localByKey.get(String(key))
    if (local) {
      if (shouldUpdate(local, merged)) {
        const { id: _id, ...updates } = merged
        await table.update(local.id, updates)
      }
    } else {
      const { id: _id, ...record } = merged
      await table.add(record)
    }
  }
}

/**
 * Apply a FK chain parent table (businesses).
 * Returns a syncId → localId map for child tables to use.
 */
async function applyFKParentTable(
  table: any,
  mergedRecords: any[] | undefined,
  uniqueKeyField?: string,
): Promise<Map<string, number>> {
  const syncIdToLocalId = new Map<string, number>()
  if (!mergedRecords?.length) return syncIdToLocalId

  const localRecords = await table.toArray()
  const localBySyncId = new Map<string, any>()
  const localByUniqueKey = new Map<string, any>()
  for (const r of localRecords) {
    if (r.syncId) {
      localBySyncId.set(r.syncId, r)
      syncIdToLocalId.set(r.syncId, r.id)
    }
    if (uniqueKeyField && r[uniqueKeyField] != null) {
      localByUniqueKey.set(String(r[uniqueKeyField]), r)
    }
  }

  for (const merged of mergedRecords) {
    if (!merged.syncId) continue

    // Match by syncId first, then fall back to unique key
    let local = localBySyncId.get(merged.syncId)
    if (!local && uniqueKeyField && merged[uniqueKeyField] != null) {
      local = localByUniqueKey.get(String(merged[uniqueKeyField]))
    }

    if (local) {
      if (shouldUpdate(local, merged)) {
        const { id: _id, ...updates } = merged
        await table.update(local.id, updates)
      }
      syncIdToLocalId.set(merged.syncId, local.id)
    } else {
      const { id: _id, ...record } = merged
      const newId = await table.add(record)
      syncIdToLocalId.set(merged.syncId, newId)
    }
  }

  return syncIdToLocalId
}

/**
 * Apply a FK chain child table (projects, harvestTasks, timeEntries).
 * Remaps the FK field using the parent's syncId → localId map.
 * Returns a syncId → localId map for the next level of children.
 */
async function applyFKChildTable(
  table: any,
  mergedRecords: any[] | undefined,
  parentSyncIdField: string, // e.g. '_businessSyncId'
  fkField: string, // e.g. 'businessId'
  parentSyncIdToLocalId: Map<string, number>,
): Promise<Map<string, number>> {
  const syncIdToLocalId = new Map<string, number>()
  if (!mergedRecords?.length) return syncIdToLocalId

  const localRecords = await table.toArray()
  const localBySyncId = new Map<string, any>()
  for (const r of localRecords) {
    if (r.syncId) {
      localBySyncId.set(r.syncId, r)
      syncIdToLocalId.set(r.syncId, r.id)
    }
  }

  for (const merged of mergedRecords) {
    if (!merged.syncId) continue

    // Clean annotation field before writing to DB
    const parentSyncId: string | null = merged[parentSyncIdField] ?? null
    const { [parentSyncIdField]: _annotation, id: _id, ...cleanRecord } = merged

    // Remap FK if parent syncId is available
    if (parentSyncId && parentSyncIdToLocalId.has(parentSyncId)) {
      cleanRecord[fkField] = parentSyncIdToLocalId.get(parentSyncId)
    }
    // If no parent syncId annotation, keep the FK value as-is (local records already have correct FKs)

    const local = localBySyncId.get(merged.syncId)
    if (local) {
      if (shouldUpdate(local, merged)) {
        await table.update(local.id, cleanRecord)
      }
      syncIdToLocalId.set(merged.syncId, local.id)
    } else {
      const newId = await table.add(cleanRecord)
      syncIdToLocalId.set(merged.syncId, newId)
    }
  }

  return syncIdToLocalId
}

/**
 * Check if the local record should be updated with the merged version.
 */
function shouldUpdate(local: any, merged: any): boolean {
  // If merged has deletedAt and local doesn't → propagate deletion
  if (merged.deletedAt && !local.deletedAt) return true

  // If merged has a newer updatedAt → update
  const localTime = local.updatedAt || local.lastUpdated || local.importedAt || local.createdAt || ''
  const mergedTime = merged.updatedAt || merged.lastUpdated || merged.importedAt || merged.createdAt || ''
  return mergedTime > localTime
}
