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
import { SYNCED_DB_TABLES, getSyncedDexieTables, getUniqueKeyTables } from './syncedTables'

// Content-based dedup keys (detect same record imported on two devices with different syncIds)
const CONTENT_KEY_FNS: Record<string, (r: any) => string> = {
  transactions: (r) => `${r.type}|${r.date}|${r.amount}|${r.description}|${r.accountNumber ?? ''}|${r.cardNumber ?? ''}|${r.month}|${r.chargingDate ?? ''}|${r.balance ?? ''}`,
  importedFiles: (r) => `${r.fileName}|${r.fileType}|${r.processingMonth}|${r.accountNumber ?? ''}|${r.cardNumber ?? ''}`,
  capitalEntries: (r) => `${r.date}|${r.institution}|${r.accountNumber}|${r.description}|${r.assetType}`,
  categories: (r) => `${r.name}|${r.type}`,
  tasks: (r) => `${r.title}|${r.createdAt}`,
  taxDocuments: (r) => `${r.businessId}|${r.month}|${r.fileName}`,
}

// Parent→child FK relationships for cloud-only children. Each table may have
// multiple FK fields — the apply loop iterates over all of them and remaps each.
//
// Why this matters for partner-paid expenseDocuments (#74): a row carries both
// `transactionId` AND `businessId`. For bank-tx-backed docs, transactionId is
// the FK that matters and businessId is derived. For PARTNER-PAID docs
// (transactionId undefined, paidByUid set), `businessId` is the ONLY anchor —
// dropping it from the remap means the doc's businessId is written verbatim
// on sync-in, and once the local `businesses` autoinc ids shift (re-create,
// merge order, multi-device) the partner-paid row visibly migrates to whichever
// business now owns the stale int. Both must be in this list, both get remapped.
type FkRelation = { fkField: string; parentTable: string }
const FK_RELATIONS: Record<string, FkRelation[]> = {
  projects: [{ fkField: 'businessId', parentTable: 'businesses' }],
  harvestTasks: [{ fkField: 'projectId', parentTable: 'projects' }],
  timeEntries: [{ fkField: 'taskId', parentTable: 'harvestTasks' }],
  // ypayDocuments stores transactionId as STRING (`String(t.id)`). expenseDocuments
  // stores it as NUMBER. The lookup logic below coerces string-numeric keys to
  // number for the cloud-id map (transactions have numeric ids), then writes
  // the resolved local id back in the same shape the field originally had.
  ypayDocuments: [{ fkField: 'transactionId', parentTable: 'transactions' }],
  expenseDocuments: [
    { fkField: 'transactionId', parentTable: 'transactions' },
    { fkField: 'businessId', parentTable: 'businesses' },
  ],
  taxDocuments: [{ fkField: 'businessId', parentTable: 'businesses' }],
  advancePayments: [{ fkField: 'businessId', parentTable: 'businesses' }],
  businessTasks: [{ fkField: 'businessId', parentTable: 'businesses' }],
  // categories.businessId points at the owner's local int business.id; without
  // remap, sharees couldn't see ExpenseTab/IncomeTab/SettlementSummary content
  // because all of those filter by `c.businessId === businessId`. Sharee's
  // local Dexie int id differs from owner's — the parentTable lookup rewrites
  // it to the sharee's matching business.id by syncId. Bug surfaced when
  // y25131 received the Agents Head shared backup but expenses + settlement
  // tabs rendered empty (incomes worked because of a different code path).
  categories: [{ fkField: 'businessId', parentTable: 'businesses' }],
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

  // Pre-build cloud id→syncId maps for parent tables (for FK resolution).
  // Deduplicate across all FK relations — multiple child tables may share the
  // same parent (e.g. businesses), and multiple FKs on one child can also point
  // to different parents.
  const cloudIdToSyncId: Record<string, Map<number, string>> = {}
  const allParentTables = new Set<string>()
  for (const fks of Object.values(FK_RELATIONS)) {
    for (const fk of fks) allParentTables.add(fk.parentTable)
  }
  for (const parentTable of allParentTables) {
    const map = new Map<number, string>()
    for (const rec of ((cloud.stores as any)[parentTable] || [])) {
      if (rec.id !== undefined && rec.syncId) map.set(rec.id, rec.syncId)
    }
    cloudIdToSyncId[parentTable] = map
  }

  // Compute (and cache) the derived unique-key map once before entering the
  // transaction — it reads db.tables which is safe outside rw context.
  const uniqueKeyTables = getUniqueKeyTables()

  await db.transaction('rw',
    getSyncedDexieTables(),
    async () => {
      for (const tableName of SYNCED_DB_TABLES) {
        const table = (db as any)[tableName]
        let cloudRecords: any[] = (cloud.stores as any)[tableName] || []
        // Defensive filter: legacy cloud backups (written before we filtered
        // google_* keys at export) may still carry stale Google OAuth tokens.
        // Strip them on import too — local tokens win.
        if (tableName === 'appSettings') {
          cloudRecords = cloudRecords.filter((r: any) => !String(r?.key || '').startsWith('google_'))
        }
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
        const uniqueKeyField = uniqueKeyTables[tableName]
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

          // Resolve FK(s): each cloud parent ID → local parent ID via syncId.
          // A table may have multiple FK fields (e.g. expenseDocuments carries
          // both transactionId and businessId) — remap each independently.
          const fkInfoList = FK_RELATIONS[tableName] || []
          let orphaned = false
          for (const fkInfo of fkInfoList) {
            if (cloudRec[fkInfo.fkField] === undefined) continue
            const parentTable = fkInfo.parentTable
            const parentMap = syncIdToLocalId[parentTable]
            const cloudParentMap = cloudIdToSyncId[parentTable]
            if (!parentMap || !cloudParentMap) continue
            // Some FK columns store the parent id as a string (e.g.
            // ypayDocuments.transactionId = String(t.id)). The cloud-id map
            // is keyed by the parent's raw id type (number for transactions),
            // so coerce numeric-strings to number for the lookup. Preserve
            // the FK's original type when we write the resolved id back so
            // downstream code (UI maps, etc.) keeps working.
            const fkRaw = cloudRec[fkInfo.fkField]
            const fkWasString = typeof fkRaw === 'string'
            const lookupKey = fkWasString && /^\d+$/.test(fkRaw) ? Number(fkRaw) : fkRaw
            const parentSyncId = cloudParentMap.get(lookupKey)
            if (!parentSyncId) continue
            const localParentId = parentMap.get(parentSyncId)
            if (localParentId !== undefined) {
              cloudRec[fkInfo.fkField] = fkWasString ? String(localParentId) : localParentId
            } else {
              // Parent not found locally. Two cases:
              //   (a) parent was deleted+tombstoned locally → child is officially
              //       orphaned. Tombstone the child too so cloud stops re-broadcasting
              //       it on every sync.
              //   (b) parent simply hasn't synced down yet → keep the warn so a
              //       genuine missing-pull bug stays visible.
              if (allDeletions[parentTable]?.has(parentSyncId)) {
                if (cloudRec.syncId) {
                  if (!allDeletions[tableName]) allDeletions[tableName] = new Set()
                  allDeletions[tableName].add(cloudRec.syncId)
                }
              } else {
                console.warn(`[ApplyCloud] Orphan ${tableName}: parent syncId ${parentSyncId} not in local (fk=${fkInfo.fkField})`)
              }
              orphaned = true
              break
            }
          }
          if (orphaned) continue

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
              // Timestamp says local wins for content — but if any FK we
              // just re-resolved differs from what local has, force-patch
              // those FK fields alone. FKs are structural (point to local int
              // ids that vary per device); a stale one breaks all the by-
              // business filters in ExpenseTab/IncomeTab/SettlementSummary.
              // Surfaced after #54 added categories to FK_RELATIONS; extended
              // in #74 to cover ALL FKs on a table (was a single fkInfo,
              // which silently skipped the businessId remap for partner-paid
              // expenseDocuments, causing them to drift between businesses).
              const fkPatches: Record<string, any> = {}
              for (const fkInfo of fkInfoList) {
                if (cloudRec[fkInfo.fkField] !== undefined &&
                    cloudRec[fkInfo.fkField] !== existingLocal[fkInfo.fkField]) {
                  fkPatches[fkInfo.fkField] = cloudRec[fkInfo.fkField]
                }
              }
              if (Object.keys(fkPatches).length > 0) {
                await table.update(existingLocal.id, fkPatches)
                updated++
              } else {
                skipped++
              }
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

  // Import non-DB stores via a per-record MERGE, never a timestamp-gated
  // overwrite. The old "import whole blob only if cloud is newer" logic let a
  // thinner-but-newer remote clobber a richer local subjectStore and wiped
  // every business-scoped subject (data-loss incident 2026-07-11). Merging
  // unions both sides so no local-only subject is ever lost — and it runs
  // unconditionally (both directions are safe under a union).
  if (cloud.stores.subjectStore) {
    await subjectStore.import(cloud.stores.subjectStore, { merge: true })
  }
  // Local timer always wins — don't restore cloud timer (user may have stopped it locally)
  // timerStore is only imported during full restore (importAllStores), not incremental sync

  await initializeAppSettings()
}
