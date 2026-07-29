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
 * FK fields are syncId-based (stable UUIDs) throughout the schema, so cloud
 * records carry the correct FK value as-is — no per-merge FK remap needed.
 */

import { db } from '@/app/db/financeDB'
import { initializeAppSettings } from '@/app/services/appSettingsService'
import type { BackupData } from './backupService'
import { SYNCED_DB_TABLES, getSyncedDexieTables, getUniqueKeyTables } from './syncedTables'
import { remapLegacyFks } from './migrations/remapLegacyFks'
import { convertLegacySubjectStoreBlob } from './migrations/legacySubjectStoreConversion'

/**
 * Ingress normalization for a legacy-shape backup (pre the 2026-07-28 FK
 * int->syncId migration). The cloud copy is written by whatever client
 * uploaded last — until every environment runs post-migration code (and even
 * after, for old export files), incoming stores can carry:
 *   - FK fields holding local ints (remapped here against the backup's OWN
 *     parent rows — self-contained, idempotent, no-op for syncId strings)
 *   - subjects still in the legacy `subjectStore` blob with no `subjects`
 *     array at all (converted here into rows the generic merge loop can
 *     ingest; fresh syncIds are assigned — repeat merges can't duplicate
 *     them because the loop's content-key dedup for subjects matches on
 *     name|type|businessId, not syncId)
 * This is one-way ingress normalization, NOT the old per-merge int<->syncId
 * translation bookkeeping (FK_RELATIONS) that was deleted in the cutover —
 * it self-eliminates once every data source is post-migration shape.
 */
function normalizeIncomingStores(rawStores: Record<string, any>): Record<string, any> {
  const { stores, warnings } = remapLegacyFks(rawStores || {})
  if (warnings.length > 0) {
    console.warn(`[ApplyCloud] ingress FK normalization: ${warnings.length} warning(s):\n${warnings.join('\n')}`)
  }

  const hasSubjectsArray = Array.isArray(stores.subjects) && stores.subjects.length > 0
  if (!hasSubjectsArray && stores.subjectStore) {
    const converted = convertLegacySubjectStoreBlob(stores.subjectStore)
    const { stores: normalized } = remapLegacyFks({
      subjects: converted.subjects,
      subjectClassifications: converted.subjectClassifications,
      businesses: stores.businesses || [],
      transactions: stores.transactions || [],
    })
    stores.subjects = normalized.subjects.map((r: any) => ({ ...r, syncId: r.syncId || crypto.randomUUID() }))
    if (!Array.isArray(stores.subjectClassifications) || stores.subjectClassifications.length === 0) {
      stores.subjectClassifications = normalized.subjectClassifications.map((r: any) => ({ ...r, syncId: r.syncId || crypto.randomUUID() }))
    }
    console.log(`[ApplyCloud] converted legacy subjectStore blob: ${stores.subjects.length} subjects, ${stores.subjectClassifications.length} classifications`)
  }

  return stores
}

// Content-based dedup keys (detect same record imported on two devices with different syncIds)
const CONTENT_KEY_FNS: Record<string, (r: any) => string> = {
  transactions: (r) => `${r.type}|${r.date}|${r.amount}|${r.description}|${r.accountNumber ?? ''}|${r.cardNumber ?? ''}|${r.month}|${r.chargingDate ?? ''}|${r.balance ?? ''}`,
  importedFiles: (r) => `${r.fileName}|${r.fileType}|${r.processingMonth}|${r.accountNumber ?? ''}|${r.cardNumber ?? ''}`,
  capitalEntries: (r) => `${r.date}|${r.institution}|${r.accountNumber}|${r.description}|${r.assetType}`,
  categories: (r) => `${r.name}|${r.type}`,
  tasks: (r) => `${r.title}|${r.createdAt}`,
  taxDocuments: (r) => `${r.businessId}|${r.month}|${r.fileName}`,
  subjects: (r) => `${r.name}|${r.type}|${r.businessId ?? 'household'}`,
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
  // Normalize a legacy-shape backup at ingress (int FKs -> syncIds, legacy
  // subjectStore blob -> subjects rows). No-op for post-migration backups.
  const cloudStores = normalizeIncomingStores(cloud.stores as any)

  // Combine deletion ledgers from both local and cloud appSettings
  const localAppSettings: any[] = await db.appSettings.toArray()
  const localDeletions = extractDeletionLedger(localAppSettings)
  const cloudDeletions = extractDeletionLedger(cloudStores.appSettings || [])

  // Union of both ledgers
  const allDeletions: Record<string, Set<string>> = {}
  const allTables = new Set([...Object.keys(localDeletions), ...Object.keys(cloudDeletions)])
  for (const table of allTables) {
    allDeletions[table] = new Set([...(localDeletions[table] || []), ...(cloudDeletions[table] || [])])
  }

  // Compute (and cache) the derived unique-key map once before entering the
  // transaction — it reads db.tables which is safe outside rw context.
  const uniqueKeyTables = getUniqueKeyTables()

  await db.transaction('rw',
    getSyncedDexieTables(),
    async () => {
      for (const tableName of SYNCED_DB_TABLES) {
        const table = (db as any)[tableName]
        let cloudRecords: any[] = cloudStores[tableName] || []
        // Defensive filter: legacy cloud backups (written before we filtered
        // google_* keys at export) may still carry stale Google OAuth tokens.
        // Strip them on import too — local tokens win.
        if (tableName === 'appSettings') {
          cloudRecords = cloudRecords.filter((r: any) => !String(r?.key || '').startsWith('google_'))
        }
        const deletedSyncIds = allDeletions[tableName] || new Set<string>()

        // Resurrection guard: if the incoming cloud data still carries a
        // record whose syncId our ledger marked deleted, the tombstone is
        // stale — some device is actively re-syncing live data for it (e.g.
        // a shared-business scoped backup that legitimately still has the
        // business + its children). Prefer the live cloud data over an old
        // tombstone and drop it from this run's effective deletion set (this
        // mutates the same Set stored in allDeletions, so the cleanup also
        // persists to the ledger below) — otherwise step 1 deletes the local
        // record and step 2 then skips re-inserting it as "already deleted",
        // permanently losing data that's still live on the syncing device.
        // Root-caused 2026-07-22: a shared-business sync deleted a live
        // business plus its projects/invoices this way — the business row
        // and a years-old tombstone for it had been coexisting locally,
        // inert until this table's deletion-ledger step finally ran.
        for (const cloudRec of cloudRecords) {
          if (cloudRec.syncId && deletedSyncIds.has(cloudRec.syncId)) {
            console.warn(`[ApplyCloud] ${tableName}: dropping stale tombstone for syncId ${cloudRec.syncId} — cloud still has live data for it`)
            deletedSyncIds.delete(cloudRec.syncId)
          }
        }

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

          const existingLocal = localBySyncId.get(cloudRec.syncId)

          if (existingLocal) {
            // Record exists locally — update if cloud is newer, else keep local
            const cloudTime = getTimestamp(cloudRec)
            const localTime = getTimestamp(existingLocal)
            if (cloudTime > localTime) {
              const { id: _dropId, syncId: _dropSyncId, ...updates } = cloudRec
              await table.update(existingLocal.id, updates)
              updated++
            } else {
              skipped++
            }
          } else {
            // Check content dedup — same data, different syncId
            if (contentKeyFn) {
              const contentKey = contentKeyFn(cloudRec)
              const localMatch = localByContentKey.get(contentKey)
              if (localMatch) {
                // Already have this content locally — skip
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
                  continue
                }
              }
            }

            // New record — for auto-increment tables, drop id and let Dexie
            // assign a new one; for string-PK tables (e.g. chats, chatMessages)
            // the id IS the sync key, so preserve it via put().
            if (typeof cloudRec.id === 'string') {
              await table.put(cloudRec)
            } else {
              const { id: _dropId, ...withoutId } = cloudRec
              await table.add(withoutId)
            }
            inserted++
          }
        }

        if (inserted > 0 || updated > 0) {
          console.log(`[ApplyCloud] ${tableName}: +${inserted} inserted, ~${updated} updated, =${skipped} skipped`)
        }
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

  // subjects/subjectClassifications are now real Dexie synced tables, handled
  // generically by the transaction loop above (per-record syncId merge +
  // FK_RELATIONS remap) — no bespoke post-transaction step needed anymore.
  // The old "import whole blob only if cloud is newer" bespoke logic here is
  // exactly what let a thinner-but-newer remote clobber a richer local
  // subjectStore and wipe every business-scoped subject (data-loss incident
  // 2026-07-11) — the generic per-record merge is the actual fix.
  //
  // timerStore's replacement (appSettings key `activeTimer`) is part of the
  // generic appSettings sync above too. Local timer state winning over an
  // incoming cloud value on an active session is a UI-layer concern (the
  // active-timer UI reads its own live state, not a mid-session cloud pull),
  // not something the storage layer needs to special-case.

  await initializeAppSettings()
}
